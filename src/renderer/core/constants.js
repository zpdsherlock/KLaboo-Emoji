/* Format contract shared with the KLaboo firmware (main/face_ui.c,
 * main/emoji_service.c) and KLaboo-Server (app/emojis.py). */
(function (root) {
  const KL_CONST = {
    // one slot per face_expr_t; a pack is only valid with all six
    EXPR_KEYS: ['smile', 'excited', 'panic', 'dizzy', 'sleepy', 'wink'],
    EXPR_LABELS: {
      smile: '微笑', excited: '兴奋', panic: '惊慌',
      dizzy: '晕眩', sleepy: '困倦', wink: '眨眼',
    },
    // captions the firmware shows under the face (face_ui.c s_names)
    EXPR_CAPTIONS: {
      smile: 'Happy', excited: 'Go! Go!', panic: 'Whoa!!',
      dizzy: 'Dizzy', sleepy: 'Sleepy', wink: 'Hehe~',
    },
    MANIFEST_FORMAT: 1,
    MAX_FILE_BYTES: 1024 * 1024,      // per expression svg
    MAX_PACK_BYTES: 4 * 1024 * 1024,  // six svgs together
    // frame animation: mirrors KLaboo-Server MAX_FRAMES / fps bounds;
    // the device's PSRAM bake budget favours few simple frames
    MAX_FRAMES: 8,
    FPS_DEFAULT: 8,
    FPS_MIN: 1,
    FPS_MAX: 25,
    // whole-image motions the firmware plays on top of the (static or
    // animated) image: face_ui.c pack_anim_t / server ANIM_NAMES
    ANIM_NAMES: ['none', 'breathe', 'shake', 'sway', 'pulse', 'bounce'],
    ANIM_LABELS: {
      none: '无', breathe: '呼吸浮动', shake: '颤抖',
      sway: '左右摇摆', pulse: '脉动缩放', bounce: '上下弹跳',
    },
    // per-expression shape budget (path subpaths + basic shapes): the
    // device rasterises each one; KLaboo-Server rejects above SHAPES_MAX
    SHAPES_WARN: 1500,
    SHAPES_MAX: 4000,
    // svg elements LVGL's svg decoder (LV_USE_SVG + ThorVG) renders;
    // text/image/filter/mask/clipPath/style are not supported on device
    SVG_TAGS: ['svg', 'g', 'defs', 'use', 'path', 'rect', 'circle',
      'ellipse', 'line', 'polyline', 'polygon', 'linearGradient',
      'radialGradient', 'stop', 'solidColor'],
    DEFAULT_SIZE: 320,
    // ESP32-S3-Touch-AMOLED-2.06: 410x502 screen, face box 410x376;
    // the pack image is drawn at its intrinsic size centred on (205,217)
    SCREEN_W: 410,
    SCREEN_H: 502,
    FACE_BOX_W: 410,
    FACE_BOX_H: 376,
    FACE_CX: 205,
    FACE_CY: 217,
    // largest image that still fits the face box when centred there
    MAX_FIT_W: 410,
    MAX_FIT_H: 2 * Math.min(217, 376 - 217),
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = KL_CONST;
  else root.KL_CONST = KL_CONST;
})(typeof self !== 'undefined' ? self : this);
