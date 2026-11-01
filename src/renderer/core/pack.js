/* Pack export/validation - mirrors KLaboo-Server emojis.extract_pack:
 * zip with manifest.json {format, name, expressions:{key: file}} and
 * one svg per expression key (each <=1MB, together <=4MB, starting
 * with <svg / <?xml). */
(function (root) {
  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./constants.js') : root.KL_CONST;
  const S = node ? require('./svgdoc.js') : root.KL_SVG;

  const byteLen = (s) => (typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(s).length : Buffer.byteLength(s, 'utf8'));

  /* tags/attributes the device decoder would drop or choke on */
  function lintSVG(svg) {
    const issues = [];
    const allowed = new Set(C.SVG_TAGS);
    const tags = new Set();
    for (const m of svg.matchAll(/<([a-zA-Z][\w:-]*)/g)) tags.add(m[1]);
    for (const t of tags) if (!allowed.has(t)) issues.push(`不支持的元素 <${t}>`);
    if (/\sstyle\s*=/.test(svg)) issues.push('使用了 style 属性（设备端请用表现属性）');
    if (/\sfilter\s*=|\smask\s*=|\sclip-path\s*=/.test(svg)) issues.push('使用了 filter/mask/clip-path');
    return issues;
  }

  function buildFiles(doc) {
    const files = {};
    for (const k of C.EXPR_KEYS) files[k] = S.slotSVG(doc.slots[k], doc.size);
    return files;
  }

  function manifest(doc) {
    const expressions = {};
    for (const k of C.EXPR_KEYS) expressions[k] = `${k}.svg`;
    return { format: C.MANIFEST_FORMAT, name: doc.name, expressions };
  }

  /* shapes the device rasterises: one per subpath (M) in path data plus
   * every basic shape element - same count as KLaboo-Server */
  function shapeCount(svg) {
    let n = 0;
    for (const m of svg.matchAll(/\sd="([^"]*)"/g)) n += Math.max(1, (m[1].match(/[Mm]/g) || []).length);
    n += (svg.match(/<(rect|circle|ellipse|line|polyline|polygon)\b/g) || []).length;
    return n;
  }

  /* -> {errors:[], warnings:[], stats:{key:{bytes, elements, cmds, shapes}}, total} */
  function validate(doc) {
    const errors = [], warnings = [], stats = {};
    let total = 0;
    if (!String(doc.name || '').trim()) errors.push('表情包名称不能为空');
    const files = buildFiles(doc);
    for (const k of C.EXPR_KEYS) {
      const svg = files[k];
      const bytes = byteLen(svg);
      const elements = (svg.match(/<[a-zA-Z]/g) || []).length - 1;
      const cmds = (svg.match(/[MLQHVZmlqhvz]/g) || []).length;
      const shapes = shapeCount(svg);
      stats[k] = { bytes, elements, cmds, shapes };
      total += bytes;
      const label = `${C.EXPR_LABELS[k]}(${k})`;
      if (S.slotIsEmpty(doc.slots[k])) errors.push(`${label} 还没有内容`);
      if (bytes > C.MAX_FILE_BYTES) errors.push(`${label} 超过 1MB 限制 (${(bytes / 1024).toFixed(0)} KB)`);
      for (const i of lintSVG(svg)) errors.push(`${label}: ${i}`);
      if (shapes > C.SHAPES_MAX) {
        errors.push(`${label} 图形过于复杂 (${shapes} 个子图形)，超过服务器上限 ${C.SHAPES_MAX}，请降低导入分辨率/颜色数或开启"去除噪点"`);
      } else if (shapes > C.SHAPES_WARN) {
        warnings.push(`${label} 图形较多 (${shapes} 个子图形)，设备首次渲染会变慢，建议降低导入分辨率/颜色数或开启"去除噪点"`);
      }
    }
    if (total > C.MAX_PACK_BYTES) errors.push(`表情总量超过 4MB 限制 (${(total / 1048576).toFixed(2)} MB)`);
    if (doc.size > C.MAX_FIT_W || doc.size > C.MAX_FIT_H) {
      warnings.push(`画布 ${doc.size}px 超出设备表情区 (${C.MAX_FIT_W}x${C.MAX_FIT_H})，边缘会被裁切`);
    }
    return { errors, warnings, stats, total, files };
  }

  /* JSZip is injected so the same code runs in renderer and tests.
   * extras: {'preview.png': Uint8Array, ...} - the server uses a file
   * named preview.* as the store thumbnail. */
  async function buildZip(JSZip, doc, extras) {
    const v = validate(doc);
    if (v.errors.length) {
      const e = new Error(v.errors.join('\n'));
      e.validation = v;
      throw e;
    }
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(manifest(doc), null, 2));
    for (const k of C.EXPR_KEYS) zip.file(`${k}.svg`, v.files[k]);
    for (const [n, data] of Object.entries(extras || {})) zip.file(n, data);
    const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE',
      compressionOptions: { level: 9 } });
    return { data: out, validation: v };
  }

  const KL_PACK = { lintSVG, buildFiles, manifest, validate, buildZip, byteLen, shapeCount };
  if (node) module.exports = KL_PACK;
  else root.KL_PACK = KL_PACK;
})(typeof self !== 'undefined' ? self : this);
