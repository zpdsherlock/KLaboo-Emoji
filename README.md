# KLaboo Emoji

KLaboo 表情包制作工具，基于 Electron 的桌面应用（macOS / Windows）。

## 一、工程概要

KLaboo 是运行在 ESP32-S3-Touch-AMOLED-2.06（410×502 AMOLED）上的桌面伙伴设备，屏幕上用六个表情展示状态。KLaboo Emoji 用来制作这六个表情——包括静态图、**多帧动画**和**整图动效**——并导出成 KLaboo-Server 可直接上传的表情包 zip：

```
KLaboo Emoji ──导出 zip──▶ KLaboo-Server 管理后台上传（extract_pack 校验）
                              │ raster.py 预渲染为 LVGL bin（可选）+ 用户应用到设备
                              ▼
KLaboo 设备 ◀── /api/ota/emoji manifest + 文件下载 ── /spiffs/emj_cur_*
              └─ bin 帧 LZ4 解码 / svg ThorVG 渲染 + 帧动画与整图动效
```

设备端只支持 SVG 基本元素，所以工具里画的图形和导入的图片最后都会输出成纯矢量 SVG，导出前还会按设备和服务端的规则做一遍检查。

## 二、工程实现架构及功能说明

### 1. 目录结构

```
src/
  main.js              主进程：窗口、菜单、文件读写 IPC、未保存退出确认
  preload.js           contextBridge 暴露 window.klabooAPI（沙箱 + contextIsolation）
  renderer/
    index.html         界面布局
    app.js             应用逻辑：工具、图层、模板、帧动画、导入、预览、导出、快捷键
    editor.js          SVG 画布交互（坐标换算、绘制、选择/缩放）
    templates.js       内置模板（含仿制的固件默认表情）
    style.css
    core/              与 UI 无关的核心模块（UMD，浏览器和 Node 都能加载）
      constants.js     格式约定：表情 key、帧数/帧率/动效上限、允许的 SVG 元素、设备几何参数
      svgdoc.js        工程文档模型（多帧 slot）、几何运算、SVG 序列化
      vectorize.js     位图矢量化：k-means 颜色量化、去背景、色块合并
      pack.js          表情包校验与 zip 打包（与 Server extract_pack 规则一致）
test/core.test.js      core 模块单元测试（node:test）
build/icon.png         应用图标（1024×1024）
```

### 2. 画笔绘制

- 工具：选择 `V`、画笔 `B`、直线 `L`、矩形 `R`、椭圆 `O`、填充 `F`、橡皮 `E`
- 画笔笔迹会自动简化和平滑；勾选「闭合路径」并打开填充，可以画色块
- 样式：描边/填充颜色、粗细、不透明度、矩形圆角；24 色色板（左键设描边色，右键设填充色）
- 图层：选中、拖动、缩放（Shift 等比）、上移/下移、复制、删除、方向键微调
- 填充工具：点图形填色；点空白处设背景色；点导入图片的色块可整块换色
- 橡皮：擦除笔触或图形；在导入的图片上按笔刷粗细擦除像素
- 撤销/重做；可显示网格和「设备可视区」辅助线
- 画布尺寸可选 240 / 280 / 320 / 360 / 400 px（默认 320）

### 3. 模板与表情管理

- 六个表情：微笑 smile、兴奋 excited、惊慌 panic、晕眩 dizzy、困倦 sleepy、眨眼 wink，用 `1`–`6` 切换
- 内置模板：固件内置表情（仿制）、黄色圆脸、机器人方脸、圆角方块；可以只套用到当前表情，也可以套用到全部 6 个
- 可以把当前表情复制到另一个表情，也可以一键清空当前表情

### 4. 帧动画与整图动效

每个表情除静态图外还支持两层动画，预览和设备上都会实时播放：

- **帧动画**：侧边栏「帧动画」面板中 `+复制帧` / `+空白帧` / `-删帧` 管理帧（当前画面即第 0 帧，额外帧存在 slot 中，最多 **8 帧**），并按 `fps`（1–25，默认 8）循环播放；多帧时帧列表可切换编辑。建议 ≤4 帧、画布 ≤320 px，超出会挤占设备烘焙内存。
- **整图动效**：`动效` 下拉选择固件实现的整图运动——无 / 呼吸浮动 breathe / 颤抖 shake / 左右摇摆 sway / 脉动缩放 pulse / 上下弹跳 bounce，可叠加在静态图或帧动画之上。
- 导出时静态表情写成 `"key": "key.svg"`，带动效的写成 `{file, anim}`，帧动画写成 `{frames, fps, anim}`（见"表情包格式"）。

### 5. 图片导入（位图转矢量）

- 支持 PNG / JPG / GIF / WebP / BMP / SVG
- 调好参数后转成纯 `<path>` 矢量，每种颜色一个 path。可调参数：采样分辨率（16–200）、颜色数（2–32）、去除背景（取边缘颜色）及容差、透明阈值、占画布比例
- 原图和生成结果并排对比，实时显示文件大小统计
- 可以替换当前表情内容，也可以添加为新图层

### 6. 表情预览

