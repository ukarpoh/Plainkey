import { ViaKeyboard, ViaUnhandledError, LIGHTING_CHANNEL, LIGHTING_VALUE } from './via.js';
import { KeycodeSet, MOD_BITS, hex } from './keycodes.js';
import { parseKLE, boundingBox, optionSpecs, packOptions, unpackOptions, isVisible } from './layout.js';

const DEFAULT_DEFINITION = './definitions/neo75.json';
const MIN_UNIT = 30;
const MAX_UNIT = 58;
const SILENT_TESTER_MS = 8000;

// QMK's default RGB-matrix effect order. Firmware can compile effects out, which shifts the indices.
const RGB_MATRIX_EFFECTS = [
  'All off', 'Solid color', 'Alphas mods', 'Gradient up/down', 'Gradient left/right', 'Breathing',
  'Band saturation', 'Band value', 'Pinwheel saturation', 'Pinwheel value', 'Spiral saturation',
  'Spiral value', 'Cycle all', 'Cycle left/right', 'Cycle up/down', 'Rainbow moving chevron',
  'Cycle out/in', 'Cycle out/in dual', 'Cycle pinwheel', 'Cycle spiral', 'Dual beacon',
  'Rainbow beacon', 'Rainbow pinwheels', 'Raindrops', 'Jellybean raindrops', 'Hue breathing',
  'Hue pendulum', 'Hue wave', 'Typing heatmap', 'Digital rain', 'Solid reactive simple',
  'Solid reactive', 'Solid reactive wide', 'Solid reactive multi wide', 'Solid reactive cross',
  'Solid reactive multi cross', 'Solid reactive nexus', 'Solid reactive multi nexus', 'Splash',
  'Multi splash', 'Solid splash', 'Solid multi splash',
];

const state = {
  def: null,
  keys: [],
  box: null,
  specs: [],
  options: [],
  kc: new KeycodeSet(),
  kb: null,
  protocol: null,
  layers: 0,
  layer: 0,
  keymap: null,
  selected: null,
  paletteGroup: 'basic',
  search: '',
  mods: 0,
  layoutOpen: false,
  history: [],
  tab: 'keymap',
  lighting: null,
  tested: new Set(),
  pressed: new Set(),
  testerNote: null,
};

const $ = (sel) => document.querySelector(sel);

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

// replaceChildren() would print null as text; skip empty slots like h() does.
function fill(el, ...children) {
  el.replaceChildren(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
}

function toast(message, { kind = 'info', action, onAction } = {}) {
  const el = h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' },
    h('span', {}, message),
    action ? h('button', { class: 'toast-action', onclick: () => { el.remove(); onAction(); } }, action) : null);
  $('#toasts').append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 300);
  }, kind === 'error' ? 7000 : action ? 6000 : 3000);
}

function reportError(err) {
  console.error(err);
  toast(err.message || String(err), { kind: 'error' });
}

function pageHead(title, lede, ...actions) {
  return h('header', { class: 'page-head' },
    h('div', {},
      h('h1', {}, title),
      lede ? h('p', { class: 'lede' }, lede) : null),
    actions.length ? h('div', { class: 'page-actions' }, actions) : null);
}

// ---------- definition ----------

function loadDefinition(def) {
  state.def = def;
  state.keys = parseKLE(def.layouts.keymap);
  state.box = boundingBox(state.keys);
  state.specs = optionSpecs(def.layouts.labels);
  state.options = state.specs.map(() => 0);
  state.kc = new KeycodeSet({ protocol: state.protocol ?? 12, customKeycodes: def.customKeycodes });
  state.selected = null;
  state.history = [];
  $('#def-name').textContent = def.name;
  document.title = `${def.name} · Plainkey`;
  renderAll();
}

