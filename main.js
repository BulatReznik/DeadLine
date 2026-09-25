// Some Node/Electron launchers export this flag globally. A packaged desktop app
// must always load Electron's main-process API, not the Node compatibility mode.
delete process.env.ELECTRON_RUN_AS_NODE;

const { app, BrowserWindow, dialog, ipcMain, Menu, Tray, nativeImage, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DEFAULT_SIZE = { width: 560, height: 280 };
const WINDOW_LIMITS = { minWidth: 420, minHeight: 220, maxWidth: 720, maxHeight: 340 };
const WINDOW_STATE_FILE = 'window-state.json';
const CUSTOM_IMAGE_PATTERN = /^custom-image\.(gif|png|jpe?g|webp|bmp)$/i;
const CUSTOM_IMAGE_EXTENSIONS = ['gif', 'png', 'jpg', 'jpeg', 'webp', 'bmp'];
const MAX_CUSTOM_IMAGE_BYTES = 20 * 1024 * 1024;

let widget;
let settingsWindow;
let tray;
let quitting = false;
let saveTimer;

function reportFatalError(error) {
  try {
    const logDirectory = path.join(process.env.APPDATA || __dirname, 'DeadLine');
    fs.mkdirSync(logDirectory, { recursive: true });
    fs.appendFileSync(
      path.join(logDirectory, 'startup-error.log'),
      `${new Date().toISOString()}\n${error?.stack || error}\n\n`,
    );
  } catch {
    // There is nothing else to do if error reporting itself is unavailable.
  }
}

process.on('uncaughtException', reportFatalError);
process.on('unhandledRejection', reportFatalError);

function windowStatePath() {
  return path.join(app.getPath('userData'), WINDOW_STATE_FILE);
}

function readWindowState() {
  try {
    return JSON.parse(fs.readFileSync(windowStatePath(), 'utf8'));
  } catch {
    return null;
  }
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

function savedBounds() {
  const saved = readWindowState();
  const { workArea } = screen.getPrimaryDisplay();
  const width = clamp(saved?.width, WINDOW_LIMITS.minWidth, WINDOW_LIMITS.maxWidth, DEFAULT_SIZE.width);
  const height = clamp(saved?.height, WINDOW_LIMITS.minHeight, WINDOW_LIMITS.maxHeight, DEFAULT_SIZE.height);
  const fallback = {
    x: Math.max(workArea.x + 12, workArea.x + workArea.width - width - 24),
    y: Math.max(workArea.y + 12, workArea.y + workArea.height - height - 24),
  };
  const x = Number.isFinite(Number(saved?.x)) ? Math.round(Number(saved.x)) : fallback.x;
  const y = Number.isFinite(Number(saved?.y)) ? Math.round(Number(saved.y)) : fallback.y;
  const visible = screen.getAllDisplays().some(({ workArea: area }) => {
    const overlapWidth = Math.min(x + width, area.x + area.width) - Math.max(x, area.x);
    const overlapHeight = Math.min(y + height, area.y + area.height) - Math.max(y, area.y);
    return overlapWidth >= 100 && overlapHeight >= 80;
  });
  return visible ? { x, y, width, height } : { ...fallback, width, height };
}

function saveWindowStateNow() {
  if (!widget || widget.isDestroyed()) return;
  try {
    fs.mkdirSync(path.dirname(windowStatePath()), { recursive: true });
    fs.writeFileSync(windowStatePath(), JSON.stringify(widget.getBounds(), null, 2));
  } catch {
    // The widget still works if the user-data directory is temporarily unavailable.
  }
}

function queueWindowStateSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveWindowStateNow, 150);
}

function customImageData() {
  try {
    const fileName = fs.readdirSync(app.getPath('userData')).find((name) => CUSTOM_IMAGE_PATTERN.test(name));
    if (!fileName) return null;
    return {
      name: fileName.replace(/^custom-image\./i, ''),
      url: pathToFileURL(path.join(app.getPath('userData'), fileName)).href,
    };
  } catch {
    return null;
  }
}

function removeCustomImages(except) {
  for (const fileName of fs.readdirSync(app.getPath('userData'))) {
    if (CUSTOM_IMAGE_PATTERN.test(fileName) && fileName !== except) {
      fs.rmSync(path.join(app.getPath('userData'), fileName), { force: true });
    }
  }
}

function showWidget() {
  if (!widget || widget.isDestroyed()) return;
  if (widget.isMinimized()) widget.restore();
  widget.show();
  widget.focus();
}

function showSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 480,
    height: 700,
    minWidth: 420,
    minHeight: 560,
    frame: false,
    transparent: true,
    resizable: true,
    movable: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
  settingsWindow.once('ready-to-show', () => settingsWindow?.show());
}

