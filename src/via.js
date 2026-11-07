// VIA raw-HID protocol over WebHID.
// Packet layout mirrors the-via/app (src/utils/keyboard-api.ts) and QMK's quantum/via.c:
// every request and response is a 32-byte report on usage page 0xFF60 / usage 0x61,
// report ID 0, and the keyboard echoes the command byte (or 0xFF when unhandled).

export const VIA_USAGE_PAGE = 0xff60;
export const VIA_USAGE = 0x61;
const REPORT_SIZE = 32;
const MAX_CHUNK = 28; // 32 bytes minus [cmd, offset_hi, offset_lo, size]
const TIMEOUT_MS = 1500;

export const CMD = {
  GET_PROTOCOL_VERSION: 0x01,
  GET_KEYBOARD_VALUE: 0x02,
  SET_KEYBOARD_VALUE: 0x03,
  DYNAMIC_KEYMAP_GET_KEYCODE: 0x04,
  DYNAMIC_KEYMAP_SET_KEYCODE: 0x05,
  DYNAMIC_KEYMAP_RESET: 0x06,
  CUSTOM_MENU_SET_VALUE: 0x07,
  CUSTOM_MENU_GET_VALUE: 0x08,
  CUSTOM_MENU_SAVE: 0x09,
  DYNAMIC_KEYMAP_GET_LAYER_COUNT: 0x11,
  DYNAMIC_KEYMAP_GET_BUFFER: 0x12,
  DYNAMIC_KEYMAP_SET_BUFFER: 0x13,
  UNHANDLED: 0xff,
};

export const KEYBOARD_VALUE = {
  UPTIME: 0x01,
  LAYOUT_OPTIONS: 0x02,
  SWITCH_MATRIX_STATE: 0x03,
  FIRMWARE_VERSION: 0x04,
};

export const LIGHTING_CHANNEL = {
  BACKLIGHT: 1,
  RGBLIGHT: 2,
  RGB_MATRIX: 3,
  LED_MATRIX: 5,
};

// Value ids shared by the QMK lighting channels.
export const LIGHTING_VALUE = {
  BRIGHTNESS: 1,
  EFFECT: 2,
  SPEED: 3,
  COLOR: 4,
};

export class ViaUnhandledError extends Error {
  constructor(cmd) {
    super(`Keyboard does not handle VIA command 0x${cmd.toString(16).padStart(2, '0')}`);
    this.name = 'ViaUnhandledError';
  }
}

export class ViaKeyboard {
  static isSupported() {
    return 'hid' in navigator;
  }

  static filters(vendorId, productId) {
    return [{ vendorId, productId, usagePage: VIA_USAGE_PAGE, usage: VIA_USAGE }];
  }

  static hasViaInterface(device) {
    return device.collections.some((c) => c.usagePage === VIA_USAGE_PAGE && c.usage === VIA_USAGE);
  }

  static async request(vendorId, productId) {
    const devices = await navigator.hid.requestDevice({ filters: ViaKeyboard.filters(vendorId, productId) });
    const device = devices.find(ViaKeyboard.hasViaInterface);
    return device ? new ViaKeyboard(device) : null;
  }

  static async findGranted(vendorId, productId) {
    const devices = await navigator.hid.getDevices();
    const device = devices.find(
      (d) => d.vendorId === vendorId && d.productId === productId && ViaKeyboard.hasViaInterface(d),
    );
    return device ? new ViaKeyboard(device) : null;
  }

  constructor(device) {
    this.device = device;
    this.queue = Promise.resolve();
    this.pending = null;
    this.onReport = this.onReport.bind(this);
  }

  get name() {
    return this.device.productName;
  }

  async open() {
    if (!this.device.opened) await this.device.open();
    this.device.addEventListener('inputreport', this.onReport);
  }

  async close() {
    this.device.removeEventListener('inputreport', this.onReport);
    if (this.device.opened) await this.device.close();
  }

  onReport(event) {
    if (event.reportId !== 0 || !this.pending) return;
    const data = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
    if (data[0] === this.pending.cmd || data[0] === CMD.UNHANDLED) {
      const { resolve, timer } = this.pending;
      clearTimeout(timer);
      this.pending = null;
      resolve(Uint8Array.from(data));
    }
  }

  // Serialised request/response: one packet in flight at a time, like VIA's HID queue.
  command(cmd, args = []) {
    const run = this.queue.then(() => this.send(cmd, args));
    this.queue = run.catch(() => {});
    return run;
  }

