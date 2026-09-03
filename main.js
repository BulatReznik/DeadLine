// Some Node/Electron launchers export this flag globally. A packaged desktop app
// must always load Electron's main-process API, not the Node compatibility mode.
delete process.env.ELECTRON_RUN_AS_NODE;

const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SIZE = { width: 560, height: 280 };
const WINDOW_LIMITS = { minWidth: 420, minHeight: 220, maxWidth: 720, maxHeight: 340 };
const WINDOW_STATE_FILE = 'window-state.json';

let widget;
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

function showWidget() {
  if (!widget || widget.isDestroyed()) return;
  if (widget.isMinimized()) widget.restore();
  widget.show();
  widget.focus();
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

ipcMain.handle('widget:get-autostart', () => app.getLoginItemSettings().openAtLogin);

ipcMain.handle('widget:set-autostart', (_event, value) => {
  const enabled = Boolean(value);
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
    args: app.isPackaged ? [] : [app.getAppPath()],
  });
  return enabled;
});
