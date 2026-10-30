# KLaboo Emoji

KLaboo 表情包制作工具（Electron）。产出的 zip 可直接在 KLaboo-Server 管理后台上传，设备通过 `/api/ota/emoji` 下载到 `/spiffs/emj_cur_<key>.svg` 并用 LVGL svg decoder（ThorVG）渲染。

## 功能

- **画笔制作**：画笔（自由曲线，自动简化平滑）、直线、矩形、椭圆、填充、橡皮；选择/移动/缩放、图层排序、复制、撤销重做；内置模板（含固件默认表情）
- **图片导入**：PNG/JPG/GIF/WebP 等 → 颜色量化 + 色块合并 → 纯 `<path>` 矢量（支持去背景、透明阈值、颜色数、分辨率、缩放），可拖入画布
- **表情预览**：410×502 设备外观（夜间/日间主题），六个表情轮播
- **导出**：表情包 zip（`manifest.json` + 6 个 svg + `preview.png`），以及单张 SVG/PNG；工程可保存为 `.klemoji`

## 表情包格式（与 KLaboo / KLaboo-Server 一致）

```
manifest.json   {"format":1,"name":"…","expressions":{"smile":"smile.svg",…}}
smile.svg excited.svg panic.svg dizzy.svg sleepy.svg wink.svg
preview.png     （可选，后台列表预览图）
```

- 六个 key 必须齐全：`smile excited panic dizzy sleepy wink`
- 单个 svg ≤ 1 MB，总量 ≤ 4 MB
- 只输出 LVGL svg 支持的元素（path/rect/circle/ellipse/line/… + 展示属性），不含 text、image、filter、mask、clipPath、CSS
- svg 在设备上居中绘制于表情区（中心 205,217，区域 410×376），画布默认 320px

导出前会按上述规则校验，不合格时不会生成 zip。

## 开发

```bash
npm install
npm start        # 运行
npm test         # 核心逻辑单元测试
```

## 打包安装包

```bash
npm run dist:mac   # dist/KLaboo Emoji-<ver>-mac-arm64.dmg + mac-x64.dmg
npm run dist:win   # dist/KLaboo Emoji-<ver>-win-x64.exe（NSIS 安装程序）
npm run dist:all   # 以上全部
```

- 在 macOS 上可直接打出 Windows 安装包（electron-builder 会自动下载内置 wine，无需另装）；在 Windows 上只能打 Windows 包，dmg 必须在 macOS 上打
- 图标：`build/icon.png`（1024×1024），electron-builder 自动转成 icns/ico
- 版本号取自 `package.json` 的 `version`
- 未签名：mac 首次打开需右键 →「打开」（或 `xattr -cr "/Applications/KLaboo Emoji.app"`）；Windows 会出现 SmartScreen 提示，点「更多信息 → 仍要运行」。要正式分发需配置 Apple Developer ID 签名 + 公证、Windows 代码签名证书

## 快捷键

V 选择 · B 画笔 · L 直线 · R 矩形 · O 椭圆 · F 填充 · E 橡皮 · 1-6 切换表情 · [ ] 调粗细 · ⌘/Ctrl+Z 撤销 · ⌘/Ctrl+Shift+Z 重做 · ⌘/Ctrl+D 复制 · Delete 删除 · 方向键微调（Shift ×10）· 调色板右键设为填充色
