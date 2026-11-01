# KLaboo Emoji

KLaboo 表情包制作工具，基于 Electron 的桌面应用（macOS / Windows）。

## 工程概要

KLaboo 是运行在 ESP32-S3-Touch-AMOLED-2.06（410×502 AMOLED）上的桌面伙伴设备，屏幕上用六个表情展示状态。KLaboo Emoji 用来制作这六个表情，并导出成 KLaboo-Server 可直接上传的表情包 zip：

```
KLaboo Emoji ──导出 zip──▶ KLaboo-Server 管理后台上传（extract_pack 校验）
                              │ 用户把表情包应用到设备
                              ▼
KLaboo 设备 ◀── ws 推送 + /api/ota/emoji 下载 ── /spiffs/emj_cur_<key>.svg
              └─ LVGL svg decoder（ThorVG）渲染
```

设备端只支持 SVG 基本元素，所以工具里画的图形和导入的图片最后都会输出成纯矢量 SVG，导出前还会按设备和服务端的规则做一遍检查。

### 目录结构

```
src/
  main.js              主进程：窗口、菜单、文件读写 IPC、未保存退出确认
  preload.js           contextBridge 暴露 window.klabooAPI（沙箱 + contextIsolation）
  renderer/
    index.html         界面布局
    app.js             应用逻辑：工具、图层、模板、导入、预览、导出、快捷键
    editor.js          SVG 画布交互（坐标换算、绘制、选择/缩放）
    templates.js       内置模板（含仿制的固件默认表情）
    style.css
    core/              与 UI 无关的核心模块（UMD，浏览器和 Node 都能加载）
      constants.js     格式约定：表情 key、大小上限、允许的 SVG 元素、设备几何参数
      svgdoc.js        工程文档模型、几何运算、SVG 序列化
      vectorize.js     位图矢量化：k-means 颜色量化、去背景、色块合并
      pack.js          表情包校验与 zip 打包（与 Server extract_pack 规则一致）
test/core.test.js      core 模块单元测试（node:test）
build/icon.png         应用图标（1024×1024）
```

## 软件功能

### 画笔绘制

- 工具：选择 `V`、画笔 `B`、直线 `L`、矩形 `R`、椭圆 `O`、填充 `F`、橡皮 `E`
- 画笔笔迹会自动简化和平滑；勾选「闭合路径」并打开填充，可以画色块
- 样式：描边/填充颜色、粗细、不透明度、矩形圆角；24 色色板（左键设描边色，右键设填充色）
- 图层：选中、拖动、缩放（Shift 等比）、上移/下移、复制、删除、方向键微调
- 填充工具：点图形填色；点空白处设背景色；点导入图片的色块可整块换色
- 橡皮：擦除笔触或图形；在导入的图片上按笔刷粗细擦除像素
- 撤销/重做；可显示网格和「设备可视区」辅助线
- 画布尺寸可选 240 / 280 / 320 / 360 / 400 px（默认 320）

### 模板与表情管理

- 六个表情：微笑 smile、兴奋 excited、惊慌 panic、晕眩 dizzy、困倦 sleepy、眨眼 wink，用 `1`–`6` 切换
- 内置模板：固件内置表情（仿制）、黄色圆脸、机器人方脸、圆角方块；可以只套用到当前表情，也可以套用到全部 6 个
- 可以把当前表情复制到另一个表情，也可以一键清空当前表情

### 图片导入（位图转矢量）

- 支持 PNG / JPG / GIF / WebP / BMP / SVG
- 调好参数后转成纯 `<path>` 矢量，每种颜色一个 path。可调参数：采样分辨率（16–200）、颜色数（2–32）、去除背景（取边缘颜色）及容差、透明阈值、占画布比例
- 原图和生成结果并排对比，实时显示文件大小统计
- 可以替换当前表情内容，也可以添加为新图层

### 表情预览

- 410×502 设备外观模拟，表情区中心在 (205, 217)、大小 410×376，底下显示固件里的表情文字
- 夜间/白天两种主题，可自动轮播六个表情；侧边栏有缩略预览
- 浏览器渲染和设备上的 ThorVG 渲染可能有细微差别

### 导出与工程文件

- **表情包 zip**（`⌘/Ctrl+E`）：`manifest.json` + 6 个 svg + `preview.png`（用微笑表情生成的 256px 缩略图，服务端拿来当列表预览）
- 单张导出：当前表情的 SVG 或 PNG
- 工程保存/打开：`.klemoji`（JSON），关闭窗口时如果有未保存的修改会提示确认
- 侧边栏「导出检查」实时显示校验结果；有错误时不会生成 zip

### 表情包格式（与 KLaboo / KLaboo-Server 一致）

```
manifest.json   {"format":1,"name":"…","expressions":{"smile":"smile.svg",…}}
smile.svg excited.svg panic.svg dizzy.svg sleepy.svg wink.svg
preview.png     （可选）
```

