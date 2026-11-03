/* Pack export/validation - mirrors KLaboo-Server emojis.extract_pack:
 * zip with manifest.json {format, name, expressions:{key: spec}} where
 * spec is either "key.svg" (static), {file, anim} or
 * {frames:[...], fps, anim}; the zip carries one svg per frame
 * (<key>.svg or <key>_f<i>.svg, each <=1MB, together <=4MB). */
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

  /* the frames an expression exports: slot content is frame 0,
   * slot.frames[] the rest */
  function frameSlots(doc, k) {
    const sl = doc.slots[k];
    const n = Math.min(S.frameCount(sl), C.MAX_FRAMES);
    const out = [];
    for (let i = 0; i < n; i++) out.push(S.frameAt(sl, i));
    return out;
  }

  /* -> {filename: svg}: "<key>.svg" for static, "<key>_f<i>.svg" frames */
  function buildFiles(doc) {
    const files = {};
    for (const k of C.EXPR_KEYS) {
      const fs = frameSlots(doc, k);
      fs.forEach((f, i) => {
        const name = fs.length > 1 ? `${k}_f${i}` : k;
        files[`${name}.svg`] = S.slotSVG(f, doc.size);
      });
    }
    return files;
  }

  function manifest(doc) {
    const expressions = {};
    for (const k of C.EXPR_KEYS) {
      const sl = doc.slots[k];
      const n = frameSlots(doc, k).length;
      const anim = C.ANIM_NAMES.includes(sl.anim) ? sl.anim : 'none';
      if (n > 1) {
        expressions[k] = {
          frames: Array.from({ length: n }, (_, i) => `${k}_f${i}.svg`),
          fps: sl.fps || C.FPS_DEFAULT, anim,
        };
      } else if (anim !== 'none') {
        expressions[k] = { file: `${k}.svg`, anim };
      } else {
        expressions[k] = `${k}.svg`;
      }
    }
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

  /* -> {errors:[], warnings:[], stats:{key:{frames, bytes, maxBytes,
   * elements, cmds, shapes}}, total, files:{name: svg}} */
  function validate(doc) {
    const errors = [], warnings = [], stats = {};
    let total = 0;
    if (!String(doc.name || '').trim()) errors.push('表情包名称不能为空');
    const files = buildFiles(doc);
    for (const k of C.EXPR_KEYS) {
      const fs = frameSlots(doc, k);
      const label = `${C.EXPR_LABELS[k]}(${k})`;
      const st = { frames: fs.length, bytes: 0, maxBytes: 0,
        elements: 0, cmds: 0, shapes: 0 };
      fs.forEach((f, i) => {
        const svg = files[`${fs.length > 1 ? `${k}_f${i}` : k}.svg`];
        const bytes = byteLen(svg);
        const shapes = shapeCount(svg);
        const tag = fs.length > 1 ? `${label} 第${i + 1}帧` : label;
        st.bytes += bytes;
        st.maxBytes = Math.max(st.maxBytes, bytes);
        st.shapes = Math.max(st.shapes, shapes);
        st.elements += (svg.match(/<[a-zA-Z]/g) || []).length - 1;
        st.cmds += (svg.match(/[MLQHVZmlqhvz]/g) || []).length;
        total += bytes;
        if (S.slotIsEmpty(f)) errors.push(`${tag} 还没有内容`);
        if (bytes > C.MAX_FILE_BYTES) {
          errors.push(`${tag} 超过 1MB 限制 (${(bytes / 1024).toFixed(0)} KB)`);
        }
        for (const iss of lintSVG(svg)) errors.push(`${tag}: ${iss}`);
        if (shapes > C.SHAPES_MAX) {
          errors.push(`${tag} 图形过于复杂 (${shapes} 个子图形)，超过服务器上限 ${C.SHAPES_MAX}，请降低导入分辨率/颜色数或开启"去除噪点"`);
        } else if (shapes > C.SHAPES_WARN) {
          warnings.push(`${tag} 图形较多 (${shapes} 个子图形)，设备首次渲染会变慢，建议降低导入分辨率/颜色数或开启"去除噪点"`);
        }
      });
      if (S.frameCount(doc.slots[k]) > C.MAX_FRAMES) {
        errors.push(`${label} 超过 ${C.MAX_FRAMES} 帧上限`);
      }
      if (fs.length > 1) {
        const fps = Number(doc.slots[k].fps);
        if (!Number.isFinite(fps) || fps < C.FPS_MIN || fps > C.FPS_MAX) {
          errors.push(`${label} 帧率需在 ${C.FPS_MIN}~${C.FPS_MAX} 之间`);
        } else if (fs.length >= C.MAX_FRAMES
                   && st.maxBytes > 300 * 1024) {
          warnings.push(`${label} ${fs.length} 帧 × ${(st.maxBytes / 1024).toFixed(0)}KB，设备内存可能只烘焙部分帧，建议减少帧数或缩小画布`);
        }
      }
      const anim = doc.slots[k].anim || 'none';
      if (!C.ANIM_NAMES.includes(anim)) errors.push(`${label} 动效 ${anim} 不受支持`);
      stats[k] = st;
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
    for (const [n, svg] of Object.entries(v.files)) zip.file(n, svg);
    for (const [n, data] of Object.entries(extras || {})) zip.file(n, data);
    const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE',
      compressionOptions: { level: 9 } });
    return { data: out, validation: v };
  }

  const KL_PACK = { lintSVG, buildFiles, manifest, validate, buildZip, byteLen, shapeCount };
  if (node) module.exports = KL_PACK;
  else root.KL_PACK = KL_PACK;
})(typeof self !== 'undefined' ? self : this);