async function fetchDefaultDefinition() {
  try {
    const res = await fetch(DEFAULT_DEFINITION, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    loadDefinition(await res.json());
  } catch (err) {
    toast(`Couldn’t load ${DEFAULT_DEFINITION} (${err.message}). Choose a definition file in the footer.`, { kind: 'error' });
  }
}

async function loadDefinitionFile(file) {
  try {
    const def = JSON.parse(await file.text());
    if (!def.matrix || !def.layouts?.keymap) throw new Error('That file isn’t a VIA definition (it needs matrix and layouts.keymap).');
    loadDefinition(def);
    if (state.kb) await readKeyboard();
    toast(`Using the ${def.name} definition`);
  } catch (err) {
    reportError(err);
  }
}

// ---------- device ----------

const vid = () => parseInt(state.def.vendorId, 16);
const pid = () => parseInt(state.def.productId, 16);

async function connect(kb) {
  if (!kb) return;
  try {
    await kb.open();
    state.kb = kb;
    state.protocol = await kb.getProtocolVersion();
    state.kc = new KeycodeSet({ protocol: state.protocol, customKeycodes: state.def.customKeycodes });
    await readKeyboard();
    toast(`${kb.name} connected`);
  } catch (err) {
    state.kb = null;
    reportError(err);
  }
  renderAll();
  if (state.tab === 'tester') runTester();
}

async function readKeyboard() {
  const kb = state.kb;
  const { rows, cols } = state.def.matrix;
  setBusy(0);
  try {
    state.layers = await kb.getLayerCount();
    if (state.specs.length) {
      try {
        state.options = unpackOptions(await kb.getLayoutOptions(), state.specs);
      } catch (err) {
        if (!(err instanceof ViaUnhandledError)) throw err;
      }
    }
    state.keymap = await kb.readKeymap(state.layers, rows, cols, setBusy);
    state.layer = Math.min(state.layer, state.layers - 1);
    state.history = [];
    state.lighting = await probeLighting(kb);
  } finally {
    setBusy(null);
  }
  renderAll();
}

async function probeLighting(kb) {
  if (state.protocol < 12) return null;
  for (const channel of [LIGHTING_CHANNEL.RGB_MATRIX, LIGHTING_CHANNEL.RGBLIGHT]) {
    try {
      const [brightness] = await kb.getCustomValue(channel, LIGHTING_VALUE.BRIGHTNESS);
      const [effect] = await kb.getCustomValue(channel, LIGHTING_VALUE.EFFECT);
      const [speed] = await kb.getCustomValue(channel, LIGHTING_VALUE.SPEED);
      const [hue, sat] = await kb.getCustomValue(channel, LIGHTING_VALUE.COLOR, 2);
      return { channel, brightness, effect, speed, hue, sat, dirty: false };
    } catch (err) {
      if (!(err instanceof ViaUnhandledError)) throw err;
    }
  }
  return null;
}

async function disconnect() {
  const kb = state.kb;
  state.kb = null;
  state.keymap = null;
  state.lighting = null;
  state.protocol = null;
  state.selected = null;
  state.history = [];
  if (kb) await kb.close().catch(() => {});
  renderAll();
}

// fraction in [0, 1] shows the bar; null hides it.
function setBusy(fraction) {
  const el = $('#busy');
  el.hidden = fraction === null;
  if (fraction !== null) el.firstElementChild.style.width = `${Math.max(4, fraction * 100)}%`;
}

// ---------- keymap editing ----------

function visibleKeys() {
  return state.keys
    .filter((k) => isVisible(k, state.options))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

function codeAt(layer, key) {
  return state.keymap?.[layer]?.[key.row]?.[key.col];
}

async function writeKey(layer, key, code) {
  await state.kb.setKeycode(layer, key.row, key.col, code);
  state.keymap[layer][key.row][key.col] = code;
}

async function assign(code) {
  const key = state.selected;
  if (!key) return toast('Choose a key on the keyboard first.');
  if (!state.kb) return toast('Connect your keyboard first.');
  const layer = state.layer;
  const old = codeAt(layer, key);
  if (old === code) return advanceSelection();
  try {
    await writeKey(layer, key, code);
    state.history.push({ layer, key, old, code });
    toast(`${state.kc.describe(old).name} → ${state.kc.describe(code).name}`, { action: 'Undo', onAction: undo });
    advanceSelection();
  } catch (err) {
    reportError(err);
  }
}

function advanceSelection() {
  const list = visibleKeys();
  state.selected = list[list.indexOf(state.selected) + 1] ?? null;
  renderKeymapTab({ focusSelected: true });
}

async function undo() {
  const last = state.history.pop();
  if (!last || !state.kb) return;
  try {
    await writeKey(last.layer, last.key, last.old);
    state.layer = last.layer;
    state.selected = isVisible(last.key, state.options) ? last.key : null;
    toast(`Restored ${state.kc.describe(last.old).name}`);
    renderKeymapTab({ focusSelected: true });
  } catch (err) {
    reportError(err);
  }
}

async function changeOption(index, value) {
  state.options[index] = value;
  if (state.selected && !isVisible(state.selected, state.options)) state.selected = null;
  if (state.kb) {
    try {
      await state.kb.setLayoutOptions(packOptions(state.options, state.specs));
    } catch (err) {
      reportError(err);
    }
  }
  renderKeymapTab();
  renderTesterTab();
}

// Arrow-key movement over the physical layout.
function neighbour(key, direction) {
  const list = visibleKeys();
  const cx = (k) => k.x + k.w / 2;
  const cy = (k) => k.y + k.h / 2;
  if (direction === 'ArrowLeft' || direction === 'ArrowRight') {
    const sameRow = list.filter((k) => Math.abs(cy(k) - cy(key)) < 0.5 || (k.y <= cy(key) && cy(key) < k.y + k.h));
    const sorted = sameRow.sort((a, b) => a.x - b.x);
    const i = sorted.indexOf(key);
    return sorted[direction === 'ArrowLeft' ? i - 1 : i + 1] ?? key;
  }
  const sign = direction === 'ArrowUp' ? -1 : 1;
  const candidates = list.filter((k) => k !== key && sign * (cy(k) - cy(key)) > 0.4);
  candidates.sort((a, b) =>
    Math.abs(cy(a) - cy(key)) - Math.abs(cy(b) - cy(key)) || Math.abs(cx(a) - cx(key)) - Math.abs(cx(b) - cx(key)));
  const nearestY = candidates[0] && cy(candidates[0]);
  const row = candidates.filter((k) => Math.abs(cy(k) - nearestY) < 0.5);
  row.sort((a, b) => Math.abs(cx(a) - cx(key)) - Math.abs(cx(b) - cx(key)));
  return row[0] ?? key;
}

// ---------- rendering ----------

function renderAll() {
  renderHeader();
  renderTabs();
  renderKeymapTab();
  renderLightingTab();
  renderTesterTab();
  renderBackupTab();
}

function renderHeader() {
  const status = $('#status');
  const text = status.querySelector('.status-text');
  const btn = $('#connect');
  if (!ViaKeyboard.isSupported()) {
    status.dataset.state = 'warn';
    text.textContent = 'Needs Chrome or Edge';
    btn.disabled = true;
    return;
  }
  if (state.kb) {
    status.dataset.state = 'on';
    text.textContent = `Connected · ${state.layers} layers`;
    status.title = `${state.kb.name}, VIA protocol ${state.protocol}`;
    btn.textContent = 'Disconnect';
    btn.className = 'btn btn-quiet btn-small';
  } else {
    status.dataset.state = 'off';
    text.textContent = 'Not connected';
    status.removeAttribute('title');
    btn.textContent = 'Connect';
    btn.className = 'btn btn-primary btn-small';
  }
  btn.disabled = !state.def;
}

function renderTabs() {
  for (const btn of document.querySelectorAll('[data-tab]')) {
    btn.setAttribute('aria-selected', String(btn.dataset.tab === state.tab));
  }
  for (const panel of document.querySelectorAll('[data-panel]')) {
    panel.hidden = panel.dataset.panel !== state.tab;
  }
}

function keyUnit() {
  const available = Math.min($('main').clientWidth, 1120) - 64;
  return Math.max(MIN_UNIT, Math.min(MAX_UNIT, Math.floor(available / state.box.width)));
}

function keyboardView({ legend, interactive = false, keyClass }) {
  const unit = keyUnit();
  const { minX, minY, width, height } = state.box;
  const board = h('div', {
    class: 'board',
    style: { width: `${width * unit}px`, height: `${height * unit}px`, fontSize: `${Math.round(unit * 0.22)}px` },
  });
  for (const key of visibleKeys()) {
    const tone = key.color === '#777777' ? 'accent' : key.color === '#aaaaaa' ? 'mod' : 'alpha';
    const text = legend(key);
    const props = {
      class: `key ${tone} ${keyClass?.(key) ?? ''}`,
      dataset: { index: key.index },
      style: {
        left: `${(key.x - minX) * unit}px`,
        top: `${(key.y - minY) * unit}px`,
        width: `${key.w * unit}px`,
        height: `${key.h * unit}px`,
      },
    };
    const group = interactive
      ? h('button', {
          ...props,
          type: 'button',
          'aria-label': `${text.replace('\n', ' ') || 'Empty'}, matrix ${key.row} ${key.col}`,
          'aria-pressed': String(key === state.selected),
          tabindex: key === state.selected || (!state.selected && key === visibleKeys()[0]) ? '0' : '-1',
          onclick: () => {
            state.selected = state.selected === key ? null : key;
            renderKeymapTab({ focusSelected: true });
          },
          onkeydown: (e) => {
            if (!e.key.startsWith('Arrow')) return;
            e.preventDefault();
            state.selected = neighbour(state.selected ?? key, e.key);
            renderKeymapTab({ focusSelected: true });
          },
        })
      : h('div', props);
    if (key.w2) {
      group.append(h('span', {
        class: 'cap secondary',
        style: {
          left: `${key.x2 * unit + 2}px`,
          top: `${key.y2 * unit + 2}px`,
          width: `${key.w2 * unit - 4}px`,
          height: `${key.h2 * unit - 4}px`,
        },
      }));
    }
    group.append(h('span', { class: 'cap' }, h('span', { class: `legend ${text.length > 6 ? 'small' : ''}` }, text)));
    board.append(group);
  }
  return h('div', { class: 'stage' }, h('div', { class: 'board-scroll' }, board));
}

function connectCard() {
  if (!ViaKeyboard.isSupported()) {
    return h('div', { class: 'card hero' },
      h('h2', {}, 'Open this page in Chrome or Edge'),
      h('p', { class: 'muted' }, 'The configurator talks to your keyboard through WebHID, which Safari and Firefox don’t support.'));
  }
  return h('div', { class: 'card hero' },
    h('h2', {}, `Connect your ${state.def.name}`),
    h('ol', { class: 'steps' },
      h('li', {}, h('strong', {}, 'Use a USB cable. '), 'Bluetooth and 2.4G can’t carry the configuration commands.'),
      h('li', {}, h('strong', {}, 'Close other configurators. '), 'Close the VIA website and any vendor apps.'),
      h('li', {}, h('strong', {}, 'Choose it from the list. '), `Pick “${state.def.name}” in the browser prompt.`)),
    h('button', { class: 'btn btn-primary', onclick: requestConnect }, 'Connect keyboard'));
}

function renderKeymapTab({ focusSelected = false } = {}) {
  const panel = $('[data-panel="keymap"]');
  if (!state.def) {
    fill(panel, pageHead('Keymap', 'Loading the keyboard definition…'));
    return;
  }
  const connected = Boolean(state.kb);

  const layerControl = connected
    ? h('div', { class: 'segmented', role: 'tablist', 'aria-label': 'Layer' },
        Array.from({ length: state.layers }, (_, l) => h('button', {
          role: 'tab',
          'aria-selected': String(l === state.layer),
          onclick: () => { state.layer = l; renderKeymapTab(); },
        }, l === 0 ? 'Base' : `Layer ${l}`)))
    : null;

  const layoutButton = state.specs.length
    ? h('button', {
        class: `btn btn-quiet btn-small ${state.layoutOpen ? 'is-open' : ''}`,
        'aria-expanded': String(state.layoutOpen),
        onclick: () => { state.layoutOpen = !state.layoutOpen; renderKeymapTab(); },
      }, 'Layout', h('span', { class: 'chev', 'aria-hidden': 'true' }, '⌄'))
    : null;

  const layoutPanel = state.layoutOpen
    ? h('div', { class: 'layout-panel' },
        state.specs.map((spec, i) => spec.toggle
          ? h('label', { class: 'switch-row' },
              h('span', {}, spec.name),
              h('input', { type: 'checkbox', role: 'switch', class: 'switch', checked: state.options[i] === 1,
                onchange: (e) => changeOption(i, e.target.checked ? 1 : 0) }))
          : h('div', { class: 'switch-row' },
              h('span', {}, spec.name),
              h('div', { class: 'segmented small' },
                spec.choices.map((c, j) => h('button', {
                  'aria-pressed': String(state.options[i] === j),
                  onclick: () => changeOption(i, j),
                }, c))))))
    : null;

  fill(panel, 
    pageHead('Keymap', connected
      ? 'Select a key, then choose what it does. Changes save to the keyboard as you make them.'
      : 'Connect your keyboard to read and edit its layers.'),
    connected ? null : connectCard(),
    h('div', { class: 'controls' }, layerControl ?? h('span'), layoutButton),
    layoutPanel,
    keyboardView({
      interactive: connected,
      legend: (key) => {
        const code = codeAt(state.layer, key);
        return code === undefined ? '' : state.kc.describe(code).label;
      },
      keyClass: (key) => [
        key === state.selected ? 'selected' : '',
        connected && codeAt(state.layer, key) === 0x01 && state.layer > 0 ? 'trans' : '',
        connected ? '' : 'preview',
      ].join(' '),
    }),
    connected ? renderInspector() : null,
    connected ? renderPalette() : null,
  );

  if (focusSelected && state.selected) {
    panel.querySelector(`.key[data-index="${state.selected.index}"]`)?.focus({ preventScroll: true });
  }
}

function renderInspector() {
  const key = state.selected;
  if (!key) {
    return h('div', { class: 'inspector empty' },
      h('span', { class: 'muted' }, 'No key selected. Click a key, or Tab into the keyboard and use the arrow keys.'));
  }
  const code = codeAt(state.layer, key);
  const info = state.kc.describe(code);
  const input = h('input', {
    type: 'text', class: 'field mono', value: info.name, spellcheck: 'false', autocomplete: 'off',
    'aria-label': 'Keycode', placeholder: 'e.g. LCTL(KC_C)',
  });
  const apply = () => {
    try {
      assign(state.kc.parse(input.value));
    } catch (err) {
      reportError(err);
    }
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
  return h('div', { class: 'inspector' },
    h('div', { class: 'inspector-key' },
      h('span', { class: 'mini-cap' }, info.label || '∅'),
      h('div', {},
        h('div', { class: 'inspector-title' }, info.title ?? info.name),
        h('div', { class: 'muted small' }, `${state.layer === 0 ? 'Base layer' : `Layer ${state.layer}`} · Row ${key.row}, Column ${key.col} · ${hex(code)}`))),
    h('div', { class: 'inspector-edit' },
      input,
      h('button', { class: 'btn btn-primary btn-small', onclick: apply }, 'Apply'),
      h('button', { class: 'btn btn-text btn-small', onclick: () => assign(0x01), title: 'Pass through to the layer below' }, 'Transparent'),
      h('button', { class: 'btn btn-text btn-small', onclick: () => assign(0x00), title: 'Do nothing' }, 'None')),
    h('details', { class: 'syntax' },
      h('summary', {}, 'Advanced keycodes'),
      h('p', { class: 'muted small mono' }, 'KC_A · LCTL(KC_C) · LT(1,KC_SPC) · MT(MOD_LSFT,KC_Z) · MO(2) · TG(1) · MD_BLE1 · 0x5221')));
}

function renderPalette() {
  const groups = state.kc.groups(Math.max(state.layers, 4));
  const grid = h('div', { class: 'palette-keys' });

  const matches = () => {
    const q = state.search.trim().toLowerCase();
    if (!q) return (groups.find((g) => g.id === state.paletteGroup) ?? groups[0]).keys;
    const seen = new Set();
    return groups.flatMap((g) => g.keys).filter((k) => {
      if (seen.has(k.code)) return false;
      seen.add(k.code);
      return [k.label, k.name, k.title].some((s) => s && s.toLowerCase().includes(q));
    });
  };

  const fillGrid = () => {
    const keys = matches();
    grid.replaceChildren(...(keys.length
      ? keys.map((k) => h('button', {
          class: 'pkey',
          title: `${k.name}${k.title ? ` — ${k.title}` : ''}`,
          onclick: () => {
            const wrap = state.mods & 0x0f && k.code > 0x01 && k.code <= 0xff;
            assign(wrap ? state.kc.modWrap(state.mods, k.code) : k.code);
          },
        }, k.label || k.name))
      : [h('p', { class: 'muted no-results' }, `Nothing matches “${state.search}”. Try a QMK name like KC_VOLU, or type it in the field above.`)]));
    chips.hidden = Boolean(state.search.trim());
  };

  const chips = h('div', { class: 'chips', role: 'tablist', 'aria-label': 'Key categories' },
    groups.map((g) => h('button', {
      role: 'tab',
      class: 'chip',
      'aria-selected': String(g.id === (groups.find((x) => x.id === state.paletteGroup) ?? groups[0]).id),
      onclick: () => { state.paletteGroup = g.id; renderKeymapTab(); },
    }, g.title)));

  const search = h('input', {
    type: 'search', class: 'field search', placeholder: 'Search keys: volume, BLE, F13, layer…',
    value: state.search, 'aria-label': 'Search keys',
    oninput: (e) => { state.search = e.target.value; fillGrid(); },
  });

  const modToggle = (bit, label) => h('button', {
    class: 'toggle',
    'aria-pressed': String(Boolean(state.mods & bit)),
    onclick: (e) => {
      state.mods ^= bit;
      e.currentTarget.setAttribute('aria-pressed', String(Boolean(state.mods & bit)));
    },
  }, label);

  fillGrid();
  return h('section', { class: 'palette', 'aria-label': 'Keys' },
    h('div', { class: 'palette-head' },
      h('h2', {}, 'Choose a key'),
      search),
    chips,
    h('div', { class: 'modbar' },
      h('span', { class: 'muted small' }, 'Hold with'),
      modToggle(MOD_BITS.CTL, 'Ctrl'), modToggle(MOD_BITS.SFT, 'Shift'), modToggle(MOD_BITS.ALT, 'Alt'),
      modToggle(MOD_BITS.GUI, 'Win'), h('span', { class: 'divider' }), modToggle(MOD_BITS.RIGHT, 'Right side')),
    grid);
}

function renderLightingTab() {
  const panel = $('[data-panel="lighting"]');
  const L = state.lighting;
  if (!state.kb) {
    fill(panel, pageHead('Lighting', 'Connect your keyboard to see whether its lighting can be changed from here.'));
    return;
  }
  if (!L) {
    fill(panel, 
      pageHead('Lighting', 'This firmware doesn’t accept lighting commands over VIA.'),
      h('div', { class: 'card' },
        h('p', {}, 'You can still control the lights from the keyboard. Put lighting keys on any layer from Keymap: the ',
          h('em', {}, 'Lighting'), ' category has brightness, effect and colour keys, and ', h('em', {}, 'Keyboard'),
          ' has the NEO75 lighting toggle.')));
    return;
  }
  const kb = state.kb;
  let timer = null;
  const push = (id, ...bytes) => {
    clearTimeout(timer);
    timer = setTimeout(() => kb.setCustomValue(L.channel, id, ...bytes).catch(reportError), 60);
    L.dirty = true;
    saveBtn.disabled = false;
  };
  const slider = (label, value, max, onInput, describe = (v) => `${Math.round((v / max) * 100)}%`) => {
    const out = h('output', {}, describe(value));
    return h('label', { class: 'slider-row' },
      h('span', { class: 'slider-label' }, label),
      h('input', { type: 'range', min: 0, max, value, oninput: (e) => {
        const v = Number(e.target.value);
        out.textContent = describe(v);
        onInput(v);
      } }),
      out);
  };
  const swatch = h('span', { class: 'swatch', 'aria-hidden': 'true' });
  const paintSwatch = () => {
    swatch.style.background = `hsl(${(L.hue / 255) * 360} ${(L.sat / 255) * 100}% 55%)`;
  };
  paintSwatch();
  const saveBtn = h('button', { class: 'btn btn-primary', disabled: !L.dirty, onclick: async () => {
    try {
      await kb.saveCustomValues(L.channel);
      L.dirty = false;
      saveBtn.disabled = true;
      toast('Lighting saved');
    } catch (err) {
      reportError(err);
    }
  } }, 'Save');
  const effectName = (v) => (L.channel === LIGHTING_CHANNEL.RGB_MATRIX ? (RGB_MATRIX_EFFECTS[v] ?? `Effect ${v}`) : `Effect ${v}`);

  fill(panel, 
    pageHead('Lighting', 'Changes preview live on the keyboard. Save to keep them after unplugging.', saveBtn),
    h('div', { class: 'card group' },
      slider('Brightness', L.brightness, 255, (v) => { L.brightness = v; push(LIGHTING_VALUE.BRIGHTNESS, v); }),
      slider('Effect', L.effect, 60, (v) => { L.effect = v; push(LIGHTING_VALUE.EFFECT, v); }, effectName),
      slider('Speed', L.speed, 255, (v) => { L.speed = v; push(LIGHTING_VALUE.SPEED, v); })),
    h('div', { class: 'card group' },
      h('div', { class: 'group-title' }, h('span', {}, 'Colour'), swatch),
      slider('Hue', L.hue, 255, (v) => { L.hue = v; paintSwatch(); push(LIGHTING_VALUE.COLOR, L.hue, L.sat); }, (v) => `${Math.round((v / 255) * 360)}°`),
      slider('Saturation', L.sat, 255, (v) => { L.sat = v; paintSwatch(); push(LIGHTING_VALUE.COLOR, L.hue, L.sat); })),
    h('p', { class: 'muted small' }, 'Effect names follow QMK’s default order. If an effect looks different from its name, the firmware numbers them differently.'),
  );
}

let testerRunning = false;

function renderTesterTab() {
  const panel = $('[data-panel="tester"]');
  if (!state.def) return fill(panel, );
  const total = visibleKeys().length;
  const tested = visibleKeys().filter((k) => state.tested.has(`${k.row},${k.col}`)).length;
  const board = keyboardView({
    legend: (key) => {
      const code = codeAt(0, key);
      return code === undefined ? '' : state.kc.describe(code).label;
    },
    keyClass: (key) => {
      const id = `${key.row},${key.col}`;
      return state.pressed.has(id) ? 'pressed' : state.tested.has(id) ? 'tested' : state.kb ? '' : 'preview';
    },
  });
  fill(panel, 
    pageHead('Tester', state.kb
      ? 'Press each key. Keys turn green while held and stay marked once they’ve worked.'
      : 'Connect your keyboard to check that every switch registers.',
      state.kb && !testerRunning ? h('button', { class: 'btn btn-primary btn-small', onclick: runTester }, 'Start') : null,
      h('button', { class: 'btn btn-quiet btn-small', disabled: !state.tested.size, onclick: () => { state.tested.clear(); renderTesterTab(); } }, 'Reset')),
    state.kb
      ? h('div', { class: 'tester-stats' },
          h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': tested },
            h('span', { style: { width: `${(tested / total) * 100}%` } })),
          h('span', { class: 'muted small' }, `${tested} of ${total} keys`),
          h('span', { class: 'legend-chip tested' }, 'Worked'),
          h('span', { class: 'legend-chip pressed' }, 'Held'))
      : null,
    state.testerNote ? h('div', { class: `note ${state.testerNote.kind}`, role: 'status' }, state.testerNote.text) : null,
    board,
  );
}

async function runTester() {
  if (testerRunning || !state.kb || !state.def) return;
  testerRunning = true;
  state.testerNote = null;
  renderTesterTab();
  const { rows, cols } = state.def.matrix;
  const started = Date.now();
  let everPressed = state.tested.size > 0;
  while (state.tab === 'tester' && state.kb) {
    try {
      const pressed = await state.kb.getPressedKeys(rows, cols, state.protocol);
      const changed = pressed.size !== state.pressed.size || [...pressed].some((k) => !state.pressed.has(k));
      state.pressed = pressed;
      pressed.forEach((k) => state.tested.add(k));
      if (pressed.size) everPressed = true;
      if (!everPressed && !state.testerNote && Date.now() - started > SILENT_TESTER_MS) {
        state.testerNote = { kind: 'warn', text:
          'The keyboard answers but hasn’t reported a key press yet. Some firmware hides switch state ' +
          '(QMK built without VIA_INSECURE) to stop keyloggers. If so, the official VIA tester shows nothing either. Keymap editing still works.' };
        renderTesterTab();
      }
      if (changed) renderTesterTab();
    } catch (err) {
      state.testerNote = err instanceof ViaUnhandledError
        ? { kind: 'warn', text: 'This firmware doesn’t support the VIA key tester.' }
        : { kind: 'error', text: `The tester stopped: ${err.message}` };
      console.error(err);
      break;
    }
    await new Promise((r) => setTimeout(r, 30));
  }
  state.pressed = new Set();
  testerRunning = false;
  renderTesterTab();
}

function renderBackupTab() {
  const panel = $('[data-panel="backup"]');
  const connected = Boolean(state.kb);
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) importKeymap(file);
  } });
  const row = (title, text, button) => h('div', { class: 'list-row' },
    h('div', {}, h('div', { class: 'list-title' }, title), h('div', { class: 'muted small' }, text)),
    button);
  fill(panel, 
    pageHead('Backup', connected
      ? 'Keep a copy of your layers before big changes.'
      : 'Connect your keyboard to back up or restore its keymap.'),
    h('div', { class: 'card list' },
      row('Download backup', 'Every layer and the layout options, saved as a JSON file.',
        h('button', { class: 'btn btn-primary btn-small', disabled: !connected, onclick: exportKeymap }, 'Download')),
      row('Restore from file', 'Replaces the keymap on the keyboard with a backup made here.',
        h('button', { class: 'btn btn-quiet btn-small', disabled: !connected, onclick: () => fileInput.click() }, 'Choose file…')),
      row('Reset to default', 'Returns every layer to the firmware’s original keymap.',
        h('button', { class: 'btn btn-danger btn-small', disabled: !connected, onclick: resetKeymap }, 'Reset'))),
    fileInput,
  );
}

