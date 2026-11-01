/* App shell: project state, history, panels, image import, preview,
 * export. Rendering of the canvas itself lives in editor.js. */
(function () {
  const C = self.KL_CONST, S = self.KL_SVG, V = self.KL_VEC, PK = self.KL_PACK, T = self.KL_TEMPLATES;
  const api = self.klabooAPI || null;
  const $ = (id) => document.getElementById(id);

  const TOOLS = [
    { id: 'select', name: '选择', key: 'V', icon: '<path d="M5 3l12 8-6 1.5L8 19z" fill="currentColor"/>' },
    { id: 'pen', name: '画笔', key: 'B', icon: '<path d="M3 17c3-1 4-6 7-6s3 5 7 3" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/>' },
    { id: 'line', name: '直线', key: 'L', icon: '<path d="M4 16L16 4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' },
    { id: 'rect', name: '矩形', key: 'R', icon: '<rect x="3" y="5" width="14" height="10" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>' },
    { id: 'ellipse', name: '椭圆', key: 'O', icon: '<ellipse cx="10" cy="10" rx="7.5" ry="6" stroke="currentColor" stroke-width="2" fill="none"/>' },
    { id: 'bucket', name: '填充', key: 'F', icon: '<path d="M4 9l6-6 6 6-6 6z" fill="currentColor"/><circle cx="17" cy="15" r="2" fill="currentColor"/>' },
    { id: 'eraser', name: '橡皮', key: 'E', icon: '<path d="M3 13l7-7 6 6-5 5H7z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>' },
  ];
  const HINTS = {
    select: '点击选中图层，拖动移动，拖右下角手柄缩放（Shift 等比），方向键微调',
    pen: '按住拖动自由绘制；勾选“闭合路径”+填充可画色块',
    line: '拖动画直线，Shift 锁定 45°',
    rect: '拖动画矩形，Shift 画正方形',
    ellipse: '拖动画椭圆，Shift 画正圆',
    bucket: '点击图形填充颜色；点击空白处设置背景色；点击导入图片的色块可整体换色',
    eraser: '擦除笔触/图形；在导入的图片上按粗细擦除像素',
  };
  const PALETTE = ['#000000', '#ffffff', '#664500', '#ffcc4d', '#eda915', '#ffd75e',
    '#ffe1a0', '#e4be63', '#ff8a80', '#ff9e9e', '#ff5c8a', '#ffd54f',
    '#4da6ff', '#99a7ff', '#36d1dc', '#5b86e5', '#0b2545', '#4cd48a',
    '#9b59b6', '#e74c3c', '#f39c12', '#2ecc71', '#95a5a6', '#34495e'];
  const TYPE_NAMES = { pen: '画笔', line: '直线', rect: '矩形', ellipse: '椭圆', pixels: '图片' };

  const st = {
    doc: S.newDoc('我的表情', C.DEFAULT_SIZE),
    key: C.EXPR_KEYS[0],
    tool: 'pen',
    filePath: null,
    dirty: false,
    hist: {},
    pvKey: C.EXPR_KEYS[0],
  };
  const resetHistory = () => { for (const k of C.EXPR_KEYS) st.hist[k] = { undo: [], redo: [] }; };
  resetHistory();

  const slot = () => st.doc.slots[st.key];

  function style() {
    return {
      stroke: $('strokeColor').value, fill: $('fillColor').value,
      strokeOn: $('strokeOn').checked, fillOn: $('fillOn').checked,
      width: Number($('width').value), opacity: Number($('opacity').value) / 100,
      radius: Number($('radius').value), closed: $('penClosed').checked,
    };
  }

  // ---- history ----
  let txn = null;
  function beforeChange() {
    const h = st.hist[st.key];
    h.undo.push(JSON.stringify(slot()));
    if (h.undo.length > 200) h.undo.shift();
    h.redo = [];
    txn = st.key;
  }
  function cancelChange() { if (txn) st.hist[txn].undo.pop(); txn = null; }
  function afterChange() { txn = null; setDirty(true); refresh(); }
  function undoRedo(redo) {
    const h = st.hist[st.key];
    const from = redo ? h.redo : h.undo, to = redo ? h.undo : h.redo;
    if (!from.length) return;
    to.push(JSON.stringify(slot()));
    st.doc.slots[st.key] = JSON.parse(from.pop());
    ed.sel = -1;
    setDirty(true);
    refresh();
    syncSelection();
  }

  function setDirty(v) {
    st.dirty = v;
    if (api) {
      api.setDirty(v);
      api.setTitle(`${v ? '• ' : ''}${st.doc.name} — KLaboo Emoji`);
    }
  }

  // ---- editor ----
  const ed = new self.KL_Editor($('canvas'), {
    getSlot: slot,
    getSize: () => st.doc.size,
    getTool: () => st.tool,
    getStyle: style,
    beforeChange, afterChange, cancelChange,
    onSelect: () => syncSelection(),
    onCursor: (p) => { $('cursorPos').textContent = p ? `x ${p[0].toFixed(0)}  y ${p[1].toFixed(0)}` : '—'; },
    showGuides: () => $('showGuides').checked,
    showGrid: () => $('showGrid').checked,
  });

  // ---- UI building ----
  function buildTools() {
    $('toolGrid').innerHTML = TOOLS.map((t) =>
      `<button data-tool="${t.id}" title="${t.name} (${t.key})"><svg viewBox="0 0 20 20">${t.icon}</svg>${t.name}<kbd>${t.key}</kbd></button>`).join('');
    $('toolGrid').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tool]');
      if (b) setTool(b.dataset.tool);
    });
    $('palette').innerHTML = PALETTE.map((c) => `<i style="background:${c}" data-c="${c}" title="${c}"></i>`).join('');
    $('palette').addEventListener('click', (e) => { if (e.target.dataset.c) setColor('strokeColor', e.target.dataset.c); });
    $('palette').addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (e.target.dataset.c) { $('fillOn').checked = true; setColor('fillColor', e.target.dataset.c); }
    });
    $('templateSel').innerHTML = T.list.map((t) => `<option value="${t.id}">${t.name}</option>`).join('');
  }

  function setColor(id, c) {
    $(id).value = c;
    $(id).dispatchEvent(new Event('input'));
    $(id).dispatchEvent(new Event('change'));
  }

  function setTool(t) {
    st.tool = t;
    document.querySelectorAll('#toolGrid button').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
    $('canvas').setAttribute('class', `t-${t}`);
    $('toolHint').textContent = HINTS[t];
    if (t !== 'select' && ed.sel >= 0) ed.select(-1);
  }

  function buildTabs() {
    $('slotTabs').innerHTML = C.EXPR_KEYS.map((k) =>
      `<div class="slot-tab" data-k="${k}"><div class="thumb"></div><span>${C.EXPR_LABELS[k]}</span><small>${k}</small></div>`).join('');
    $('slotTabs').addEventListener('click', (e) => {
      const t = e.target.closest('.slot-tab');
      if (t) switchSlot(t.dataset.k);
    });
  }

  function switchSlot(k) {
    st.key = k;
    ed.sel = -1;
    refresh();
    syncSelection();
  }

  const svgURL = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

  function refreshTabs() {
    for (const el of document.querySelectorAll('.slot-tab')) {
      const k = el.dataset.k, sl = st.doc.slots[k];
      el.classList.toggle('active', k === st.key);
      const empty = S.slotIsEmpty(sl);
      el.classList.toggle('bad', empty);
      el.querySelector('.thumb').innerHTML = empty ? '<div class="empty"></div>'
        : `<img class="chk" src="${svgURL(S.slotSVG(sl, st.doc.size))}">`;
      el.querySelector('small').textContent = empty ? `${k} · 空` : k;
    }
    $('curLabel').textContent = `${C.EXPR_LABELS[st.key]} · ${st.key}`;
    $('copyTarget').innerHTML = ['<option value="*">复制到其它全部表情</option>']
      .concat(C.EXPR_KEYS.filter((k) => k !== st.key).map((k) => `<option value="${k}">复制到 ${C.EXPR_LABELS[k]}</option>`)).join('');
  }

  function refreshLayers() {
    const objs = slot().objects;
    $('layerCount').textContent = objs.length ? `(${objs.length})` : '';
    if (!objs.length) { $('layerList').innerHTML = '<li class="none">暂无图层，用画笔开始绘制或导入图片</li>'; return; }
    let h = '';
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      const c = o.type === 'pixels' ? (o.layers[0] || {}).color : (o.fill || o.stroke);
      const extra = o.type === 'pixels' ? `${o.gw}×${o.gh} · ${o.layers.length}色` : (o.type === 'pen' ? `${o.points.length}点` : '');
      h += `<li data-i="${i}" class="${i === ed.sel ? 'sel' : ''}"><i style="background:${c || 'transparent'}"></i>${TYPE_NAMES[o.type] || o.type} ${i + 1}<small>${extra}</small></li>`;
    }
    $('layerList').innerHTML = h;
  }

  function refreshSlotPanel() {
    const bg = slot().background;
    $('bgOn').checked = !!bg;
    if (bg) $('bgColor').value = bg;
  }

  let checkTimer = 0;
  function refreshChecks() {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => {
      const v = PK.validate(st.doc);
      const kb = (b) => (b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`);
      let h = '<table>';
      for (const k of C.EXPR_KEYS) {
        const s = v.stats[k];
        const bad = S.slotIsEmpty(st.doc.slots[k]) || s.bytes > C.MAX_FILE_BYTES;
        h += `<tr><td class="${bad ? 'err' : 'ok'}">${bad ? '✕' : '✓'}</td><td>${C.EXPR_LABELS[k]}</td><td>${kb(s.bytes)}</td><td class="${s.shapes > C.SHAPES_WARN ? 'err' : ''}">${s.shapes} 图形</td></tr>`;
      }
      h += `<tr><td></td><td>合计</td><td class="${v.total > C.MAX_PACK_BYTES ? 'err' : ''}">${kb(v.total)} / 4 MB</td></tr></table>`;
      if (v.errors.length || v.warnings.length) {
        h += '<ul>' + v.errors.map((e) => `<li class="err">${e}</li>`).join('')
          + v.warnings.map((e) => `<li class="warn">${e}</li>`).join('') + '</ul>';
      } else h += '<p class="ok">✓ 可以导出</p>';
      $('checkList').innerHTML = h;
    }, 250);
  }

  function refresh() {
    ed.render();
    refreshTabs();
    refreshLayers();
    refreshSlotPanel();
    refreshChecks();
    renderDevice($('miniDevice'), st.key, 'night', 0.5);
    $('btnUndo').disabled = !st.hist[st.key].undo.length;
    $('btnRedo').disabled = !st.hist[st.key].redo.length;
  }

  /* reflect the selected object's style in the controls */
  function syncSelection() {
    refreshLayers();
    const o = ed.selected();
    if (!o || o.type === 'pixels') { if (o) $('opacity').value = Math.round((o.opacity ?? 1) * 100); updateLabels(); return; }
    if (o.stroke) { $('strokeColor').value = o.stroke; $('strokeOn').checked = true; } else $('strokeOn').checked = false;
    if (o.fill) { $('fillColor').value = o.fill; $('fillOn').checked = true; } else if (o.type !== 'line') $('fillOn').checked = false;
    if (o.width) $('width').value = Math.round(o.width);
    $('opacity').value = Math.round((o.opacity ?? 1) * 100);
    if (o.type === 'rect') $('radius').value = Math.round(o.rx || 0);
    if (o.type === 'pen') $('penClosed').checked = !!o.closed;
    updateLabels();
  }

  function updateLabels() {
    $('widthVal').textContent = $('width').value;
    $('opacityVal').textContent = `${$('opacity').value}%`;
    $('radiusVal').textContent = $('radius').value;
  }

  /* style control -> selected object */
  let styleTxn = false;
  function applyStyleToSelection() {
    updateLabels();
    const o = ed.selected();
    if (!o) return;
    if (!styleTxn) { beforeChange(); styleTxn = true; }
    const s = style();
    o.opacity = s.opacity;
    if (o.type !== 'pixels') {
      if (o.type === 'line') { o.stroke = s.stroke; o.width = s.width; } else {
        o.stroke = s.strokeOn ? s.stroke : null;
        o.width = s.strokeOn ? s.width : 0;
        o.fill = s.fillOn ? s.fill : null;
        if (!o.stroke && !o.fill) { o.stroke = s.stroke; o.width = s.width; }
      }
      if (o.type === 'rect') o.rx = s.radius;
      if (o.type === 'pen') o.closed = s.closed;
    }
    setDirty(true);
    ed.render();
    refreshTabs();
    refreshChecks();
  }

  function bindControls() {
    for (const id of ['strokeColor', 'fillColor', 'width', 'opacity', 'radius']) {
      $(id).addEventListener('input', applyStyleToSelection);
      $(id).addEventListener('change', () => { if (styleTxn) { styleTxn = false; refresh(); } });
    }
    for (const id of ['strokeOn', 'fillOn', 'penClosed']) {
      $(id).addEventListener('change', () => { applyStyleToSelection(); styleTxn = false; refresh(); });
    }
    $('fillColor').addEventListener('input', () => { if (!$('fillOn').checked && !ed.selected()) $('fillOn').checked = true; });
    $('bgOn').addEventListener('change', () => { beforeChange(); slot().background = $('bgOn').checked ? $('bgColor').value : null; afterChange(); });
    $('bgColor').addEventListener('input', () => {
      if (!$('bgOn').checked) $('bgOn').checked = true;
      if (!styleTxn) { beforeChange(); styleTxn = true; }
      slot().background = $('bgColor').value;
      ed.render();
    });
    $('bgColor').addEventListener('change', () => { styleTxn = false; afterChange(); });
    $('showGuides').addEventListener('change', () => ed.drawGuides());
    $('showGrid').addEventListener('change', () => ed.drawGuides());
    $('layerList').addEventListener('click', (e) => {
      const li = e.target.closest('li[data-i]');
      if (!li) return;
      setTool('select');
      ed.select(Number(li.dataset.i));
    });
    $('btnUp').onclick = () => reorder(1);
    $('btnDown').onclick = () => reorder(-1);
    $('btnDup').onclick = duplicate;
    $('btnDel').onclick = removeSelected;
    $('btnUndo').onclick = () => undoRedo(false);
    $('btnRedo').onclick = () => undoRedo(true);
    $('btnClear').onclick = async () => {
      if (S.slotIsEmpty(slot())) return;
      if (!(await ask('清空表情', `确定清空「${C.EXPR_LABELS[st.key]}」的全部内容吗？（可撤销）`))) return;
      beforeChange(); st.doc.slots[st.key] = S.newSlot(); ed.sel = -1; afterChange();
    };
    $('btnTemplate').onclick = applyTemplate;
    $('btnCopyTo').onclick = copyTo;
    $('packName').addEventListener('input', () => { st.doc.name = $('packName').value; setDirty(true); refreshChecks(); });
    $('canvasSize').addEventListener('change', resizeCanvas);
    $('btnNew').onclick = newProject;
    $('btnOpen').onclick = openProject;
    $('btnSave').onclick = () => saveProject(false);
    $('btnImport').onclick = () => $('imageFile').click();
    $('btnExport').onclick = exportPack;
    $('btnPreview').onclick = openPreview;
    $('miniDevice').onclick = openPreview;
    $('imageFile').addEventListener('change', () => {
      const f = $('imageFile').files[0];
      $('imageFile').value = '';
      if (f) openImport(f);
    });
    const wrap = $('canvasWrap');
    wrap.addEventListener('dragover', (e) => { e.preventDefault(); wrap.classList.add('drop'); });
    wrap.addEventListener('dragleave', () => wrap.classList.remove('drop'));
    wrap.addEventListener('drop', (e) => {
      e.preventDefault(); wrap.classList.remove('drop');
      const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
      if (f) openImport(f);
    });
    window.addEventListener('resize', () => ed.render());
  }

  function reorder(dir) {
    const i = ed.sel, objs = slot().objects, j = i + dir;
    if (i < 0 || j < 0 || j >= objs.length) return;
    beforeChange();
    [objs[i], objs[j]] = [objs[j], objs[i]];
    ed.sel = j;
    afterChange();
  }

  function duplicate() {
    const o = ed.selected();
    if (!o) return;
    beforeChange();
    const c = S.translate(S.clone(o), 10, 10);
    slot().objects.push(c);
    ed.sel = slot().objects.length - 1;
    afterChange();
  }

  function removeSelected() {
    if (ed.sel < 0) return;
    beforeChange();
    slot().objects.splice(ed.sel, 1);
    ed.sel = -1;
    afterChange();
  }

  function nudge(dx, dy) {
    const o = ed.selected();
    if (!o) return;
    beforeChange();
    S.translate(o, dx, dy);
    afterChange();
  }

  async function applyTemplate() {
    const id = $('templateSel').value;
    const all = $('templateAll').checked;
    const keys = all ? C.EXPR_KEYS : [st.key];
    const used = keys.filter((k) => !S.slotIsEmpty(st.doc.slots[k]));
    if (used.length && !(await ask('套用模板', `将替换 ${used.map((k) => C.EXPR_LABELS[k]).join('、')} 的现有内容（可撤销），继续吗？`))) return;
    const cur = st.key;
    for (const k of keys) {
      st.key = k;
      beforeChange();
      st.doc.slots[k] = { background: null, objects: T.build(id, k, st.doc.size) };
    }
    st.key = cur;
    ed.sel = -1;
    afterChange();
    toast(all ? '已套用到全部表情' : '已套用模板');
  }

  async function copyTo() {
    const t = $('copyTarget').value;
    const keys = t === '*' ? C.EXPR_KEYS.filter((k) => k !== st.key) : [t];
    const used = keys.filter((k) => !S.slotIsEmpty(st.doc.slots[k]));
    if (used.length && !(await ask('复制表情', `将覆盖 ${used.map((k) => C.EXPR_LABELS[k]).join('、')} 的现有内容（可撤销），继续吗？`))) return;
    const src = JSON.stringify(slot()), cur = st.key;
    for (const k of keys) {
      st.key = k;
      beforeChange();
      const c = JSON.parse(src);
      c.objects.forEach((o) => { o.id = S.uid(); });
      st.doc.slots[k] = c;
    }
    st.key = cur;
    afterChange();
    toast(`已复制到 ${keys.length} 个表情`);
  }

  async function resizeCanvas() {
    const n = Number($('canvasSize').value), o = st.doc.size;
    if (n === o) return;
    const hasContent = C.EXPR_KEYS.some((k) => !S.slotIsEmpty(st.doc.slots[k]));
    if (hasContent && await ask('调整画布', `是否将现有内容按比例从 ${o}px 缩放到 ${n}px？\n选择“取消”则保持原尺寸、仅扩展/裁切画布。`)) {
      const s = n / o;
      for (const k of C.EXPR_KEYS) {
        for (const ob of st.doc.slots[k].objects) { S.scale(ob, s, s, 0, 0); if (ob.width) ob.width *= s; }
      }
    }
    st.doc.size = n;
    resetHistory();
    setDirty(true);
    refresh();
  }

  // ---- modal helpers ----
  function ask(title, body, okText, showCancel = true) {
    return new Promise((resolve) => {
      $('msgTitle').textContent = title;
      if (body instanceof Node) { $('msgBody').innerHTML = ''; $('msgBody').appendChild(body); } else $('msgBody').textContent = body;
      $('msgOk').textContent = okText || '确定';
      $('msgCancel').hidden = !showCancel;
      $('msgModal').hidden = false;
      const done = (v) => { $('msgModal').hidden = true; $('msgOk').onclick = $('msgCancel').onclick = null; resolve(v); };
      $('msgOk').onclick = () => done(true);
      $('msgCancel').onclick = () => done(false);
    });
  }
  const info = (title, body) => ask(title, body, '确定', false);

  let toastTimer = 0;
  function toast(msg) {
    $('toast').textContent = msg;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2600);
  }

  // ---- image import ----
  const imp = { img: null, result: null, timer: 0, url: null };

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取该图片')); };
      img.src = url;
    });
  }

  /* progressive halving keeps downsampled colours faithful */
  function sample(img, gw, gh) {
    let w = img.naturalWidth || img.width || 512, h = img.naturalHeight || img.height || 512;
    let src = img;
    if (!img.naturalWidth) { w = h = 512; }
    while (w / 2 >= gw * 2 && h / 2 >= gh * 2) {
      const c = document.createElement('canvas');
      c.width = Math.round(w / 2); c.height = Math.round(h / 2);
      const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(src, 0, 0, c.width, c.height);
      src = c; w = c.width; h = c.height;
    }
    const c = document.createElement('canvas');
    c.width = gw; c.height = gh;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingQuality = 'high';
    x.drawImage(src, 0, 0, gw, gh);
    return x.getImageData(0, 0, gw, gh).data;
  }

  function importParams() {
    const p = {
      res: Number($('impRes').value), colors: Number($('impColors').value),
      removeBg: $('impRemoveBg').checked, bgTolerance: Number($('impTol').value),
      alphaThreshold: Number($('impAlpha').value), fit: Number($('impFit').value) / 100,
      denoise: $('impDenoise').checked,
    };
    $('impResVal').textContent = `${p.res} 格`;
    $('impColorsVal').textContent = p.colors;
    $('impTolVal').textContent = p.bgTolerance;
    $('impAlphaVal').textContent = p.alphaThreshold;
    $('impFitVal').textContent = `${Math.round(p.fit * 100)}%`;
    return p;
  }

  function computeImport() {
    const p = importParams();
    const img = imp.img;
    if (!img) return;
    const w = img.naturalWidth || 512, h = img.naturalHeight || 512;
    const gw = w >= h ? p.res : Math.max(1, Math.round(p.res * w / h));
    const gh = h >= w ? p.res : Math.max(1, Math.round(p.res * h / w));
    const r = V.vectorize(sample(img, gw, gh), gw, gh, p);
    const size = st.doc.size;
    const cell = (size * p.fit) / Math.max(gw, gh);
    const o = { id: S.uid(), type: 'pixels', x: (size - gw * cell) / 2, y: (size - gh * cell) / 2,
      cell, gw, gh, layers: r.layers, opacity: 1 };
    imp.result = o;
    const svg = S.slotSVG({ background: null, objects: [o] }, size);
    $('impOutBox').innerHTML = `<img src="${svgURL(svg)}">`;
    const rects = PK.shapeCount(svg);
    const bytes = PK.byteLen(svg);
    $('impStats').innerHTML = `网格 ${gw}×${gh} · ${r.layers.length} 种颜色 · ${rects} 个色块`
      + (rects > C.SHAPES_WARN ? ' <span style="color:var(--danger)">色块较多，设备渲染会变慢</span>' : '') + '<br>'
      + `SVG 大小约 <b>${(bytes / 1024).toFixed(1)} KB</b>`
      + (bytes > C.MAX_FILE_BYTES ? ' <span style="color:var(--danger)">超过 1MB，请降低分辨率或颜色数</span>' : '');
  }

  async function openImport(file) {
    try {
      const { img, url } = await loadImage(file);
      if (imp.url) URL.revokeObjectURL(imp.url);
      imp.img = img; imp.url = url;
      $('impSrcBox').innerHTML = '';
      $('impSrcBox').appendChild(img);
      $('importModal').hidden = false;
      $('impMode').value = S.slotIsEmpty(slot()) ? 'replace' : 'add';
      computeImport();
    } catch (e) {
      info('导入失败', e.message);
    }
  }

  function bindImport() {
    for (const id of ['impRes', 'impColors', 'impRemoveBg', 'impDenoise', 'impTol', 'impAlpha', 'impFit']) {
      $(id).addEventListener('input', () => {
        importParams();
        clearTimeout(imp.timer);
        imp.timer = setTimeout(computeImport, 120);
      });
    }
    $('impChoose').onclick = () => $('imageFile').click();
    $('impCancel').onclick = () => { $('importModal').hidden = true; };
    $('impOk').onclick = () => {
      const o = imp.result;
      if (!o || !o.layers.length) { info('导入失败', '生成结果为空，请调整透明阈值或关闭去除背景。'); return; }
      beforeChange();
      if ($('impMode').value === 'replace') st.doc.slots[st.key] = { background: null, objects: [o] };
      else slot().objects.push(o);
      imp.result = null;
      $('importModal').hidden = true;
      setTool('select');
      ed.sel = slot().objects.length - 1;
      afterChange();
      syncSelection();
      toast(`已导入到「${C.EXPR_LABELS[st.key]}」，可拖动/缩放调整位置`);
    };
    importParams();
  }

  // ---- preview ----
  function renderDevice(host, key, theme, scale) {
    const sl = st.doc.slots[key], size = st.doc.size;
    const empty = S.slotIsEmpty(sl);
    const img = empty ? '<div class="placeholder">（未绘制）</div>'
      : `<img src="${svgURL(S.slotSVG(sl, size))}" style="width:${size}px;height:${size}px;left:${C.FACE_CX - size / 2}px;top:${C.FACE_CY - size / 2}px">`;
    const dev = `<div class="device ${theme}" style="transform:scale(${scale});transform-origin:top center;margin-bottom:${-C.SCREEN_H * (1 - scale)}px">`
      + `<div class="batt">85%</div><div class="name">${C.EXPR_CAPTIONS[key]}</div>`
      + `<div class="facebox">${img}</div><div class="hint">Shake / Turn / Tap my face</div></div>`;
    host.innerHTML = dev;
  }

  let pvTimer = 0;
  function renderPreview() {
    const theme = $('pvTheme').value;
    renderDevice($('pvDevice'), st.pvKey, theme, 1);
    $('pvName').textContent = `${st.doc.name} · ${C.EXPR_LABELS[st.pvKey]}`;
    $('pvGrid').innerHTML = C.EXPR_KEYS.map((k) => {
      const sl = st.doc.slots[k];
      const src = S.slotIsEmpty(sl) ? '' : svgURL(S.slotSVG(sl, st.doc.size));
      return `<div class="pv-cell ${theme === 'day' ? 'day' : ''} ${k === st.pvKey ? 'active' : ''}" data-k="${k}">`
        + `${src ? `<img src="${src}">` : '<img alt="">'}<div>${C.EXPR_LABELS[k]} · ${C.EXPR_CAPTIONS[k]}</div></div>`;
    }).join('');
  }

  function openPreview() {
    st.pvKey = st.key;
    $('previewModal').hidden = false;
    renderPreview();
    restartAuto();
  }

  function restartAuto() {
    clearInterval(pvTimer);
    if (!$('pvAuto').checked || $('previewModal').hidden) return;
    pvTimer = setInterval(() => {
      const i = C.EXPR_KEYS.indexOf(st.pvKey);
      st.pvKey = C.EXPR_KEYS[(i + 1) % C.EXPR_KEYS.length];
      renderPreview();
    }, 1600);
  }

  function bindPreview() {
    $('pvClose').onclick = () => { $('previewModal').hidden = true; clearInterval(pvTimer); };
    $('pvAuto').onchange = restartAuto;
    $('pvTheme').onchange = renderPreview;
    $('pvGrid').addEventListener('click', (e) => {
      const c = e.target.closest('.pv-cell');
      if (!c) return;
      st.pvKey = c.dataset.k;
      $('pvAuto').checked = false;
      restartAuto();
      renderPreview();
    });
  }

  // ---- export / project io ----
  function svgToPng(svg, px) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = px;
        c.getContext('2d').drawImage(img, 0, 0, px, px);
        c.toBlob(async (b) => (b ? resolve(new Uint8Array(await b.arrayBuffer())) : reject(new Error('PNG 编码失败'))), 'image/png');
      };
      img.onerror = () => reject(new Error('SVG 渲染失败'));
      img.src = svgURL(svg);
    });
  }

  async function saveAs(defaultPath, filters, data) {
    if (api) return api.saveFile({ title: '保存', defaultPath, filters, data });
    const blob = new Blob([data]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = defaultPath; a.click();
    return defaultPath;
  }

  const safeName = () => (st.doc.name || 'emoji').replace(/[\\/:*?"<>|]/g, '_').trim() || 'emoji';

  async function exportPack() {
    const v = PK.validate(st.doc);
    if (v.errors.length) {
      const box = document.createElement('div');
      box.innerHTML = '<p>以下问题需要处理后才能导出（KLaboo-Server 会拒绝不合格的表情包）：</p>'
        + v.errors.map((e) => `<div class="err">✕ ${e}</div>`).join('');
      await info('无法导出', box);
      return;
    }
    if (v.warnings.length && !(await ask('导出提示', v.warnings.join('\n') + '\n\n仍然导出吗？'))) return;
    try {
      const preview = await svgToPng(v.files.smile, 256);
      const { data } = await PK.buildZip(self.JSZip, st.doc, { 'preview.png': preview });
      const p = await saveAs(`${safeName()}.zip`, [{ name: '表情包 zip', extensions: ['zip'] }], data);
      if (p) toast(`已导出 ${(data.length / 1024).toFixed(1)} KB → ${p}`);
    } catch (e) {
      info('导出失败', e.message);
    }
  }

  async function exportSvg() {
    const svg = S.slotSVG(slot(), st.doc.size);
    const p = await saveAs(`${st.key}.svg`, [{ name: 'SVG', extensions: ['svg'] }], svg);
    if (p) toast(`已导出 ${p}`);
  }

  async function exportPng() {
    const png = await svgToPng(S.slotSVG(slot(), st.doc.size), st.doc.size);
    const p = await saveAs(`${st.key}.png`, [{ name: 'PNG', extensions: ['png'] }], png);
    if (p) toast(`已导出 ${p}`);
  }

  async function saveProject(forceAs) {
    const data = JSON.stringify(st.doc);
    let p = null;
    if (st.filePath && !forceAs && api) p = await api.writeFile(st.filePath, data);
    else p = await saveAs(`${safeName()}.klemoji`, [{ name: 'KLaboo 表情工程', extensions: ['klemoji'] }], data);
    if (!p) return;
    st.filePath = p;
    setDirty(false);
    toast(`工程已保存 → ${p}`);
  }

  function loadDoc(doc, filePath) {
    st.doc = doc;
    st.filePath = filePath || null;
    st.key = C.EXPR_KEYS[0];
    ed.sel = -1;
    resetHistory();
    $('packName').value = doc.name;
    if (![...$('canvasSize').options].some((o) => Number(o.value) === doc.size)) {
      $('canvasSize').add(new Option(`${doc.size} px`, doc.size));
    }
    $('canvasSize').value = String(doc.size);
    setDirty(false);
    refresh();
  }

  async function openProject() {
    if (st.dirty && !(await ask('打开工程', '当前工程有未保存的修改，确定放弃吗？'))) return;
    if (!api) return;
    const f = await api.openFile({ title: '打开工程', filters: [{ name: 'KLaboo 表情工程', extensions: ['klemoji', 'json'] }], encoding: 'utf8' });
    if (!f) return;
    try {
      loadDoc(S.normalizeDoc(JSON.parse(f.data)), f.path);
      toast(`已打开 ${f.name}`);
    } catch (e) {
      info('打开失败', e.message);
    }
  }

  async function newProject() {
    if (st.dirty && !(await ask('新建', '当前工程有未保存的修改，确定放弃吗？'))) return;
    loadDoc(S.newDoc('我的表情', C.DEFAULT_SIZE));
  }

  // ---- keyboard / menu ----
  function onKey(e) {
    if (!$('importModal').hidden || !$('previewModal').hidden || !$('msgModal').hidden) {
      if (e.key === 'Escape') { $('importModal').hidden = true; $('previewModal').hidden = true; clearInterval(pvTimer); }
      return;
    }
    if (e.target.matches('input[type=text], select')) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); undoRedo(e.shiftKey); return; }
    if (mod && k === 'y') { e.preventDefault(); undoRedo(true); return; }
    if (mod && k === 'd') { e.preventDefault(); duplicate(); return; }
    if (mod && e.key === ']') { e.preventDefault(); reorder(1); return; }
    if (mod && e.key === '[') { e.preventDefault(); reorder(-1); return; }
    if (mod) return;
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); removeSelected(); return; }
    if (k === 'escape') { ed.select(-1); return; }
    const arrows = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
    if (arrows[k] && ed.selected()) {
      e.preventDefault();
      const s = e.shiftKey ? 10 : 1;
      nudge(arrows[k][0] * s, arrows[k][1] * s);
      return;
    }
    if (e.key === '[' || e.key === ']') {
      $('width').value = Number($('width').value) + (e.key === ']' ? 1 : -1);
      applyStyleToSelection(); styleTxn = false;
      return;
    }
    if (/^[1-6]$/.test(e.key)) { switchSlot(C.EXPR_KEYS[Number(e.key) - 1]); return; }
    const t = TOOLS.find((x) => x.key.toLowerCase() === k);
    if (t) setTool(t.id);
  }

  const MENU = {
    new: newProject, open: openProject, save: () => saveProject(false), saveAs: () => saveProject(true),
    importImage: () => $('imageFile').click(), exportPack, exportSvg, exportPng,
    undo: () => undoRedo(false), redo: () => undoRedo(true), preview: openPreview,
  };

  // ---- boot ----
  buildTools();
  buildTabs();
  bindControls();
  bindImport();
  bindPreview();
  document.addEventListener('keydown', onKey);
  if (api) api.onMenu((a) => MENU[a] && MENU[a]());
  $('packName').value = st.doc.name;
  $('canvasSize').value = String(st.doc.size);
  setTool('pen');
  updateLabels();
  refresh();
  setDirty(false);

  // exposed for automated UI tests
  self.KL_APP = { st, ed, refresh, loadDoc, exportPack, openImport, MENU };
})();
