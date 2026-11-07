import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ViaKeyboard, ViaUnhandledError } from '../src/via.js';
import { KeycodeSet } from '../src/keycodes.js';
import { parseKLE, optionSpecs, packOptions, unpackOptions, isVisible } from '../src/layout.js';

const def = JSON.parse(await readFile(new URL('../definitions/neo75.json', import.meta.url), 'utf8'));

// Minimal QMK via.c emulation behind a WebHID-shaped device.
function fakeDevice({ rows = 6, cols = 16, layers = 4, pressed = [], protocol = 12 } = {}) {
  const keymap = new Uint8Array(layers * rows * cols * 2);
  let layoutOptions = 0;
  const listeners = new Set();
  const sent = [];
  const device = {
    opened: false,
    productName: 'NEO75',
    collections: [{ usagePage: 0xff60, usage: 0x61 }],
    async open() { this.opened = true; },
    async close() { this.opened = false; },
    addEventListener(_, fn) { listeners.add(fn); },
    removeEventListener(_, fn) { listeners.delete(fn); },
    async sendReport(reportId, packet) {
      assert.equal(reportId, 0);
      assert.equal(packet.length, 32);
      sent.push(Array.from(packet));
      const d = Uint8Array.from(packet);
      switch (d[0]) {
        case 0x01: d[1] = 0; d[2] = protocol; break;
        case 0x11: d[1] = layers; break;
        case 0x05: {
          const i = ((d[1] * rows + d[2]) * cols + d[3]) * 2;
          keymap[i] = d[4]; keymap[i + 1] = d[5];
          break;
        }
        case 0x12: {
          const off = (d[1] << 8) | d[2];
          d.set(keymap.slice(off, off + d[3]), 4);
          break;
        }
        case 0x13: {
          const off = (d[1] << 8) | d[2];
          keymap.set(d.slice(4, 4 + d[3]), off);
          break;
        }
        case 0x02:
          if (d[1] === 0x02) d.set([layoutOptions >>> 24, layoutOptions >>> 16 & 255, layoutOptions >>> 8 & 255, layoutOptions & 255], 2);
          else if (d[1] === 0x03) {
            // Current QMK: data[2] is the echoed row offset, rows start at data[3].
            // Older QMK: no offset, rows start at data[2].
            const offset = protocol >= 12 ? d[2] : 0;
            const start = protocol >= 12 ? 3 : 2;
            d.fill(0, start);
            for (const [r, c] of pressed) {
              const row = r - offset;
              if (row < 0 || row >= 14) continue;
              d[start + row * 2 + (1 - Math.floor(c / 8))] |= 1 << (c % 8);
            }
          }
          break;
        case 0x03:
          if (d[1] === 0x02) layoutOptions = ((d[2] << 24) | (d[3] << 16) | (d[4] << 8) | d[5]) >>> 0;
          break;
        default:
          d[0] = 0xff;
      }
      const data = new DataView(d.buffer);
      queueMicrotask(() => listeners.forEach((fn) => fn({ reportId: 0, data })));
    },
  };
  return { device, keymap, sent, get layoutOptions() { return layoutOptions; } };
}

test('VIA protocol round-trips keymap, options and matrix state', async () => {
  const fake = fakeDevice({ pressed: [[0, 0], [5, 15], [2, 9]] });
  const kb = new ViaKeyboard(fake.device);
  await kb.open();
  assert.equal(await kb.getProtocolVersion(), 12);
  assert.equal(await kb.getLayerCount(), 4);

  await kb.setKeycode(1, 2, 3, 0x5221);
  assert.deepEqual(fake.sent.at(-1).slice(0, 6), [0x05, 1, 2, 3, 0x52, 0x21]);
  const map = await kb.readKeymap(4, 6, 16);
  assert.equal(map[1][2][3], 0x5221);
  assert.equal(fake.sent.filter((p) => p[0] === 0x12).every((p) => p[3] <= 28), true);

  map[3][5][15] = 0x7e04;
  await kb.writeKeymap(map);
  assert.equal((await kb.readKeymap(4, 6, 16))[3][5][15], 0x7e04);

  await kb.setLayoutOptions(0b1011);
  assert.equal(fake.layoutOptions, 0b1011);
  assert.equal(await kb.getLayoutOptions(), 0b1011);

  assert.deepEqual([...(await kb.getPressedKeys(6, 16, 12))].sort(), ['0,0', '2,9', '5,15']);
  assert.deepEqual(fake.sent.at(-1).slice(0, 3), [0x02, 0x03, 0]);
  await assert.rejects(kb.getCustomValue(3, 1), ViaUnhandledError);
});

