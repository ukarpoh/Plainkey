// Reads a VIA definition's KLE keymap into positioned keys, and handles layout options.
// Legend convention (VIA): first line "row,col"; fourth line "option,choice" for alternates.

export function parseKLE(rows) {
  const keys = [];
  let y = 0;
  let color = null;
  for (const row of rows) {
    let x = 0;
    let next = {};
    for (const item of row) {
      if (typeof item === 'object') {
        if (item.c) color = item.c;
        if (item.x !== undefined) x += item.x;
        if (item.y !== undefined) y += item.y;
        next = { ...next, ...item };
        continue;
      }
      const w = next.w ?? 1;
      const h = next.h ?? 1;
      const parts = item.split('\n');
      const [mr, mc] = parts[0].split(',').map(Number);
      const option = parts[3] ? parts[3].split(',').map(Number) : null;
      keys.push({
        x, y, w, h,
        x2: next.x2 ?? 0,
        y2: next.y2 ?? 0,
        w2: next.w2 ?? 0,
        h2: next.h2 ?? 0,
        color,
        row: mr,
        col: mc,
        option: option ? option[0] : null,
        choice: option ? option[1] : null,
        index: keys.length,
      });
      x += w;
      next = {};
    }
    y += 1;
  }
  alignOptionChoices(keys);
  return keys;
}

// Alternate choices are drawn off to the side in KLE; VIA slides each choice onto choice 0.
function alignOptionChoices(keys) {
  const groups = new Map();
  for (const k of keys) {
    if (k.option === null) continue;
    const id = `${k.option},${k.choice}`;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(k);
  }
  const origin = (list) => ({
    x: Math.min(...list.map((k) => k.x)),
    y: Math.min(...list.map((k) => k.y)),
  });
  for (const [id, list] of groups) {
    const [option, choice] = id.split(',').map(Number);
    if (choice === 0) continue;
    const base = groups.get(`${option},0`);
    if (!base) continue;
    const a = origin(base);
    const b = origin(list);
    for (const k of list) {
      k.x += a.x - b.x;
      k.y += a.y - b.y;
    }
  }
}

export function boundingBox(keys) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const k of keys) {
    minX = Math.min(minX, k.x, k.x + k.x2);
    minY = Math.min(minY, k.y, k.y + k.y2);
    maxX = Math.max(maxX, k.x + k.w, k.x + k.x2 + k.w2);
    maxY = Math.max(maxY, k.y + k.h, k.y + k.y2 + k.h2);
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

// labels: "Name" (on/off toggle) or ["Name", "Choice A", "Choice B", ...]
export function optionSpecs(labels = []) {
  return labels.map((label) => {
    const choices = Array.isArray(label) ? label.slice(1) : ['Off', 'On'];
    return {
      name: Array.isArray(label) ? label[0] : label,
      toggle: !Array.isArray(label),
      choices,
      bits: Math.max(1, Math.ceil(Math.log2(choices.length))),
    };
  });
}

// VIA packs the first option into the highest bits; the last option sits at bit 0.
export function packOptions(selected, specs) {
  return specs.reduce((acc, spec, i) => ((acc << spec.bits) | (selected[i] ?? 0)) >>> 0, 0);
}

export function unpackOptions(value, specs) {
  const out = new Array(specs.length).fill(0);
  let shift = 0;
  for (let i = specs.length - 1; i >= 0; i--) {
    const mask = (1 << specs[i].bits) - 1;
    out[i] = Math.min((value >>> shift) & mask, specs[i].choices.length - 1);
    shift += specs[i].bits;
  }
  return out;
}

export function isVisible(key, selected) {
  return key.option === null || selected[key.option] === key.choice;
}