  async send(cmd, args) {
    const packet = new Uint8Array(REPORT_SIZE);
    packet[0] = cmd;
    packet.set(args.slice(0, REPORT_SIZE - 1), 1);
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new Error(`Timed out waiting for VIA response to 0x${cmd.toString(16)}`));
      }, TIMEOUT_MS);
      this.pending = { cmd, resolve, timer };
    });
    await this.device.sendReport(0, packet);
    const data = await response;
    if (data[0] === CMD.UNHANDLED) throw new ViaUnhandledError(cmd);
    return data;
  }

  async getProtocolVersion() {
    const [, hi, lo] = await this.command(CMD.GET_PROTOCOL_VERSION);
    return (hi << 8) | lo;
  }

  async getLayerCount() {
    const [, count] = await this.command(CMD.DYNAMIC_KEYMAP_GET_LAYER_COUNT);
    return count;
  }

  async getKeycode(layer, row, col) {
    const res = await this.command(CMD.DYNAMIC_KEYMAP_GET_KEYCODE, [layer, row, col]);
    return (res[4] << 8) | res[5];
  }

  async setKeycode(layer, row, col, keycode) {
    await this.command(CMD.DYNAMIC_KEYMAP_SET_KEYCODE, [layer, row, col, keycode >> 8, keycode & 0xff]);
  }

  // Returns keymap[layer][row][col]. The firmware stores it as big-endian uint16 in that order.
  async readKeymap(layers, rows, cols, onProgress = () => {}) {
    const total = layers * rows * cols * 2;
    const bytes = new Uint8Array(total);
    for (let offset = 0; offset < total; offset += MAX_CHUNK) {
      const size = Math.min(MAX_CHUNK, total - offset);
      const res = await this.command(CMD.DYNAMIC_KEYMAP_GET_BUFFER, [offset >> 8, offset & 0xff, size]);
      bytes.set(res.slice(4, 4 + size), offset);
      onProgress((offset + size) / total);
    }
    const keymap = [];
    for (let l = 0; l < layers; l++) {
      const layer = [];
      for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) {
          const i = ((l * rows + r) * cols + c) * 2;
          row.push((bytes[i] << 8) | bytes[i + 1]);
        }
        layer.push(row);
      }
      keymap.push(layer);
    }
    return keymap;
  }

  async writeKeymap(keymap, onProgress = () => {}) {
    const flat = keymap.flat(2);
    const bytes = new Uint8Array(flat.length * 2);
    flat.forEach((code, i) => {
      bytes[i * 2] = code >> 8;
      bytes[i * 2 + 1] = code & 0xff;
    });
    for (let offset = 0; offset < bytes.length; offset += MAX_CHUNK) {
      const chunk = bytes.slice(offset, offset + MAX_CHUNK);
      await this.command(CMD.DYNAMIC_KEYMAP_SET_BUFFER, [offset >> 8, offset & 0xff, chunk.length, ...chunk]);
      onProgress((offset + chunk.length) / bytes.length);
    }
  }

  async resetKeymap() {
    await this.command(CMD.DYNAMIC_KEYMAP_RESET);
  }

  async getLayoutOptions() {
    const res = await this.command(CMD.GET_KEYBOARD_VALUE, [KEYBOARD_VALUE.LAYOUT_OPTIONS]);
    return ((res[2] << 24) | (res[3] << 16) | (res[4] << 8) | res[5]) >>> 0;
  }

  async setLayoutOptions(value) {
    await this.command(CMD.SET_KEYBOARD_VALUE, [
      KEYBOARD_VALUE.LAYOUT_OPTIONS,
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    ]);
  }

  // Each matrix row comes back big-endian, ceil(cols / 8) bytes per row. Protocol 12+ takes a
  // starting-row offset, which the firmware echoes, so the data starts at byte 3 instead of 2
  // (the-via/app src/utils/use-matrix-test.ts).
  async getPressedKeys(rows, cols, protocol) {
    const rowBytes = Math.ceil(cols / 8);
    const rowsPerQuery = Math.floor(MAX_CHUNK / rowBytes);
    const withOffset = protocol >= 12;
    const flat = [];
    for (let offset = 0; offset < rows; offset += withOffset ? rowsPerQuery : rows) {
      const args = withOffset ? [KEYBOARD_VALUE.SWITCH_MATRIX_STATE, offset] : [KEYBOARD_VALUE.SWITCH_MATRIX_STATE];
      const res = await this.command(CMD.GET_KEYBOARD_VALUE, args);
      const count = Math.min(rows - offset, rowsPerQuery) * rowBytes;
      const start = 1 + args.length;
      flat.push(...res.slice(start, start + count));
    }
    const pressed = new Set();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const byte = flat[r * rowBytes + (rowBytes - 1 - Math.floor(c / 8))];
        if (byte & (1 << (c % 8))) pressed.add(`${r},${c}`);
      }
    }
    return pressed;
  }

  async getCustomValue(channel, valueId, length = 1) {
    const res = await this.command(CMD.CUSTOM_MENU_GET_VALUE, [channel, valueId]);
    return Array.from(res.slice(3, 3 + length));
  }

  async setCustomValue(channel, valueId, ...data) {
    await this.command(CMD.CUSTOM_MENU_SET_VALUE, [channel, valueId, ...data]);
  }

  async saveCustomValues(channel) {
    await this.command(CMD.CUSTOM_MENU_SAVE, [channel]);
  }
}
