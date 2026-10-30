const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('fs/promises');
const path = require('path');

let win = null;
let dirty = false;

function send(action) {
  if (win) win.webContents.send('menu', action);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const item = (label, action, accelerator) => ({ label, accelerator, click: () => send(action) });
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: '文件',
      submenu: [
        item('新建表情包', 'new', 'CmdOrCtrl+N'),
        item('打开工程…', 'open', 'CmdOrCtrl+O'),
        item('保存工程', 'save', 'CmdOrCtrl+S'),
        item('工程另存为…', 'saveAs', 'CmdOrCtrl+Shift+S'),
        { type: 'separator' },
        item('导入图片…', 'importImage', 'CmdOrCtrl+I'),
        { type: 'separator' },
        item('导出表情包 zip…', 'exportPack', 'CmdOrCtrl+E'),
        item('导出当前表情 SVG…', 'exportSvg'),
        item('导出当前表情 PNG…', 'exportPng'),
        ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit', label: '退出' }]),
      ],
    },
    {
      label: '编辑',
      submenu: [
        item('撤销', 'undo', 'CmdOrCtrl+Z'),
        item('重做', 'redo', isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y'),
        { type: 'separator' },
        { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        item('表情预览', 'preview', 'CmdOrCtrl+P'),
        { type: 'separator' },
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: 'KLaboo Emoji',
    backgroundColor: '#1b1e27',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('close', (e) => {
    if (!dirty) return;
    const r = dialog.showMessageBoxSync(win, {
      type: 'warning', buttons: ['放弃修改并退出', '取消'], defaultId: 1, cancelId: 1,
      message: '工程有未保存的修改，确定退出吗？',
    });
    if (r !== 0) e.preventDefault();
  });
  win.on('closed', () => { win = null; });
}

ipcMain.handle('file:save', async (_e, { title, defaultPath, filters, data }) => {
  const r = await dialog.showSaveDialog(win, { title, defaultPath, filters });
  if (r.canceled || !r.filePath) return null;
  await fs.writeFile(r.filePath, typeof data === 'string' ? data : Buffer.from(data));
  return r.filePath;
});

ipcMain.handle('file:open', async (_e, { title, filters, encoding }) => {
  const r = await dialog.showOpenDialog(win, { title, filters, properties: ['openFile'] });
  if (r.canceled || !r.filePaths.length) return null;
  const p = r.filePaths[0];
  const buf = await fs.readFile(p);
  return { path: p, name: path.basename(p), data: encoding ? buf.toString(encoding) : new Uint8Array(buf) };
});

ipcMain.handle('file:write', async (_e, { filePath, data }) => {
  await fs.writeFile(filePath, typeof data === 'string' ? data : Buffer.from(data));
  return filePath;
});

ipcMain.on('doc:dirty', (_e, v) => {
  dirty = !!v;
  if (win) win.setDocumentEdited(dirty);
});

ipcMain.on('doc:title', (_e, t) => { if (win) win.setTitle(t); });

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
