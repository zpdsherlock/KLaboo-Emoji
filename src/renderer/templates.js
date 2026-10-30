/* Starting points for a pack. Coordinates are authored on a 320 canvas
 * and scaled to the project size. "firmware" recreates the built-in
 * face_ui.c expressions as editable vector objects. */
(function (root) {
  const S = root.KL_SVG;
  const FEAT = '#664500';
  const base = (o) => Object.assign({ id: S.uid(), stroke: null, fill: null, width: 0, opacity: 1 }, o);
  const E = (cx, cy, rx, ry, fill, stroke, width, opacity) =>
    base({ type: 'ellipse', cx, cy, rx, ry, fill, stroke, width: width || 0, opacity: opacity == null ? 1 : opacity });
  const L = (x1, y1, x2, y2, stroke, width) => base({ type: 'line', x1, y1, x2, y2, stroke, width });
  const P = (points, stroke, width, fill, closed) =>
    base({ type: 'pen', points, stroke: stroke || null, width: width || 0, fill: fill || null, closed: !!closed });
  const R = (x, y, w, h, rx, fill, stroke, width) => base({ type: 'rect', x, y, w, h, rx, fill, stroke, width: width || 0 });

  const face = (fill) => E(160, 160, 140, 140, fill || '#FFCC4D', '#EDA915', 6);
  const smileMouth = () => P([[92, 190], [126, 228], [160, 240], [194, 228], [228, 190]], FEAT, 12);

  const firmware = {
    smile: () => [face(), E(98, 128, 18, 26, FEAT), E(222, 128, 18, 26, FEAT), smileMouth()],
    excited: () => [face('#FFD75E'),
      P([[74, 140], [98, 110], [122, 140]], FEAT, 12), P([[198, 140], [222, 110], [246, 140]], FEAT, 12),
      P([[96, 184], [224, 184], [206, 226], [160, 248], [114, 226]], FEAT, 6, FEAT, true),
      E(160, 230, 30, 13, '#FF8A80'),
      L(268, 70, 300, 56, '#FFFFFF', 7), L(276, 92, 310, 86, '#FFFFFF', 7)],
    panic: () => [face('#FFE1A0'),
      E(98, 132, 28, 36, '#FFFFFF', FEAT, 4), E(222, 132, 28, 36, '#FFFFFF', FEAT, 4),
      E(98, 140, 10, 10, FEAT), E(222, 140, 10, 10, FEAT),
      L(62, 82, 128, 68, FEAT, 8), L(192, 68, 258, 82, FEAT, 8),
      E(160, 222, 20, 26, FEAT),
      P([[268, 92], [282, 116], [278, 132], [262, 134], [256, 118]], null, 0, '#4DA6FF', true)],
    dizzy: () => [face(),
      L(78, 108, 118, 148, FEAT, 10), L(78, 148, 118, 108, FEAT, 10),
      L(202, 108, 242, 148, FEAT, 10), L(202, 148, 242, 108, FEAT, 10),
      P([[104, 214], [122, 200], [141, 214], [160, 200], [179, 214], [198, 200], [216, 214]], FEAT, 9),
      E(70, 46, 9, 9, '#FFD54F'), E(160, 22, 9, 9, '#FFD54F'), E(250, 46, 9, 9, '#FFD54F')],
    sleepy: () => [face('#E4BE63'),
      L(76, 136, 120, 136, FEAT, 10), L(200, 136, 244, 136, FEAT, 10),
      E(160, 220, 14, 16, FEAT),
      P([[248, 44], [272, 44], [248, 70], [272, 70]], '#99A7FF', 6),
      P([[282, 82], [298, 82], [282, 100], [298, 100]], '#99A7FF', 5)],
    wink: () => [face(),
      P([[74, 116], [104, 132], [74, 148]], FEAT, 10),
      E(222, 128, 18, 26, FEAT), smileMouth(),
      E(66, 186, 20, 13, '#FF9E9E', null, 0, 0.7), E(254, 186, 20, 13, '#FF9E9E', null, 0, 0.7)],
  };

  const TEMPLATES = [
    { id: 'firmware', name: '固件内置表情（仿制）', build: (k) => firmware[k]() },
    { id: 'face', name: '黄色圆脸（空白）', build: () => [face()] },
    { id: 'robot', name: '机器人方脸（空白）', build: () => [
      L(160, 44, 160, 14, '#0B2545', 6), E(160, 12, 10, 10, '#FF5C8A'),
      R(30, 44, 260, 232, 64, '#36D1DC', '#0B2545', 6)] },
    { id: 'blob', name: '圆角方块（空白）', build: () => [R(40, 40, 240, 240, 48, '#FFCC4D', '#EDA915', 6)] },
  ];

  function build(id, key, size) {
    const t = TEMPLATES.find((x) => x.id === id);
    const objs = t.build(key);
    const s = size / 320;
    if (s !== 1) for (const o of objs) { S.scale(o, s, s, 0, 0); if (o.width) o.width *= s; }
    return objs;
  }

  root.KL_TEMPLATES = { list: TEMPLATES, build };
})(self);