test('matrix tester reads the pre-protocol-12 layout too', async () => {
  const fake = fakeDevice({ protocol: 11, pressed: [[1, 7], [4, 8]] });
  const kb = new ViaKeyboard(fake.device);
  await kb.open();
  assert.deepEqual([...(await kb.getPressedKeys(6, 16, 11))].sort(), ['1,7', '4,8']);
});

test('keycodes encode and decode like VIA v12', () => {
  const kc = new KeycodeSet({ protocol: 12, customKeycodes: def.customKeycodes });
  const cases = {
    KC_A: 0x0004, KC_TRNS: 0x0001, 'MO(1)': 0x5221, 'TG(2)': 0x5262, 'TO(0)': 0x5200,
    'LT(1,KC_SPC)': 0x412c, 'MT(MOD_LSFT,KC_Z)': 0x221d, 'LCTL(KC_C)': 0x0106,
    'LCTL(LSFT(KC_ESC))': 0x0329, MD_24G: 0x7e00, MD_BLE1: 0x7e01, RGB_RTOG: 0x7e08,
    QK_BOOT: 0x7c00, '0x1234': 0x1234,
  };
  for (const [name, code] of Object.entries(cases)) {
    assert.equal(kc.parse(name), code, name);
    if (!name.startsWith('0x')) assert.equal(kc.parse(kc.describe(code).name), code, `round trip ${name}`);
  }
  assert.equal(kc.describe(0x7e04).label, 'USB');
  assert.equal(kc.describe(0x0106).name, 'LCTL(KC_C)');
});

test('legacy protocol uses the old layer ranges', () => {
  const kc = new KeycodeSet({ protocol: 10, customKeycodes: def.customKeycodes });
  assert.equal(kc.parse('MO(1)'), 0x5101);
  assert.equal(kc.parse('MT(MOD_LCTL,KC_A)'), 0x6104);
  assert.equal(kc.parse('MD_BLE1'), 0x5f81);
});

test('NEO75 layout parses with aligned option choices', () => {
  const keys = parseKLE(def.layouts.keymap);
  const specs = optionSpecs(def.layouts.labels);
  assert.deepEqual(specs.map((s) => s.bits), [1, 1, 1, 1]);
  assert.deepEqual(unpackOptions(packOptions([1, 0, 1, 1], specs), specs), [1, 0, 1, 1]);
  assert.equal(packOptions([1, 0, 0, 0], specs), 0b1000);

  const find = (r, c, opt) => keys.find((k) => k.row === r && k.col === c && (opt === undefined || `${k.option},${k.choice}` === opt));
  // Split backspace: choice 1 keys land where the 2u backspace sits.
  assert.equal(find(1, 14, '0,1').x, find(1, 13, '0,0').x);
  // 7U bottom row starts where the 6.25U row starts.
  assert.equal(find(5, 0, '3,1').x, find(5, 0, '3,0').x);
  // ISO enter's tall body sits right of the NUHS key.
  assert.equal(find(5, 8, '1,1').x, find(3, 12, '1,1').x + 1);

  for (const selected of [[0, 0, 0, 0], [1, 1, 1, 1]]) {
    const visible = keys.filter((k) => isVisible(k, selected));
    const ids = visible.map((k) => `${k.row},${k.col}`);
    assert.equal(new Set(ids).size, ids.length, `no duplicate matrix positions for ${selected}`);
    for (const k of visible) {
      assert.ok(k.row < def.matrix.rows && k.col < def.matrix.cols);
    }
  }
});