| 规则 | 说明 |
| --- | --- |
| 表情齐全 | 六个 key 都要有内容：`smile excited panic dizzy sleepy wink` |
| 名称 | 表情包名称不能为空 |
| 大小 | 单个 svg ≤ 1 MB，六个合计 ≤ 4 MB |
| 元素 | 只能用 `svg g defs use path rect circle ellipse line polyline polygon linearGradient radialGradient stop solidColor`；不能用 text、image、filter、mask、clipPath，也不能写 `style` 属性 |
| 复杂度 | 单个表情路径超过 20000 段会给警告（设备上可能渲染卡顿） |
| 尺寸 | 设备按 SVG 原始尺寸居中绘制在表情区；画布超过 410×318 会提示边缘被裁切 |

### 快捷键

| 操作 | 快捷键 |
| --- | --- |
| 切换工具 | V 选择 · B 画笔 · L 直线 · R 矩形 · O 椭圆 · F 填充 · E 橡皮 |
| 切换表情 | 1–6 |
| 调粗细 | `[` / `]` |
| 撤销 / 重做 | ⌘/Ctrl+Z / ⌘/Ctrl+Shift+Z（Windows 也可用 Ctrl+Y） |
| 复制图层 / 删除 | ⌘/Ctrl+D / Delete |
| 图层上移 / 下移 | ⌘/Ctrl+] / ⌘/Ctrl+[ |
| 微调位置 | 方向键（按住 Shift 每次 10px） |
| 取消选择 / 关闭弹窗 | Esc |
| 新建 / 打开 / 保存 / 另存为 | ⌘/Ctrl+N / O / S / Shift+S |
| 导入图片 / 预览 / 导出 zip | ⌘/Ctrl+I / P / E |

## 构建与运行

### 环境要求

- Node.js 18+（`npm test` 用的是内置的 `node:test`；Node 20 下验证通过）
- npm（依赖：运行时 `jszip`，开发时 `electron` 33、`electron-builder` 25）

### 开发运行

```bash
npm install      # 安装依赖（会下载 Electron 二进制）
npm start        # 启动应用
npm test         # 跑 core 模块单元测试，不需要 Electron
```

- 如果 Electron 下载很慢，可以设置镜像：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install`
- 「视图」菜单里可以打开开发者工具，或者重新加载页面

### 单元测试

`test/core.test.js` 测的是 `src/renderer/core/` 下的模块：svgdoc 的几何运算和序列化、vectorize 的颜色量化、pack 的校验和 zip 打包、工程文件读写。core 是 UMD 模块，直接用 Node 跑。

### 端到端验证

导出 zip → 在 KLaboo-Server 管理后台上传（`extract_pack` 再校验一次）→ 用户后台把表情包应用到设备 → 设备通过 ws 推送和 OTA 检查下载到 `/spiffs/emj_cur_<key>.svg` → ThorVG 渲染。KLaboo 固件仓库的 `tools/make_emoji_pack.py` 可以生成对照用的测试包。

## 打包安装包

打包用 electron-builder，配置写在 `package.json` 的 `build` 字段里，产物输出到 `dist/`：

```bash
npm run dist:mac   # dist/KLaboo Emoji-<ver>-mac-arm64.dmg 和 mac-x64.dmg
npm run dist:win   # dist/KLaboo Emoji-<ver>-win-x64.exe（NSIS 安装程序）
npm run dist:all   # 以上全部
npm run dist       # 只打当前平台的默认目标（Linux 下是 AppImage）
```

| 平台 | 目标 | 说明 |
| --- | --- | --- |
| macOS | DMG（arm64 + x64） | 应用分类 graphics-design；`mac.identity = null`，不签名 |
| Windows | NSIS 安装程序（x64） | 不是一键安装：可以选安装目录，会建桌面快捷方式 |
| Linux | AppImage | 有配置，未验证过 |

- **跨平台打包**：在 macOS 上可以直接打 Windows 安装包（electron-builder 会自己下载内置的 wine，不用另外安装）。在 Windows 上只能打 Windows 包，DMG 必须在 macOS 上打。
- **打包内容**：只打包 `src/**` 和 `package.json`，以及生产依赖（jszip）。
- **图标**：`build/icon.png`（1024×1024），electron-builder 会自动转成 icns/ico。
- **版本号**：取自 `package.json` 的 `version`，产物文件名格式是 `${productName}-${version}-${os}-${arch}.${ext}`。
- **未签名的安装包**：
  - macOS 第一次打开时要右键 →「打开」，或者执行 `xattr -cr "/Applications/KLaboo Emoji.app"`
  - Windows 会弹 SmartScreen 提示，点「更多信息 → 仍要运行」
  - 要正式分发，需要配置 Apple Developer ID 签名和公证，以及 Windows 代码签名证书
