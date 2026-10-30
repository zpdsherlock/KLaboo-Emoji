const test = require('node:test');
const assert = require('node:assert');
const JSZip = require('jszip');
const C = require('../src/renderer/core/constants.js');
const S = require('../src/renderer/core/svgdoc.js');
const V = require('../src/renderer/core/vectorize.js');
const P = require('../src/renderer/core/pack.js');

function sampleDoc() {
  const d = S.newDoc('测试', 320);
  for (const k of C.EXPR_KEYS) {
    d.slots[k].objects.push({ id: S.uid(), type: 'ellipse', cx: 160, cy: 160, rx: 140, ry: 140,
      fill: '#FFCC4D', stroke: '#EDA915', width: 6, opacity: 1 });
    d.slots[k].objects.push({ id: S.uid(), type: 'pen', points: [[100, 200], [130, 230], [160, 240], [190, 230], [220, 200]],
      stroke: '#664500', fill: null, width: 10, opacity: 1 });
  }
  return d;
}

test('slotSVG emits only device-supported markup', () => {
  const d = sampleDoc();
  d.slots.smile.background = '#000000';
  d.slots.smile.objects.push({ type: 'rect', x: 10, y: 10, w: 50, h: 20, rx: 5, fill: '#fff', stroke: null, width: 0, opacity: 0.5 });
  d.slots.smile.objects.push({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 10, stroke: '#f00', fill: '#0f0', width: 3 });
  d.slots.smile.objects.push({ type: 'pen', points: [[5, 5]], stroke: '#123456', width: 8 });
  const svg = S.slotSVG(d.slots.smile, 320);
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="320" height="320" viewBox="0 0 320 320">/);
  assert.match(svg, /<circle cx="160" cy="160" r="140"/);
  assert.match(svg, /fill-opacity="0.5"/);
  assert.match(svg, /<line [^>]*fill="none"/);
  assert.match(svg, /<circle cx="5" cy="5" r="4" fill="#123456"\/>/);
  assert.deepStrictEqual(P.lintSVG(svg), []);
});

test('lint flags unsupported svg features', () => {
  const bad = '<svg><text>hi</text><image href="a.png"/><rect style="fill:red" filter="url(#f)"/></svg>';
  const issues = P.lintSVG(bad);
  assert.ok(issues.some((i) => i.includes('<text>')));
  assert.ok(issues.some((i) => i.includes('<image>')));
  assert.ok(issues.some((i) => i.includes('style')));
  assert.ok(issues.some((i) => i.includes('filter')));
});

test('translate/scale/hitTest', () => {
  const r = { type: 'rect', x: 10, y: 10, w: 20, h: 20, fill: '#000' };
  S.translate(r, 5, 5);
  assert.deepStrictEqual(S.bbox(r), { x: 15, y: 15, w: 20, h: 20 });
  S.scale(r, 2, 2, 15, 15);
  assert.deepStrictEqual(S.bbox(r), { x: 15, y: 15, w: 40, h: 40 });
  assert.strictEqual(S.hitTest([r], 30, 30), 0);
  assert.strictEqual(S.hitTest([r], 100, 100), -1);
  const line = { type: 'line', x1: 0, y1: 0, x2: 100, y2: 0, stroke: '#000', width: 4 };
  assert.ok(S.hit(line, 50, 3, 2));
  assert.ok(!S.hit(line, 50, 20, 2));
});

test('simplify drops collinear points', () => {
  const pts = Array.from({ length: 50 }, (_, i) => [i, i * 2]);
  assert.strictEqual(S.simplify(pts, 0.5).length, 2);
});

test('vectorize quantises and merges rects', () => {
  const w = 8, h = 8;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const red = x >= 2 && x < 6 && y >= 2 && y < 6;
    rgba.set(red ? [250, 10, 10, 255] : [255, 255, 255, 255], i);
  }
  const r = V.vectorize(rgba, w, h, { colors: 4 });
  assert.strictEqual(r.layers.length, 2);
  const red = r.layers.find((l) => l.color === '#fa0a0a');
  assert.deepStrictEqual(red.rects, [[2, 2, 4, 4]]);
  const keyed = V.vectorize(rgba, w, h, { colors: 4, removeBg: true });
  assert.strictEqual(keyed.layers.length, 1);
  assert.strictEqual(keyed.layers[0].color, '#fa0a0a');
});

test('vectorize respects alpha and colour budget', () => {
  const w = 16, h = 1;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let x = 0; x < w; x++) rgba.set([x * 16, 0, 255 - x * 16, x < 4 ? 0 : 255], x * 4);
  const r = V.vectorize(rgba, w, h, { colors: 3 });
  assert.ok(r.layers.length <= 3);
  const covered = r.layers.reduce((s, l) => s + l.rects.reduce((a, q) => a + q[2] * q[3], 0), 0);
  assert.strictEqual(covered, 12);
});

test('validate enforces server limits', () => {
  const d = sampleDoc();
  assert.deepStrictEqual(P.validate(d).errors, []);
  d.slots.wink.objects = [];
  assert.ok(P.validate(d).errors.some((e) => e.includes('wink')));
  const big = sampleDoc();
  const rects = Array.from({ length: 40000 }, (_, i) => [i % 200, Math.floor(i / 200), 1, 1]);
  big.slots.dizzy.objects = [{ type: 'pixels', x: 0, y: 0, cell: 1.37, gw: 200, gh: 200,
    layers: [{ color: '#123456', rects }] }];
  assert.ok(P.validate(big).errors.some((e) => e.includes('1MB')));
});

test('buildZip produces manifest + six svgs', async () => {
  const d = sampleDoc();
  const { data } = await P.buildZip(JSZip, d, { 'preview.png': new Uint8Array([1, 2, 3]) });
  const zip = await JSZip.loadAsync(data);
  const m = JSON.parse(await zip.file('manifest.json').async('string'));
  assert.strictEqual(m.format, 1);
  assert.strictEqual(m.name, '测试');
  for (const k of C.EXPR_KEYS) {
    assert.strictEqual(m.expressions[k], `${k}.svg`);
    const svg = await zip.file(`${k}.svg`).async('string');
    assert.ok(svg.startsWith('<svg'));
  }
  assert.ok(zip.file('preview.png'));
  await assert.rejects(P.buildZip(JSZip, S.newDoc('x'), {}));
});

test('normalizeDoc round-trips projects', () => {
  const d = sampleDoc();
  const back = S.normalizeDoc(JSON.parse(JSON.stringify(d)));
  assert.strictEqual(S.slotSVG(back.slots.smile, 320), S.slotSVG(d.slots.smile, 320));
  assert.throws(() => S.normalizeDoc({}));
});