async function exportKeymap() {
  const data = {
    format: 'plainkey/1',
    keyboard: state.def.name,
    vendorId: state.def.vendorId,
    productId: state.def.productId,
    protocol: state.protocol,
    matrix: state.def.matrix,
    layoutOptions: packOptions(state.options, state.specs),
    layers: state.keymap,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const a = h('a', { href: URL.createObjectURL(blob), download: `${state.def.name}-keymap-${stamp}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backup downloaded');
}

async function importKeymap(file) {
  try {
    const data = JSON.parse(await file.text());
    const { rows, cols } = state.def.matrix;
    const layers = data.layers;
    const ok = Array.isArray(layers) && layers.length === state.layers &&
      layers.every((l) => l.length === rows && l.every((r) => r.length === cols && r.every((c) => Number.isInteger(c) && c >= 0 && c <= 0xffff)));
    if (!ok) throw new Error(`That backup doesn’t match this keyboard (${state.layers} layers of ${rows}×${cols}).`);
    if (!confirm(`Replace the keymap on your keyboard with “${file.name}”?`)) return;
    setBusy(0);
    await state.kb.writeKeymap(layers, setBusy);
    if (Number.isInteger(data.layoutOptions) && state.specs.length) await state.kb.setLayoutOptions(data.layoutOptions);
    setBusy(null);
    await readKeyboard();
    toast('Keymap restored');
  } catch (err) {
    setBusy(null);
    reportError(err);
  }
}

async function resetKeymap() {
  if (!confirm('Reset every layer to the firmware’s default keymap? Download a backup first if you want to keep your changes.')) return;
  try {
    await state.kb.resetKeymap();
    await readKeyboard();
    toast('Keymap reset to default');
  } catch (err) {
    reportError(err);
  }
}

// ---------- wiring ----------

async function requestConnect() {
  try {
    const kb = await ViaKeyboard.request(vid(), pid());
    if (!kb) return toast('That device doesn’t expose a VIA interface.');
    await connect(kb);
  } catch (err) {
    if (err.name !== 'NotFoundError') reportError(err);
  }
}

// Appearance preference is a per-viewer convenience; storage may be unavailable.
function applyTheme(choice) {
  if (choice === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  for (const btn of document.querySelectorAll('[data-theme-choice]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.themeChoice === choice));
  }
  try {
    localStorage.setItem('theme', choice);
  } catch {}
}

function init() {
  let savedTheme = 'auto';
  try {
    savedTheme = localStorage.getItem('theme') || 'auto';
  } catch {}
  applyTheme(savedTheme);
  for (const btn of document.querySelectorAll('[data-theme-choice]')) {
    btn.addEventListener('click', () => applyTheme(btn.dataset.themeChoice));
  }

  $('#connect').addEventListener('click', () => (state.kb ? disconnect() : requestConnect()));

  $('#def-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) loadDefinitionFile(file);
  });

  for (const btn of document.querySelectorAll('[data-tab]')) {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      renderTabs();
      window.scrollTo({ top: 0 });
      if (state.tab === 'tester') runTester();
    });
  }

  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest?.('input, select, textarea');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing && state.tab === 'keymap') {
      e.preventDefault();
      undo();
    } else if (e.key === 'Escape' && state.selected && !typing) {
      state.selected = null;
      renderKeymapTab();
    }
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!state.def) return;
      renderKeymapTab();
      renderTesterTab();
    }, 120);
  });

  if (ViaKeyboard.isSupported()) {
    navigator.hid.addEventListener('disconnect', (e) => {
      if (state.kb && e.device === state.kb.device) {
        toast('Keyboard disconnected', { kind: 'error' });
        disconnect();
      }
    });
    navigator.hid.addEventListener('connect', (e) => {
      if (!state.kb && state.def && e.device.vendorId === vid() && e.device.productId === pid() && ViaKeyboard.hasViaInterface(e.device)) {
        connect(new ViaKeyboard(e.device));
      }
    });
  }

  renderAll();
  fetchDefaultDefinition().then(async () => {
    if (state.def && ViaKeyboard.isSupported()) connect(await ViaKeyboard.findGranted(vid(), pid()));
  });
}

init();