- 410×502 设备外观模拟，表情区中心在 (205, 217)、大小 410×376，底下显示固件里的表情文字
- 帧动画按设定 fps 播放、整图动效同步演示；夜间/白天两种主题，可自动轮播六个表情；侧边栏有缩略预览（含帧数 / 动效标注）
- 浏览器渲染和设备上的渲染可能有细微差别

### 7. 导出与工程文件

- **表情包 zip**（`⌘/Ctrl+E`）：`manifest.json` + 每个表情的 SVG（静态 `<key>.svg`，动画 `<key>_f<i>.svg`）+ `preview.png`（用微笑表情生成的 256px 缩略图，服务端拿来当列表预览）
- 单张导出：当前表情的 SVG 或 PNG
- 工程保存/打开：`.klemoji`（JSON，含全部帧数据），关闭窗口时如果有未保存的修改会提示确认
- 侧边栏「导出检查」实时显示校验结果；有错误时不会生成 zip

### 8. 表情包格式（与 KLaboo / KLaboo-Server 一致）

```
manifest.json   {"format":1,"name":"…","expressions":{...}}
<key>.svg       静态表情，或 <key>_f<i>.svg 动画帧（i = 0..7）
preview.png     （可选，商店列表缩略图）
```

`expressions` 每条目的三种写法：`"smile": "smile.svg"`（静态）、`{"file": "x.svg", "anim": "shake"}`（静态+动效）、`{"frames": [...], "fps": 8, "anim": "sway"}`（帧动画+动效）。`anim` 可选 `none|breathe|shake|sway|pulse|bounce`。

| 规则 | 说明 |
| --- | --- |
| 表情齐全 | 六个 key 都要有内容：`smile excited panic dizzy sleepy wink` |
| 名称 | 表情包名称不能为空 |
| 帧数 / 帧率 | 每表情 ≤ 8 帧；多帧时 fps 需为 1–25 的整数 |
| 大小 | 单个 svg ≤ 1 MB，全部帧合计 ≤ 4 MB |
| 元素 | 只能用 `svg g defs use path rect circle ellipse line polyline polygon linearGradient radialGradient stop solidColor`；不能用 text、image、filter、mask、clipPath，也不能写 `style` 属性 |
| 复杂度 | 每表情图形元素（path 子路径 + 基础图形）> 1500 给警告，> 4000 直接报错（服务端上限）；8 帧 × 300 KB 也会给内存警告 |
| 尺寸 | 设备按 SVG 原始尺寸居中绘制在表情区；画布超过 410×318 会提示边缘被裁切 |

### 9. 快捷键

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

## 三、工程编译与打包

### 1. 环境要求

- Node.js 18+（`npm test` 用的是内置的 `node:test`；Node 20 下验证通过）
- npm（依赖：运行时 `jszip`，开发时 `electron` 33、`electron-builder` 25）

### 2. 开发运行

```bash
npm install      # 安装依赖（会下载 Electron 二进制）
npm start        # 启动应用
npm test         # 跑 core 模块单元测试，不需要 Electron
```

- 如果 Electron 下载很慢，可以设置镜像：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install`
- 「视图」菜单里可以打开开发者工具，或者重新加载页面

### 3. 单元测试

`test/core.test.js` 测的是 `src/renderer/core/` 下的模块：svgdoc 的几何运算和序列化、vectorize 的颜色量化、pack 的校验和 zip 打包、工程文件读写。core 是 UMD 模块，直接用 Node 跑。

### 4. 打包安装包

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

## 四、软件使用方法

### 1. 制作一个表情包

1. 打开应用，在顶栏「名称」输入表情包名称。
2. 用 `1`–`6` 在六个表情间切换，逐个绘制：用画笔 / 形状工具画，或「导入图片」把位图转成矢量色块，也可以先「套用」一个内置模板再改。
3. 想让表情动起来：在「帧动画」面板 `+复制帧` 复制当前画面为新帧并修改，最多 8 帧，设置 `帧率`；再选择「动效」给整图加呼吸 / 摇摆等运动。
4. 随时点「表情预览」（`⌘/Ctrl+P`）查看设备外观模拟效果，可切换白天/夜间主题、自动轮播。
5. 观察侧边栏「导出检查」：把错误清零（警告可酌情忽略）后，`⌘/Ctrl+E` 导出表情包 zip。
6. 工程可随时存成 `.klemoji` 文件，下次「打开」继续编辑。

### 2. 下发到设备

导出 zip → 在 KLaboo-Server 管理后台【表情管理】上传（服务端 `extract_pack` 会再校验一遍，并生成预渲染帧）→ 管理员上架 → 用户后台【我的表情】选择下发设备并点「应用」→ 设备轮询到后下载到 `/spiffs/emj_cur_*` → 表情切换生效。服务端可能直接下发预渲染 bin 帧；预渲染失败时设备回退 SVG 渲染，不影响使用。

### 3. 常见问题

- **导出报"图形过于复杂"**：导入图片时降低分辨率 / 颜色数，或开启"去除噪点"后重新导入。
- **设备上动画卡顿**：减少帧数（≤4）、缩小画布（≤320px）、精简图形数量；优先用整图动效代替高帧数动画。
- **画布被裁切**：画布超过 410×318 的部分在设备上不可见，缩小画布或把内容居中。
