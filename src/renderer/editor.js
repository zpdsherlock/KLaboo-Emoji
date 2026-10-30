/* Canvas interaction: draws the active slot into an <svg>, handles the
 * drawing tools and selection. Objects are wrapped in <g data-i> only
 * inside the editor so drags can preview via transforms; the exported
 * markup comes from KL_SVG.slotSVG and never contains those wrappers. */
(function (root) {
  const S = root.KL_SVG;
  const C = root.KL_CONST;
  const V = root.KL_VEC;
  const NS = 'http://www.w3.org/2000/svg';

  class Editor {
    /**
     * host: { getSlot, getSize, getTool, getStyle, beforeChange,
     *         afterChange, onSelect, onCursor, showGuides, showGrid }
     */
    constructor(svg, host) {
      this.svg = svg;
      this.h = host;
      this.sel = -1;
      this.drag = null;
      svg.addEventListener('pointerdown', (e) => this.down(e));
      svg.addEventListener('pointermove', (e) => this.move(e));
      svg.addEventListener('pointerup', (e) => this.up(e));
      svg.addEventListener('pointercancel', (e) => this.up(e));
      svg.addEventListener('pointerleave', () => this.h.onCursor(null));
    }

    get slot() { return this.h.getSlot(); }
    get size() { return this.h.getSize(); }
    /* canvas units per screen pixel */
    get k() { return this.size / (this.svg.getBoundingClientRect().width || this.size); }

    pt(e) {
      const r = this.svg.getBoundingClientRect();
      return [(e.clientX - r.left) / r.width * this.size, (e.clientY - r.top) / r.height * this.size];
    }

    select(i) {
      this.sel = i;
      this.drawOverlay();
      this.h.onSelect(i);
    }

    selected() { return this.sel >= 0 ? this.slot.objects[this.sel] : null; }

    // ---- rendering ----

    render() {
      const size = this.size, s = S.fmt(size);
      const slot = this.slot;
      if (this.sel >= slot.objects.length) this.sel = -1;
      const cell = Math.max(4, Math.round(size / 40));
      let html = `<defs><pattern id="chk" width="${cell * 2}" height="${cell * 2}" patternUnits="userSpaceOnUse">`
        + `<rect width="${cell * 2}" height="${cell * 2}" fill="#fff"/><rect width="${cell}" height="${cell}" fill="#e4e4e4"/>`
        + `<rect x="${cell}" y="${cell}" width="${cell}" height="${cell}" fill="#e4e4e4"/></pattern></defs>`
        + `<rect width="${s}" height="${s}" fill="url(#chk)"/>`;
      if (slot.background) html += `<rect width="${s}" height="${s}" fill="${slot.background}"/>`;
      html += '<g id="content">';
      slot.objects.forEach((o, i) => { html += `<g data-i="${i}">${S.objectMarkup(o)}</g>`; });
      html += '</g><g id="guides" pointer-events="none"></g><g id="live" pointer-events="none"></g><g id="overlay"></g>';
      this.svg.setAttribute('viewBox', `0 0 ${s} ${s}`);
      this.svg.innerHTML = html;
      this.drawGuides();
      this.drawOverlay();
    }

    drawGuides() {
      const g = this.svg.querySelector('#guides');
      if (!g) return;
      const size = this.size, k = this.k;
      let h = '';
      if (this.h.showGrid()) {
        const step = size / 16;
        for (let i = 1; i < 16; i++) {
          const v = S.fmt(i * step);
          const w = i % 4 === 0 ? 0.9 : 0.4;
          h += `<line x1="${v}" y1="0" x2="${v}" y2="${size}" stroke="#4da6ff" stroke-opacity=".35" stroke-width="${w * k}"/>`
            + `<line x1="0" y1="${v}" x2="${size}" y2="${v}" stroke="#4da6ff" stroke-opacity=".35" stroke-width="${w * k}"/>`;
        }
      }
      if (this.h.showGuides()) {
        // canvas area that lands inside the device face box
        const x0 = size / 2 - C.FACE_CX, y0 = size / 2 - C.FACE_CY;
        const x1 = x0 + C.FACE_BOX_W, y1 = y0 + C.FACE_BOX_H;
        const cx0 = Math.max(0, x0), cy0 = Math.max(0, y0), cx1 = Math.min(size, x1), cy1 = Math.min(size, y1);
        if (cx0 > 0 || cy0 > 0 || cx1 < size || cy1 < size) {
          const dim = '#000';
          if (cy0 > 0) h += `<rect width="${size}" height="${cy0}" fill="${dim}" fill-opacity=".35"/>`;
          if (cy1 < size) h += `<rect y="${cy1}" width="${size}" height="${size - cy1}" fill="${dim}" fill-opacity=".35"/>`;
          if (cx0 > 0) h += `<rect y="${cy0}" width="${cx0}" height="${cy1 - cy0}" fill="${dim}" fill-opacity=".35"/>`;
          if (cx1 < size) h += `<rect x="${cx1}" y="${cy0}" width="${size - cx1}" height="${cy1 - cy0}" fill="${dim}" fill-opacity=".35"/>`;
          h += `<rect x="${cx0}" y="${cy0}" width="${cx1 - cx0}" height="${cy1 - cy0}" fill="none" stroke="#ff5c8a" stroke-dasharray="${6 * k} ${4 * k}" stroke-width="${1.2 * k}"/>`;
        }
        const c = size / 2, a = 8 * k;
        h += `<path d="M${c - a} ${c}H${c + a}M${c} ${c - a}V${c + a}" stroke="#ff5c8a" stroke-opacity=".7" stroke-width="${k}"/>`;
      }
      g.innerHTML = h;
    }

    handleRect(b) {
      const k = this.k, hs = 9 * k;
      return { x: b.x + b.w - hs / 2, y: b.y + b.h - hs / 2, w: hs, h: hs };
    }

    selBox(o) {
      const b = S.bbox(o);
      const pad = (o.stroke ? (o.width || 0) / 2 : 0) + 3 * this.k;
      return { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
    }

    drawOverlay() {
      const g = this.svg.querySelector('#overlay');
      if (!g) return;
      const o = this.selected();
      if (!o) { g.innerHTML = ''; return; }
      const k = this.k, b = this.selBox(o), hr = this.handleRect(b);
      g.innerHTML = `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="#2f7fd6" stroke-width="${1.5 * k}" stroke-dasharray="${5 * k} ${3 * k}" pointer-events="none"/>`
        + `<rect id="hdl" x="${hr.x}" y="${hr.y}" width="${hr.w}" height="${hr.h}" fill="#fff" stroke="#2f7fd6" stroke-width="${1.5 * k}" style="cursor:nwse-resize"/>`;
    }

    live(markup) {
      const g = this.svg.querySelector('#live');
      if (g) g.innerHTML = markup;
    }

    objEl(i) { return this.svg.querySelector(`#content > g[data-i="${i}"]`); }

    // ---- tool helpers ----

    styleFor(type) {
      const st = this.h.getStyle();
      const o = { id: S.uid(), type, opacity: st.opacity, width: st.width, stroke: null, fill: null };
      if (type === 'line') o.stroke = st.stroke;
      else if (type === 'pen') {
        o.closed = st.closed;
        o.stroke = st.strokeOn || !(st.closed && st.fillOn) ? st.stroke : null;
        o.fill = st.closed && st.fillOn ? st.fill : null;
      } else {
        o.stroke = st.strokeOn ? st.stroke : null;
        o.fill = st.fillOn ? st.fill : null;
        if (!o.stroke && !o.fill) o.stroke = st.stroke;
      }
      if (!o.stroke) o.width = 0;
      return o;
    }

    shapeFrom(type, a, b, shift) {
      let [x0, y0] = a, [x1, y1] = b;
      if (type === 'line') {
        if (shift) {
          const ang = Math.round(Math.atan2(y1 - y0, x1 - x0) / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(x1 - x0, y1 - y0);
          x1 = x0 + Math.cos(ang) * len; y1 = y0 + Math.sin(ang) * len;
        }
        return Object.assign(this.styleFor('line'), { x1: x0, y1: y0, x2: x1, y2: y1 });
      }
      if (shift) {
        const d = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        x1 = x0 + Math.sign(x1 - x0 || 1) * d; y1 = y0 + Math.sign(y1 - y0 || 1) * d;
      }
      const x = Math.min(x0, x1), y = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
      if (type === 'rect') return Object.assign(this.styleFor('rect'), { x, y, w, h, rx: this.h.getStyle().radius });
      return Object.assign(this.styleFor('ellipse'), { cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 });
    }

    erasePixels(o, x, y, r) {
      const gw = o.gw, gh = o.gh, grid = new Int16Array(gw * gh).fill(-1);
      o.layers.forEach((l, li) => {
        for (const [rx, ry, rw, rh] of l.rects) {
          for (let yy = ry; yy < ry + rh; yy++) grid.fill(li, yy * gw + rx, yy * gw + rx + rw);
        }
      });
      const gx = (x - o.x) / o.cell, gy = (y - o.y) / o.cell, gr = Math.max(0.5, r / o.cell);
      let changed = false;
      for (let yy = Math.max(0, Math.floor(gy - gr)); yy <= Math.min(gh - 1, Math.ceil(gy + gr)); yy++) {
        for (let xx = Math.max(0, Math.floor(gx - gr)); xx <= Math.min(gw - 1, Math.ceil(gx + gr)); xx++) {
          if (Math.hypot(xx + 0.5 - gx, yy + 0.5 - gy) <= gr && grid[yy * gw + xx] >= 0) {
            grid[yy * gw + xx] = -1; changed = true;
          }
        }
      }
      if (changed) o.layers.forEach((l, li) => { l.rects = V.mergeRects(grid, gw, gh, li); });
      return changed;
    }

    eraseAt(x, y) {
      const st = this.h.getStyle();
      const objs = this.slot.objects;
      const r = Math.max(st.width / 2, 4 * this.k);
      for (let i = objs.length - 1; i >= 0; i--) {
        const o = objs[i];
        if (o.type === 'pixels') {
          if (S.hit(o, x, y, r) || this.nearPixels(o, x, y, r)) {
            if (this.erasePixels(o, x, y, r)) {
              if (S.isEmpty(o)) objs.splice(i, 1);
              return true;
            }
          }
        } else if (S.hit(o, x, y, r)) {
          objs.splice(i, 1);
          if (this.sel === i) this.sel = -1; else if (this.sel > i) this.sel--;
          return true;
        }
      }
      return false;
    }

    nearPixels(o, x, y, r) {
      const b = S.bbox(o);
      return x >= b.x - r && x <= b.x + b.w + r && y >= b.y - r && y <= b.y + b.h + r;
    }

    bucketAt(x, y) {
      const st = this.h.getStyle();
      const i = S.hitTest(this.slot.objects, x, y, 2 * this.k);
      this.h.beforeChange();
      if (i < 0) {
        this.slot.background = st.fill;
      } else {
        const o = this.slot.objects[i];
        if (o.type === 'line') o.stroke = st.fill;
        else if (o.type === 'pixels') {
          const gx = Math.floor((x - o.x) / o.cell), gy = Math.floor((y - o.y) / o.cell);
          const l = o.layers.find((ly) => ly.rects.some(([rx, ry, rw, rh]) =>
            gx >= rx && gx < rx + rw && gy >= ry && gy < ry + rh));
          if (l) l.color = st.fill;
        } else o.fill = st.fill;
      }
      this.h.afterChange();
    }

    // ---- pointer ----

    down(e) {
      if (e.button !== 0) return;
      const p = this.pt(e);
      const tool = this.h.getTool();
      this.svg.setPointerCapture(e.pointerId);
      if (tool === 'select') {
        const o = this.selected();
        if (o && e.target.id === 'hdl') {
          const b = S.bbox(o);
          this.drag = { mode: 'resize', start: p, b };
          return;
        }
        const i = S.hitTest(this.slot.objects, p[0], p[1], 4 * this.k);
        this.select(i);
        if (i >= 0) this.drag = { mode: 'move', start: p, i };
        return;
      }
      if (tool === 'bucket') { this.bucketAt(p[0], p[1]); return; }
      if (tool === 'eraser') {
        this.h.beforeChange();
        this.drag = { mode: 'erase', changed: this.eraseAt(p[0], p[1]) };
        if (this.drag.changed) this.render();
        return;
      }
      if (tool === 'pen') {
        this.drag = { mode: 'pen', pts: [p], obj: this.styleFor('pen') };
        this.livePen();
        return;
      }
      this.drag = { mode: 'shape', type: tool, start: p };
    }

    livePen() {
      const d = this.drag, o = Object.assign({}, d.obj, { points: d.pts });
      this.live(S.objectMarkup(o));
    }

    move(e) {
      const p = this.pt(e);
      this.h.onCursor(p);
      const d = this.drag;
      if (!d) return;
      if (d.mode === 'move') {
        d.dx = p[0] - d.start[0]; d.dy = p[1] - d.start[1];
        const el = this.objEl(d.i);
        if (el) el.setAttribute('transform', `translate(${d.dx} ${d.dy})`);
        const ov = this.svg.querySelector('#overlay');
        if (ov) ov.setAttribute('transform', `translate(${d.dx} ${d.dy})`);
      } else if (d.mode === 'resize') {
        const b = d.b;
        const w = Math.max(2, b.w + p[0] - d.start[0]), h = Math.max(2, b.h + p[1] - d.start[1]);
        let sx = b.w > 0.01 ? w / b.w : 1, sy = b.h > 0.01 ? h / b.h : 1;
        const o = this.selected();
        if (e.shiftKey || o.type === 'pixels') { const s = Math.max(sx, sy); sx = s; sy = s; }
        if (b.w <= 0.01) sx = 1;
        if (b.h <= 0.01) sy = 1;
        d.sx = sx; d.sy = sy;
        const el = this.objEl(this.sel);
        if (el) el.setAttribute('transform', `translate(${b.x} ${b.y}) scale(${sx} ${sy}) translate(${-b.x} ${-b.y})`);
      } else if (d.mode === 'pen') {
        const last = d.pts[d.pts.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 0.8 * this.k) {
          d.pts.push(p);
          this.livePen();
        }
      } else if (d.mode === 'shape') {
        d.obj = this.shapeFrom(d.type, d.start, p, e.shiftKey);
        this.live(S.objectMarkup(d.obj));
      } else if (d.mode === 'erase') {
        if (this.eraseAt(p[0], p[1])) { d.changed = true; this.render(); }
      }
    }

    up(e) {
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      if (this.svg.hasPointerCapture(e.pointerId)) this.svg.releasePointerCapture(e.pointerId);
      this.live('');
      if (d.mode === 'move') {
        if (d.dx || d.dy) {
          this.h.beforeChange();
          S.translate(this.slot.objects[d.i], d.dx, d.dy);
          this.h.afterChange();
        }
      } else if (d.mode === 'resize') {
        if (d.sx && (d.sx !== 1 || d.sy !== 1)) {
          this.h.beforeChange();
          S.scale(this.selected(), d.sx, d.sy, d.b.x, d.b.y);
          this.h.afterChange();
        } else this.render();
      } else if (d.mode === 'pen') {
        const pts = S.simplify(d.pts, 0.5 * this.k);
        this.h.beforeChange();
        this.slot.objects.push(Object.assign(d.obj, { points: pts.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]) }));
        this.h.afterChange();
      } else if (d.mode === 'shape') {
        const o = d.obj;
        if (o && !S.isEmpty(o) && S.bbox(o).w + S.bbox(o).h > 2 * this.k) {
          this.h.beforeChange();
          this.slot.objects.push(o);
          this.sel = this.slot.objects.length - 1;
          this.h.afterChange();
          this.h.onSelect(this.sel);
        }
      } else if (d.mode === 'erase') {
        if (d.changed) this.h.afterChange(); else this.h.cancelChange();
      }
    }
  }

  root.KL_Editor = Editor;
})(self);
