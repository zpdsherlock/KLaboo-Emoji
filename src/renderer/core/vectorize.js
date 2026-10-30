/* Raster -> vector conversion for image import.
 *
 * The caller samples the source image down to a gw x gh grid (one
 * RGBA pixel per cell). Here colours are reduced with k-means, the
 * background can be keyed out by flood fill from the borders, and each
 * colour's cells are merged greedily into rectangles. The result is a
 * `pixels` object: one <path> per colour, nothing outside the device's
 * svg subset (no <image>, no filters). */
(function (root) {
  function hex(r, g, b) {
    return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  }

  function d2(a, b) {
    const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
  }

  /* deterministic PRNG so the same image + settings give the same svg */
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  }

  function kmeans(pixels, k, iters) {
    if (pixels.length === 0) return [];
    const uniq = new Map();
    for (const p of pixels) uniq.set((p[0] << 16) | (p[1] << 8) | p[2], p);
    if (uniq.size <= k) return [...uniq.values()].map((p) => p.slice(0, 3));
    const rand = rng(pixels.length * 2654435761);
    // k-means++ seeding
    const cents = [pixels[Math.floor(rand() * pixels.length)].slice(0, 3)];
    const dist = new Float64Array(pixels.length).fill(Infinity);
    while (cents.length < k) {
      let sum = 0;
      const c = cents[cents.length - 1];
      for (let i = 0; i < pixels.length; i++) {
        dist[i] = Math.min(dist[i], d2(pixels[i], c));
        sum += dist[i];
      }
      if (sum === 0) break;
      let r = rand() * sum, i = 0;
      for (; i < pixels.length - 1; i++) { r -= dist[i]; if (r <= 0) break; }
      cents.push(pixels[i].slice(0, 3));
    }
    const assign = new Int32Array(pixels.length);
    for (let it = 0; it < (iters || 10); it++) {
      const acc = cents.map(() => [0, 0, 0, 0]);
      for (let i = 0; i < pixels.length; i++) {
        let best = 0, bd = Infinity;
        for (let c = 0; c < cents.length; c++) {
          const d = d2(pixels[i], cents[c]);
          if (d < bd) { bd = d; best = c; }
        }
        assign[i] = best;
        const a = acc[best];
        a[0] += pixels[i][0]; a[1] += pixels[i][1]; a[2] += pixels[i][2]; a[3]++;
      }
      let moved = false;
      for (let c = 0; c < cents.length; c++) {
        const a = acc[c];
        if (!a[3]) continue;
        const n = [a[0] / a[3], a[1] / a[3], a[2] / a[3]];
        if (d2(n, cents[c]) > 0.5) moved = true;
        cents[c] = n;
      }
      if (!moved) break;
    }
    return cents;
  }

  /* mark cells similar to the border colour, connected to the border */
  function keyBackground(rgba, w, h, tol, mask) {
    const at = (x, y) => (y * w + x) * 4;
    const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]
      .map(([x, y]) => at(x, y)).filter((i) => rgba[i + 3] >= 128);
    if (!corners.length) return;
    // most common opaque corner colour is the background reference
    const ref = corners.map((i) => [rgba[i], rgba[i + 1], rgba[i + 2]])
      .sort((a, b) => corners.filter((i) => d2(a, [rgba[i], rgba[i + 1], rgba[i + 2]]) < 300).length
        - corners.filter((i) => d2(b, [rgba[i], rgba[i + 1], rgba[i + 2]]) < 300).length)
      .pop();
    const lim = tol * tol * 9;
    const seen = new Uint8Array(w * h);
    const stack = [];
    for (let x = 0; x < w; x++) stack.push(x, 0, x, h - 1);
    for (let y = 0; y < h; y++) stack.push(0, y, w - 1, y);
    while (stack.length) {
      const y = stack.pop(), x = stack.pop();
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const c = y * w + x;
      if (seen[c]) continue;
      seen[c] = 1;
      const i = c * 4;
      if (rgba[i + 3] >= 128 && d2([rgba[i], rgba[i + 1], rgba[i + 2]], ref) > lim) continue;
      mask[c] = 0;
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
  }

  /* greedy rectangle cover of one colour's cells */
  function mergeRects(grid, w, h, label) {
    const used = new Uint8Array(w * h);
    const rects = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = y * w + x;
        if (used[c] || grid[c] !== label) continue;
        let rw = 1;
        while (x + rw < w && grid[c + rw] === label && !used[c + rw]) rw++;
        let rh = 1;
        grow: while (y + rh < h) {
          const row = (y + rh) * w + x;
          for (let i = 0; i < rw; i++) {
            if (grid[row + i] !== label || used[row + i]) break grow;
          }
          rh++;
        }
        for (let yy = 0; yy < rh; yy++) used.fill(1, (y + yy) * w + x, (y + yy) * w + x + rw);
        rects.push([x, y, rw, rh]);
      }
    }
    return rects;
  }

  /**
   * @param {Uint8ClampedArray} rgba  gw*gh*4 sampled pixels
   * @param {object} opt {colors, removeBg, bgTolerance, alphaThreshold}
   * @returns {{gw, gh, layers:[{color, rects}]}}
   */
  function vectorize(rgba, gw, gh, opt) {
    const o = Object.assign({ colors: 8, removeBg: false, bgTolerance: 24, alphaThreshold: 128 }, opt);
    const n = gw * gh;
    const mask = new Uint8Array(n);
    for (let c = 0; c < n; c++) mask[c] = rgba[c * 4 + 3] >= o.alphaThreshold ? 1 : 0;
    if (o.removeBg) keyBackground(rgba, gw, gh, o.bgTolerance, mask);

    const px = [];
    for (let c = 0; c < n; c++) if (mask[c]) px.push([rgba[c * 4], rgba[c * 4 + 1], rgba[c * 4 + 2]]);
    const cents = kmeans(px, Math.max(1, Math.min(64, o.colors | 0)), 12);

    const grid = new Int16Array(n).fill(-1);
    for (let c = 0; c < n; c++) {
      if (!mask[c]) continue;
      const p = [rgba[c * 4], rgba[c * 4 + 1], rgba[c * 4 + 2]];
      let best = 0, bd = Infinity;
      for (let k = 0; k < cents.length; k++) {
        const d = d2(p, cents[k]);
        if (d < bd) { bd = d; best = k; }
      }
      grid[c] = best;
    }
    const layers = cents.map((cc, k) => ({ color: hex(cc[0], cc[1], cc[2]), rects: mergeRects(grid, gw, gh, k) }))
      .filter((l) => l.rects.length)
      // big areas first so details paint on top of them
      .sort((a, b) => b.rects.reduce((s, r) => s + r[2] * r[3], 0) - a.rects.reduce((s, r) => s + r[2] * r[3], 0));
    return { gw, gh, layers };
  }

  const KL_VEC = { vectorize, kmeans, mergeRects, hex };
  if (typeof module !== 'undefined' && module.exports) module.exports = KL_VEC;
  else root.KL_VEC = KL_VEC;
})(typeof self !== 'undefined' ? self : this);
