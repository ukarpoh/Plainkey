// QMK keycode encoding as VIA uses it.
// VIA protocol >= 12 speaks the QMK 0.19+ keycode ranges; older protocols use the legacy ranges.

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '1234567890';

// [code, QMK name, keycap label]
const BASIC = [
  [0x00, 'KC_NO', ''],
  [0x01, 'KC_TRNS', '▽'],
  ...[...LETTERS].map((ch, i) => [0x04 + i, `KC_${ch}`, ch]),
  ...[...DIGITS].map((ch, i) => [0x1e + i, `KC_${ch}`, ch]),
  [0x28, 'KC_ENT', 'Enter'],
  [0x29, 'KC_ESC', 'Esc'],
  [0x2a, 'KC_BSPC', 'Bksp'],
  [0x2b, 'KC_TAB', 'Tab'],
  [0x2c, 'KC_SPC', 'Space'],
  [0x2d, 'KC_MINS', '-'],
  [0x2e, 'KC_EQL', '='],
  [0x2f, 'KC_LBRC', '['],
  [0x30, 'KC_RBRC', ']'],
  [0x31, 'KC_BSLS', '\\'],
  [0x32, 'KC_NUHS', 'ISO #'],
  [0x33, 'KC_SCLN', ';'],
  [0x34, 'KC_QUOT', "'"],
  [0x35, 'KC_GRV', '`'],
  [0x36, 'KC_COMM', ','],
  [0x37, 'KC_DOT', '.'],
  [0x38, 'KC_SLSH', '/'],
  [0x39, 'KC_CAPS', 'Caps'],
  ...Array.from({ length: 12 }, (_, i) => [0x3a + i, `KC_F${i + 1}`, `F${i + 1}`]),
  [0x46, 'KC_PSCR', 'PrtSc'],
  [0x47, 'KC_SCRL', 'ScrLk'],
  [0x48, 'KC_PAUS', 'Pause'],
  [0x49, 'KC_INS', 'Ins'],
  [0x4a, 'KC_HOME', 'Home'],
  [0x4b, 'KC_PGUP', 'PgUp'],
  [0x4c, 'KC_DEL', 'Del'],
  [0x4d, 'KC_END', 'End'],
  [0x4e, 'KC_PGDN', 'PgDn'],
  [0x4f, 'KC_RGHT', '→'],
  [0x50, 'KC_LEFT', '←'],
  [0x51, 'KC_DOWN', '↓'],
  [0x52, 'KC_UP', '↑'],
  [0x53, 'KC_NUM', 'NumLk'],
  [0x54, 'KC_PSLS', 'KP /'],
  [0x55, 'KC_PAST', 'KP *'],
  [0x56, 'KC_PMNS', 'KP -'],
  [0x57, 'KC_PPLS', 'KP +'],
  [0x58, 'KC_PENT', 'KP Ent'],
  ...Array.from({ length: 9 }, (_, i) => [0x59 + i, `KC_P${i + 1}`, `KP ${i + 1}`]),
  [0x62, 'KC_P0', 'KP 0'],
  [0x63, 'KC_PDOT', 'KP .'],
  [0x64, 'KC_NUBS', 'ISO \\'],
  [0x65, 'KC_APP', 'Menu'],
  [0x67, 'KC_PEQL', 'KP ='],
  ...Array.from({ length: 12 }, (_, i) => [0x68 + i, `KC_F${i + 13}`, `F${i + 13}`]),
  [0xa5, 'KC_PWR', 'Power'],
  [0xa6, 'KC_SLEP', 'Sleep'],
  [0xa7, 'KC_WAKE', 'Wake'],
  [0xa8, 'KC_MUTE', 'Mute'],
  [0xa9, 'KC_VOLU', 'Vol +'],
  [0xaa, 'KC_VOLD', 'Vol −'],
  [0xab, 'KC_MNXT', 'Next'],
  [0xac, 'KC_MPRV', 'Prev'],
  [0xad, 'KC_MSTP', 'Stop'],
  [0xae, 'KC_MPLY', 'Play'],
  [0xaf, 'KC_MSEL', 'Media'],
  [0xb0, 'KC_EJCT', 'Eject'],
  [0xb1, 'KC_MAIL', 'Mail'],
  [0xb2, 'KC_CALC', 'Calc'],
  [0xb3, 'KC_MYCM', 'My PC'],
  [0xb4, 'KC_WSCH', 'Search'],
  [0xb5, 'KC_WHOM', 'Browser'],
  [0xb6, 'KC_WBAK', 'Back'],
  [0xb7, 'KC_WFWD', 'Fwd'],
  [0xb8, 'KC_WSTP', 'WStop'],
  [0xb9, 'KC_WREF', 'Refresh'],
  [0xba, 'KC_WFAV', 'Favs'],
  [0xbb, 'KC_MFFD', 'FFwd'],
  [0xbc, 'KC_MRWD', 'Rewind'],
  [0xbd, 'KC_BRIU', 'Bri +'],
  [0xbe, 'KC_BRID', 'Bri −'],
  [0xe0, 'KC_LCTL', 'LCtrl'],
  [0xe1, 'KC_LSFT', 'LShift'],
  [0xe2, 'KC_LALT', 'LAlt'],
  [0xe3, 'KC_LGUI', 'LWin'],
  [0xe4, 'KC_RCTL', 'RCtrl'],
  [0xe5, 'KC_RSFT', 'RShift'],
  [0xe6, 'KC_RALT', 'RAlt'],
  [0xe7, 'KC_RGUI', 'RWin'],
];

