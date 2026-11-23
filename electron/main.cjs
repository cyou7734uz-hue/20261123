const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const pagePath = path.join(__dirname, '..', 'index.html');
const pageUrl = pathToFileURL(pagePath).href;
let mainWindow;
let petMode = false;
let regularBounds;
let cursorPollTimer = null;

function setCursorTracking(enabled) {
  if (cursorPollTimer) {
    clearInterval(cursorPollTimer);
    cursorPollTimer = null;
  }
  if (!enabled) return;

  const sendCursorPosition = () => {
    if (!mainWindow || mainWindow.isDestroyed() || !petMode) return;
    const cursor = screen.getCursorScreenPoint();
    const bounds = mainWindow.getBounds();
    mainWindow.webContents.send('desktop-pet:cursor-moved', cursor.x - bounds.x);
  };

  sendCursorPosition();
  cursorPollTimer = setInterval(sendCursorPosition, 16);
}

function setPetMode(enabled) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('Desktop window is not available');
  }
  if (petMode === enabled) return petMode;

  if (enabled) {
    regularBounds = mainWindow.getBounds();
    mainWindow.setMinimumSize(240, 300);
    mainWindow.setSize(360, 460);
    mainWindow.center();
    mainWindow.setAlwaysOnTop(true);
  } else {
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setMinimumSize(720, 560);
    if (regularBounds) mainWindow.setBounds(regularBounds);
  }

  petMode = enabled;
  setCursorTracking(enabled);
  mainWindow.webContents.send('desktop-pet:mode-changed', petMode);
  return petMode;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('mailto:')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.split('#')[0] !== pageUrl) event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(pagePath);
  mainWindow.on('closed', () => {
    setCursorTracking(false);
    mainWindow = null;
  });
}

ipcMain.handle('desktop-pet:toggle-mode', () => setPetMode(!petMode));
ipcMain.on('desktop-pet:minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});
ipcMain.on('desktop-pet:close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
