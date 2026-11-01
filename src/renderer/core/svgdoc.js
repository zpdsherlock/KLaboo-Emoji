/* Document model + SVG serialisation.
 *
 * A project holds one slot per expression key; a slot is a background
 * colour plus an ordered list of vector objects. All geometry is kept
 * in canvas units with transforms baked in, so the exported markup only
 * uses plain shapes/paths with presentation attributes - the subset the
 * LVGL svg decoder on the device renders reliably. */
(function (root) {
  const C = (typeof module !== 'undefined' && module.exports)
    ? require('./constants.js') : root.KL_CONST;

  let seq = 0;
  const uid = () => `o${Date.now().toString(36)}${(seq++).toString(36)}`;

  function fmt(n) {
    const r = Math.round(n * 100) / 100;
    return Object.is(r, -0) ? '0' : String(r);
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function newSlot() { return { background: null, objects: [] }; }

  function newDoc(name, size) {
    const slots = {};
    for (const k of C.EXPR_KEYS) slots[k] = newSlot();
    return { app: 'klaboo-emoji', format: 1, name: name || '我的表情',
      size: size || C.DEFAULT_SIZE, slots };
  }

  function normalizeDoc(d) {
    if (!d || typeof d !== 'object' || !d.slots) throw new Error('不是有效的表情工程文件');
    const out = newDoc(d.name, Number(d.size) || C.DEFAULT_SIZE);
    for (const k of C.EXPR_KEYS) {
      const s = d.slots[k];
      if (s) {
        out.slots[k].background = s.background || null;
        out.slots[k].objects = Array.isArray(s.objects)
          ? s.objects.map((o) => Object.assign({}, o, { id: o.id || uid() })) : [];
      }
    }
    return out;
  }

  function clone(o) {
    const c = JSON.parse(JSON.stringify(o));
    c.id = uid();
    return c;
  }

  // ---- geometry helpers ----

  function distToSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  /* Ramer-Douglas-Peucker: drops jitter from freehand input */
  function simplify(pts, eps) {
    if (pts.length < 3) return pts.slice();
    let idx = 0, dmax = 0;
    const a = pts[0], b = pts[pts.length - 1];
    for (let i = 1; i < pts.length - 1; i++) {
      const d = distToSeg(pts[i][0], pts[i][1], a[0], a[1], b[0], b[1]);
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax <= eps) return [a, b];
    const l = simplify(pts.slice(0, idx + 1), eps);
    const r = simplify(pts.slice(idx), eps);
    return l.slice(0, -1).concat(r);
  }

  /* quadratic curves through segment midpoints - smooth and compact */
  function smoothD(pts, closed) {
    if (!pts.length) return '';
    const P = (p) => `${fmt(p[0])} ${fmt(p[1])}`;
    if (pts.length < 3) {
      return `M${P(pts[0])}` + pts.slice(1).map((p) => `L${P(p)}`).join('') + (closed ? 'Z' : '');
    }
    let d = `M${P(pts[0])}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
      d += `Q${P(pts[i])} ${P(m)}`;
    }
    d += `L${P(pts[pts.length - 1])}`;
    return closed ? d + 'Z' : d;
  }

  function bbox(o) {
    switch (o.type) {
      case 'pen': {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [x, y] of o.points) {
          x0 = Math.min(x0, x); y0 = Math.min(y0, y);
          x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }
      case 'line':
        return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2),
          w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
      case 'rect': return { x: o.x, y: o.y, w: o.w, h: o.h };
      case 'ellipse': return { x: o.cx - o.rx, y: o.cy - o.ry, w: 2 * o.rx, h: 2 * o.ry };
      case 'pixels': return { x: o.x, y: o.y, w: o.gw * o.cell, h: o.gh * o.cell };
      default: return { x: 0, y: 0, w: 0, h: 0 };
    }
  }

  function translate(o, dx, dy) {
    switch (o.type) {
      case 'pen': o.points = o.points.map(([x, y]) => [x + dx, y + dy]); break;
      case 'line': o.x1 += dx; o.y1 += dy; o.x2 += dx; o.y2 += dy; break;
      case 'rect': case 'pixels': o.x += dx; o.y += dy; break;
      case 'ellipse': o.cx += dx; o.cy += dy; break;
      default: break;
    }
    return o;
  }

  /* scale geometry about (ox,oy); pixel art keeps square cells */
  function scale(o, sx, sy, ox, oy) {
    const X = (x) => ox + (x - ox) * sx;
    const Y = (y) => oy + (y - oy) * sy;
    switch (o.type) {
      case 'pen': o.points = o.points.map(([x, y]) => [X(x), Y(y)]); break;
      case 'line': o.x1 = X(o.x1); o.y1 = Y(o.y1); o.x2 = X(o.x2); o.y2 = Y(o.y2); break;
      case 'rect': {
        const x = X(o.x), y = Y(o.y), x2 = X(o.x + o.w), y2 = Y(o.y + o.h);
        o.x = Math.min(x, x2); o.y = Math.min(y, y2);
        o.w = Math.abs(x2 - x); o.h = Math.abs(y2 - y);
        o.rx = (o.rx || 0) * Math.min(Math.abs(sx), Math.abs(sy));
        break;
      }
      case 'ellipse':
        o.cx = X(o.cx); o.cy = Y(o.cy);
        o.rx = Math.abs(o.rx * sx); o.ry = Math.abs(o.ry * sy); break;
      case 'pixels': {
        const s = Math.max(0.05, Math.min(Math.abs(sx), Math.abs(sy)));
        o.x = X(o.x); o.y = Y(o.y); o.cell *= s; break;
      }
      default: break;
    }
    return o;
  }

  function hit(o, x, y, tol) {
    const t = tol + (o.stroke ? (o.width || 1) / 2 : 0);
    switch (o.type) {
      case 'pen': {
        const p = o.points;
        if (p.length === 1) return Math.hypot(x - p[0][0], y - p[0][1]) <= t;
        for (let i = 1; i < p.length; i++) {
          if (distToSeg(x, y, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]) <= t) return true;
        }
        if (o.fill) { const b = bbox(o); return inBox(b, x, y, 0); }
        return false;
      }
      case 'line': return distToSeg(x, y, o.x1, o.y1, o.x2, o.y2) <= t;
      case 'rect': {
        if (o.fill) return inBox(o, x, y, t);
        return inBox(o, x, y, t) && !inBox({ x: o.x + t, y: o.y + t, w: o.w - 2 * t, h: o.h - 2 * t }, x, y, 0);
      }
      case 'ellipse': {
        const rx = Math.max(o.rx, 0.01), ry = Math.max(o.ry, 0.01);
        const n = Math.hypot((x - o.cx) / rx, (y - o.cy) / ry);
        const edge = Math.abs(n - 1) * Math.min(rx, ry) <= t;
        return o.fill ? (n <= 1 || edge) : edge;
      }
      case 'pixels': {
        if (!inBox(bbox(o), x, y, 0)) return false;
        const gx = Math.floor((x - o.x) / o.cell), gy = Math.floor((y - o.y) / o.cell);
        return o.layers.some((l) => l.rects.some(([rx, ry, rw, rh]) =>
          gx >= rx && gx < rx + rw && gy >= ry && gy < ry + rh));
      }
      default: return false;
    }
  }

  function inBox(b, x, y, t) {
    return x >= b.x - t && x <= b.x + b.w + t && y >= b.y - t && y <= b.y + b.h + t;
  }

  function hitTest(objects, x, y, tol) {
    for (let i = objects.length - 1; i >= 0; i--) {
      if (hit(objects[i], x, y, tol || 3)) return i;
    }
    return -1;
  }

  // ---- markup ----

  function paintAttrs(o, kind) {
    const a = [];
    const op = o.opacity == null ? 1 : o.opacity;
    const fill = kind === 'stroke-only' ? null : o.fill;
    a.push(`fill="${fill ? esc(fill) : 'none'}"`);
    if (fill && op < 1) a.push(`fill-opacity="${fmt(op)}"`);
    if (o.stroke && o.width > 0) {
      a.push(`stroke="${esc(o.stroke)}"`, `stroke-width="${fmt(o.width)}"`,
        'stroke-linecap="round"', 'stroke-linejoin="round"');
      if (op < 1) a.push(`stroke-opacity="${fmt(op)}"`);
    }
    return a.join(' ');
  }

  /* Device cost grows with the number of rects, so export a smaller cover:
   * layers paint in order, so for layer k the cells of later layers are
   * wildcards (painted over anyway) and k's rects may grow across them.
   * Pixel-identical result, but only valid when the object is opaque. */
  const coverCache = new WeakMap();
  function coverRects(o) {
    const w = o.gw, h = o.gh;
    const sig = `${w}x${h}:` + o.layers.map((l) => l.rects.length).join(',');
    const hit = coverCache.get(o.layers);
    if (hit && hit.sig === sig) return hit.rects;
    const grid = new Int16Array(w * h).fill(-1);
    o.layers.forEach((l, k) => {
      for (const [rx, ry, rw, rh] of l.rects) {
        for (let y = Math.max(0, ry); y < Math.min(h, ry + rh); y++) {
          for (let x = Math.max(0, rx); x < Math.min(w, rx + rw); x++) grid[y * w + x] = k;
        }
      }
    });
    const out = o.layers.map((l, k) => {
      const used = new Uint8Array(w * h);
      const free = (c) => grid[c] > k || (grid[c] === k && !used[c]);
      const rects = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const c = y * w + x;
          if (used[c] || grid[c] !== k) continue;
          let rw = 1;
          while (x + rw < w && free(c + rw)) rw++;
          let rh = 1;
          grow: while (y + rh < h) {
            const row = (y + rh) * w + x;
            for (let i = 0; i < rw; i++) if (!free(row + i)) break grow;
            rh++;
          }
          for (let yy = y; yy < y + rh; yy++) {
            for (let xx = x; xx < x + rw; xx++) if (grid[yy * w + xx] === k) used[yy * w + xx] = 1;
          }
          rects.push([x, y, rw, rh]);
        }
      }
      return rects;
    });
    coverCache.set(o.layers, { sig, rects: out });
    return out;
  }

  function pixelsMarkup(o) {
    // slight overlap hides antialiasing seams between neighbour cells
    const ov = Math.min(0.5, o.cell * 0.08);
    const op = o.opacity == null ? 1 : o.opacity;
    const cover = op >= 1 && o.gw && o.gh ? coverRects(o) : o.layers.map((l) => l.rects);
    return o.layers.map((l, k) => ({ color: l.color, rects: cover[k] })).filter((l) => l.rects.length).map((l) => {
      let d = '';
      for (const [rx, ry, rw, rh] of l.rects) {
        d += `M${fmt(o.x + rx * o.cell)} ${fmt(o.y + ry * o.cell)}`
          + `h${fmt(rw * o.cell + ov)}v${fmt(rh * o.cell + ov)}h${fmt(-(rw * o.cell + ov))}z`;
      }
      return `<path fill="${esc(l.color)}"${op < 1 ? ` fill-opacity="${fmt(op)}"` : ''} d="${d}"/>`;
    }).join('');
  }

  function objectMarkup(o) {
    switch (o.type) {
      case 'pen': {
        if (!o.points.length) return '';
        if (o.points.length === 1) {
          // a tap is a dot; zero-length round-cap paths are not portable
          const [x, y] = o.points[0];
          const r = Math.max(0.5, (o.width || 1) / 2);
          const op = o.opacity == null ? 1 : o.opacity;
          return `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r)}" fill="${esc(o.stroke || o.fill || '#000')}"`
            + `${op < 1 ? ` fill-opacity="${fmt(op)}"` : ''}/>`;
        }
        return `<path d="${smoothD(o.points, o.closed)}" ${paintAttrs(o)}/>`;
      }
      case 'line':
        return `<line x1="${fmt(o.x1)}" y1="${fmt(o.y1)}" x2="${fmt(o.x2)}" y2="${fmt(o.y2)}" ${paintAttrs(o, 'stroke-only')}/>`;
      case 'rect': {
        const rx = Math.min(o.rx || 0, o.w / 2, o.h / 2);
        return `<rect x="${fmt(o.x)}" y="${fmt(o.y)}" width="${fmt(o.w)}" height="${fmt(o.h)}"`
          + `${rx > 0 ? ` rx="${fmt(rx)}"` : ''} ${paintAttrs(o)}/>`;
      }
      case 'ellipse':
        if (Math.abs(o.rx - o.ry) < 0.01) {
          return `<circle cx="${fmt(o.cx)}" cy="${fmt(o.cy)}" r="${fmt(o.rx)}" ${paintAttrs(o)}/>`;
        }
        return `<ellipse cx="${fmt(o.cx)}" cy="${fmt(o.cy)}" rx="${fmt(o.rx)}" ry="${fmt(o.ry)}" ${paintAttrs(o)}/>`;
      case 'pixels': return pixelsMarkup(o);
      default: return '';
    }
  }

  function isEmpty(o) {
    if (o.type === 'pixels') return !o.layers.some((l) => l.rects.length);
    if (o.type === 'pen') return !o.points.length;
    const b = bbox(o);
    return b.w < 0.5 && b.h < 0.5;
  }

  function slotSVG(slot, size) {
    const s = fmt(size);
    let body = '';
    if (slot.background) body += `<rect width="${s}" height="${s}" fill="${esc(slot.background)}"/>`;
    for (const o of slot.objects) body += objectMarkup(o);
    return '<svg xmlns="http://www.w3.org/2000/svg" '
      + `width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${body}</svg>`;
  }

  function slotIsEmpty(slot) {
    return !slot.background && !slot.objects.some((o) => !isEmpty(o));
  }

  const KL_SVG = { uid, fmt, newDoc, newSlot, normalizeDoc, clone, simplify, smoothD,
    bbox, translate, scale, hit, hitTest, objectMarkup, slotSVG, slotIsEmpty, isEmpty, distToSeg, coverRects };
  if (typeof module !== 'undefined' && module.exports) module.exports = KL_SVG;
  else root.KL_SVG = KL_SVG;
})(typeof self !== 'undefined' ? self : this);