// Only valid with the QMK 0.19+ ranges (protocol >= 12).
const MODERN_EXTRA = [
  [0xcd, 'MS_UP', 'Mouse ↑'],
  [0xce, 'MS_DOWN', 'Mouse ↓'],
  [0xcf, 'MS_LEFT', 'Mouse ←'],
  [0xd0, 'MS_RGHT', 'Mouse →'],
  [0xd1, 'MS_BTN1', 'Click 1'],
  [0xd2, 'MS_BTN2', 'Click 2'],
  [0xd3, 'MS_BTN3', 'Click 3'],
  [0xd9, 'MS_WHLU', 'Wheel ↑'],
  [0xda, 'MS_WHLD', 'Wheel ↓'],
  [0x7800, 'BL_ON', 'BL On'],
  [0x7801, 'BL_OFF', 'BL Off'],
  [0x7802, 'BL_TOGG', 'BL Tog'],
  [0x7803, 'BL_DOWN', 'BL −'],
  [0x7804, 'BL_UP', 'BL +'],
  [0x7805, 'BL_STEP', 'BL Step'],
  [0x7820, 'RGB_TOG', 'RGB Tog'],
  [0x7821, 'RGB_MOD', 'RGB Mode +'],
  [0x7822, 'RGB_RMOD', 'RGB Mode −'],
  [0x7823, 'RGB_HUI', 'Hue +'],
  [0x7824, 'RGB_HUD', 'Hue −'],
  [0x7825, 'RGB_SAI', 'Sat +'],
  [0x7826, 'RGB_SAD', 'Sat −'],
  [0x7827, 'RGB_VAI', 'Bright +'],
  [0x7828, 'RGB_VAD', 'Bright −'],
  [0x7829, 'RGB_SPI', 'Speed +'],
  [0x782a, 'RGB_SPD', 'Speed −'],
  [0x7c00, 'QK_BOOT', 'Boot-loader'],
  [0x7c01, 'QK_RBT', 'Reboot'],
  [0x7c03, 'EE_CLR', 'EEPROM Clear'],
  [0x7c16, 'QK_GESC', 'Esc `'],
];

const LEGACY_EXTRA = [[0x5c00, 'QK_BOOT', 'Boot-loader']];

const MOD_NAMES = ['CTL', 'SFT', 'ALT', 'GUI'];
const MOD_LABELS = ['Ctl', 'Sft', 'Alt', 'Gui'];
export const MOD_BITS = { CTL: 0x01, SFT: 0x02, ALT: 0x04, GUI: 0x08, RIGHT: 0x10 };

function ranges(modern) {
  return modern
    ? {
        MT: [0x2000, 0x3fff],
        LT: [0x4000, 0x4fff],
        TO: 0x5200, MO: 0x5220, DF: 0x5240, TG: 0x5260, OSL: 0x5280, OSM: 0x52a0, TT: 0x52c0,
        layerMask: 0x1f,
        MACRO: [0x7700, 0x777f],
        KB: 0x7e00,
      }
    : {
        MT: [0x6000, 0x7fff],
        LT: [0x4000, 0x4fff],
        TO: 0x5010, MO: 0x5100, DF: 0x5200, TG: 0x5300, OSL: 0x5400, OSM: 0x5500, TT: 0x5800,
        layerMask: 0x0f,
        MACRO: [0x5f12, 0x5f21],
        KB: 0x5f80,
      };
}

function modsToName(mods) {
  const side = mods & MOD_BITS.RIGHT ? 'R' : 'L';
  return MOD_NAMES.filter((_, i) => mods & (1 << i)).map((m) => side + m);
}