function createTray() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'tray-icon.png')
    : path.join(__dirname, 'assets', 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('DeadLine — обратный отсчёт');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Показать виджет', click: showWidget },
    { label: 'Скрыть виджет', click: () => widget?.hide() },
    { type: 'separator' },
    { label: 'Выйти', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => (widget?.isVisible() ? widget.hide() : showWidget()));
}

function createWindow() {
  widget = new BrowserWindow({
    ...savedBounds(),
    minWidth: WINDOW_LIMITS.minWidth,
    minHeight: WINDOW_LIMITS.minHeight,
    maxWidth: WINDOW_LIMITS.maxWidth,
    maxHeight: WINDOW_LIMITS.maxHeight,
    frame: false,
    transparent: true,
    resizable: true,
    movable: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    showInTaskbar: false,
    type: 'toolbar',
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  widget.setAlwaysOnTop(true, 'floating');
  widget.loadFile(path.join(__dirname, 'index.html'));
  widget.on('move', queueWindowStateSave);
  widget.on('resize', queueWindowStateSave);
  widget.on('close', (event) => {
    saveWindowStateNow();
    if (!quitting) {
      event.preventDefault();
      widget.hide();
    }
  });
  widget.on('closed', () => { widget = null; });
  widget.once('ready-to-show', () => widget?.showInactive());
}

const singleInstance = app.requestSingleInstanceLock();

if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => showWidget());
  app.whenReady().then(() => {
    app.setAppUserModelId('com.deadline.widget');
    try {
      createWindow();
      createTray();
    } catch (error) {
      reportFatalError(error);
      app.quit();
    }
  });

  app.on('before-quit', () => {
    quitting = true;
    saveWindowStateNow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && quitting) app.quit();
  });
}

ipcMain.on('widget:close', () => widget?.hide());
ipcMain.on('widget:open-settings', showSettings);
ipcMain.on('settings:close', () => settingsWindow?.close());
ipcMain.on('widget:settings-updated', (_event, payload) => {
  if (widget && !widget.isDestroyed()) widget.webContents.send('widget:settings-updated', payload);
});

ipcMain.handle('widget:set-always-on-top', (_event, value) => {
  const enabled = Boolean(value);
  widget?.setAlwaysOnTop(enabled, 'floating');
  return enabled;
});

ipcMain.handle('widget:set-opacity', (_event, value) => {
  const opacity = Math.min(1, Math.max(.55, Number(value) || 1));
  widget?.setOpacity(opacity);
  return opacity;
});

function loginItemOptions() {
  return {
    path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath,
    args: app.isPackaged ? [] : [app.getAppPath()],
  };
}

ipcMain.handle('widget:get-autostart', () => app.getLoginItemSettings(loginItemOptions()).openAtLogin);

ipcMain.handle('widget:set-autostart', (_event, value) => {
  const enabled = Boolean(value);
  app.setLoginItemSettings({
    ...loginItemOptions(),
    openAtLogin: enabled,
  });
  return enabled;
});

ipcMain.handle('widget:get-custom-image', () => customImageData());

ipcMain.handle('widget:pick-custom-image', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(settingsWindow || widget, {
    title: 'Выберите изображение',
    properties: ['openFile'],
    filters: [{ name: 'Изображения', extensions: CUSTOM_IMAGE_EXTENSIONS }],
  });
  if (canceled || !filePaths[0]) return null;

  const sourcePath = filePaths[0];
  const extension = path.extname(sourcePath).slice(1).toLowerCase();
  if (!CUSTOM_IMAGE_EXTENSIONS.includes(extension)) {
    return { error: 'Поддерживаются GIF, PNG, JPG, WEBP и BMP.' };
  }

  let temporaryPath;
  try {
    const { size } = fs.statSync(sourcePath);
    if (size > MAX_CUSTOM_IMAGE_BYTES) {
      return { error: 'Файл слишком большой. Максимальный размер — 20 МБ.' };
    }
    const userDataPath = app.getPath('userData');
    fs.mkdirSync(userDataPath, { recursive: true });
    const fileName = `custom-image.${extension}`;
    const targetPath = path.join(userDataPath, fileName);
    temporaryPath = `${targetPath}.tmp`;
    fs.copyFileSync(sourcePath, temporaryPath);
    fs.rmSync(targetPath, { force: true });
    fs.renameSync(temporaryPath, targetPath);
    removeCustomImages(fileName);
    return customImageData();
  } catch {
    if (temporaryPath) fs.rmSync(temporaryPath, { force: true });
    return { error: 'Не удалось сохранить изображение.' };
  }
});

ipcMain.handle('widget:remove-custom-image', () => {
  try {
    removeCustomImages();
    return true;
  } catch {
    return false;
  }
});