function modsToLabel(mods) {
  const side = mods & MOD_BITS.RIGHT ? 'R' : 'L';
  return MOD_LABELS.filter((_, i) => mods & (1 << i)).map((m) => side + m).join('+');
}

function modNameToBits(name) {
  const m = /^(?:MOD_)?([LR])(CTL|SFT|ALT|GUI)$/.exec(name);
  if (!m) return null;
  return MOD_BITS[m[2]] | (m[1] === 'R' ? MOD_BITS.RIGHT : 0);
}

export class KeycodeSet {
  constructor({ protocol = 12, customKeycodes = [] } = {}) {
    this.modern = protocol >= 12;
    this.r = ranges(this.modern);
    this.custom = customKeycodes.map((k, i) => ({
      code: this.r.KB + i,
      name: k.shortName || k.name,
      label: k.name,
      title: k.title,
    }));
    const table = [...BASIC, ...(this.modern ? MODERN_EXTRA : LEGACY_EXTRA)];
    this.byCode = new Map();
    this.byName = new Map();
    for (const [code, name, label] of table) {
      this.byCode.set(code, { code, name, label });
      this.byName.set(name, code);
    }
    for (const k of this.custom) {
      this.byCode.set(k.code, k);
      this.byName.set(k.name.toUpperCase(), k.code);
    }
    // Common aliases people type.
    for (const [alias, name] of [
      ['KC_TRANSPARENT', 'KC_TRNS'], ['_______', 'KC_TRNS'], ['XXXXXXX', 'KC_NO'],
      ['KC_ENTER', 'KC_ENT'], ['KC_ESCAPE', 'KC_ESC'], ['KC_SPACE', 'KC_SPC'],
      ['KC_BACKSPACE', 'KC_BSPC'], ['KC_DELETE', 'KC_DEL'], ['RESET', 'QK_BOOT'],
    ]) {
      if (this.byName.has(name)) this.byName.set(alias, this.byName.get(name));
    }
  }

  basicName(code) {
    return this.byCode.get(code)?.name ?? hex(code);
  }

  basicLabel(code) {
    return this.byCode.get(code)?.label ?? hex(code);
  }

  // → { name: QMK-style string, label: short keycap text, title?: description }
  describe(code) {
    const known = this.byCode.get(code);
    if (known) return { name: known.name, label: known.label, title: known.title };
    const r = this.r;
    const layerOps = [['TO', r.TO], ['MO', r.MO], ['DF', r.DF], ['TG', r.TG], ['OSL', r.OSL], ['TT', r.TT]];
    for (const [op, base] of layerOps) {
      if (code >= base && code <= base + r.layerMask) {
        const layer = code - base;
        return { name: `${op}(${layer})`, label: `${op} ${layer}` };
      }
    }
    if (code >= r.OSM && code <= r.OSM + 0x1f) {
      const mods = code & 0x1f;
      return { name: `OSM(${modsToName(mods).map((m) => 'MOD_' + m).join('|')})`, label: `OSM ${modsToLabel(mods)}` };
    }
    if (code >= 0x0100 && code <= 0x1fff) {
      const mods = (code >> 8) & 0x1f;
      const kc = code & 0xff;
      const name = modsToName(mods).reduceRight((inner, m) => `${m}(${inner})`, this.basicName(kc));
      return { name, label: `${modsToLabel(mods)}+${this.basicLabel(kc)}` };
    }
    if (code >= r.MT[0] && code <= r.MT[1]) {
      const mods = (code >> 8) & 0x1f;
      const kc = code & 0xff;
      return {
        name: `MT(${modsToName(mods).map((m) => 'MOD_' + m).join('|')},${this.basicName(kc)})`,
        label: `${this.basicLabel(kc)}\n${modsToLabel(mods)}`,
      };
    }
    if (code >= r.LT[0] && code <= r.LT[1]) {
      const layer = (code >> 8) & 0x0f;
      const kc = code & 0xff;
      return { name: `LT(${layer},${this.basicName(kc)})`, label: `${this.basicLabel(kc)}\nLT ${layer}` };
    }
    if (code >= r.MACRO[0] && code <= r.MACRO[1]) {
      const n = code - r.MACRO[0];
      return { name: `MACRO(${n})`, label: `M${n}` };
    }
    return { name: hex(code), label: hex(code) };
  }

  layerKeycode(op, layer) {
    const base = this.r[op];
    if (base === undefined || layer < 0 || layer > this.r.layerMask) throw new Error(`Bad layer key ${op}(${layer})`);
    return base + layer;
  }

  modWrap(mods, kc) {
    return ((mods & 0x1f) << 8) | (kc & 0xff);
  }

  modTap(mods, kc) {
    return this.r.MT[0] | ((mods & 0x1f) << 8) | (kc & 0xff);
  }

  layerTap(layer, kc) {
    return this.r.LT[0] | ((layer & 0x0f) << 8) | (kc & 0xff);
  }

  // Accepts hex ("0x5221"), names ("KC_A", "MD_BLE1"), and the forms describe() prints.
  parse(input) {
    const text = input.trim().toUpperCase().replace(/\s+/g, '');
    if (!text) throw new Error('Enter a keycode');
    if (/^0X[0-9A-F]{1,4}$/.test(text)) return parseInt(text, 16);
    if (this.byName.has(text)) return this.byName.get(text);
    if (this.byName.has('KC_' + text)) return this.byName.get('KC_' + text);

    let m = /^(TO|MO|DF|TG|OSL|TT)\((\d+)\)$/.exec(text);
    if (m) return this.layerKeycode(m[1], Number(m[2]));

    m = /^LT\((\d+),(\w+)\)$/.exec(text);
    if (m) return this.layerTap(Number(m[1]), this.parseBasic(m[2]));

    m = /^MT\(([\w|]+),(\w+)\)$/.exec(text);
    if (m) return this.modTap(this.parseMods(m[1]), this.parseBasic(m[2]));

    m = /^OSM\(([\w|]+)\)$/.exec(text);
    if (m) return this.r.OSM + this.parseMods(m[1]);

    // Nested modifier wrappers: LCTL(LSFT(KC_A))
    let mods = 0;
    let rest = text;
    while ((m = /^([LR](?:CTL|SFT|ALT|GUI))\((.*)\)$/.exec(rest))) {
      mods |= modNameToBits(m[1]);
      rest = m[2];
    }
    if (mods) return this.modWrap(mods, this.parseBasic(rest));

    throw new Error(`Unknown keycode "${input.trim()}"`);
  }

  parseBasic(text) {
    const code = this.byName.get(text) ?? this.byName.get('KC_' + text);
    if (code === undefined || code > 0xff) throw new Error(`"${text}" is not a basic keycode`);
    return code;
  }

  parseMods(text) {
    let mods = 0;
    for (const part of text.split('|')) {
      const bits = modNameToBits(part);
      if (bits === null) throw new Error(`Unknown modifier "${part}"`);
      mods |= bits;
    }
    return mods;
  }

  // Palette groups for the picker.
  groups(layerCount) {
    const pick = (codes) => codes.filter((c) => this.byCode.has(c)).map((c) => this.byCode.get(c));
    const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
    const layers = [];
    for (const op of ['MO', 'TG', 'TO', 'TT', 'OSL', 'DF']) {
      for (let l = 0; l < layerCount; l++) {
        const code = this.layerKeycode(op, l);
        layers.push({ code, ...this.describe(code) });
      }
    }
    const groups = [
      { id: 'basic', title: 'Basic', keys: pick([...range(0x04, 0x38), 0x32, 0x64]) },
      { id: 'nav', title: 'Function & Nav', keys: pick([0x29, 0x39, ...range(0x3a, 0x45), ...range(0x46, 0x52), 0x65, ...range(0x68, 0x73)]) },
      { id: 'mods', title: 'Modifiers', keys: pick(range(0xe0, 0xe7)) },
      { id: 'numpad', title: 'Numpad', keys: pick([...range(0x53, 0x63), 0x67]) },
      { id: 'media', title: 'Media & System', keys: pick(range(0xa5, 0xbe)) },
      { id: 'layers', title: 'Layers', keys: layers },
    ];
    if (this.modern) {
      groups.push(
        { id: 'mouse', title: 'Mouse', keys: pick(range(0xcd, 0xda)) },
        { id: 'lighting', title: 'Lighting', keys: pick([...range(0x7800, 0x7805), ...range(0x7820, 0x782a)]) },
      );
    }
    groups.push(
      { id: 'special', title: 'Special', keys: pick([0x00, 0x01, 0x7c16, 0x7c01, 0x7c03, this.modern ? 0x7c00 : 0x5c00]) },
    );
    if (this.custom.length) groups.push({ id: 'custom', title: 'Keyboard', keys: this.custom });
    return groups;
  }
}

export function hex(code) {
  return '0x' + code.toString(16).toUpperCase().padStart(4, '0');
}
