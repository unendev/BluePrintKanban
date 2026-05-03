const electron = require('electron');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const { app, BrowserWindow, screen, globalShortcut, session, ipcMain, Menu, Tray, nativeImage, shell } = electron;

// 检查是否在 Electron 环境中运行 (v41+ require('electron') 在 Node 中返回路径)
if (process.versions && !process.versions.electron) {
  console.error('ERROR: This script must be run inside Electron, not plain Node.js.');
  process.exit(1);
}

let logFilePath = null;

// 日志函数：同时写入文件和控制台
function writeLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  // 如果日志路径还没初始化，先存控制台
  if (logFilePath) {
    try {
      if (fs.existsSync(logFilePath)) {
        fs.appendFileSync(logFilePath, logMessage);
      }
    } catch (e) {
      console.error('Failed to write to log file:', e);
    }
  }

  // 写入控制台
  console.log(message);
}

// 延迟初始化日志路径，确保 app 已加载
function initLogging() {
  try {
    const userDataPath = app.getPath('userData');
    const logsDir = path.join(userDataPath, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    logFilePath = path.join(logsDir, `electron-${new Date().toISOString().split('T')[0]}.log`);
    // 创建初始日志文件如果不存在
    if (!fs.existsSync(logFilePath)) {
      fs.writeFileSync(logFilePath, '');
    }
    writeLog('[Main Process] Logging initialized');
  } catch (e) {
    console.error('Failed to initialize logging:', e);
  }
}

// 在 app 准备好之前安全地调用
if (app) {
  app.disableHardwareAcceleration();
}

// 如果未打包且 NODE_ENV 不为 'production'，则视为开发模式
const isDev = (app && !app.isPackaged) && process.env.NODE_ENV !== 'production';
const VITE_DEV_SERVER_URL = 'http://localhost:5173';

// NOTE: API_BASE_URL removed. Standalone local mode — no remote backend.
// All data operations go through local-db.js via IPC.
const API_BASE_URL = '';

process.on('uncaughtException', (error) => {
  console.error('[Main Process] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Main Process] Unhandled Rejection:', reason);
});

// 内存中缓存 Cookie，用于手动注入 (已废弃，保留变量防止引用报错，可后续删除)
let cachedSessionCookie = '';

app.on('ready', () => {
  initLogging();
  const ses = session.fromPartition('persist:timer-widget');
  // 已移除 Cookie 拦截器，改用纯 Token 认证方案
  writeLog('[Main Process] Ready (Token Auth Mode)');
});

const windowStatePath = () => path.join(app.getPath('userData'), 'timer-window-state.json');

const isValidNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const loadWindowState = (defaults) => {
  try {
    if (!fs.existsSync(windowStatePath())) return defaults;
    const raw = fs.readFileSync(windowStatePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || !isValidNumber(parsed.width) || !isValidNumber(parsed.height)) return defaults;
    return { width: parsed.width, height: parsed.height, x: parsed.x, y: parsed.y };
  } catch (error) {
    return defaults;
  }
};

const saveWindowState = (win) => {
  if (!win || win.isDestroyed()) return;
  try {
    const { width, height, x, y } = win.getBounds();
    fs.writeFileSync(windowStatePath(), JSON.stringify({ width, height, x, y }));
  } catch (error) { }
};

const normalizeBounds = (bounds, minWidth, minHeight) => {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.max(bounds.width || minWidth, minWidth);
  const height = Math.max(bounds.height || minHeight, minHeight);
  const x = clamp(isValidNumber(bounds.x) ? bounds.x : sw - width - 50, 0, Math.max(0, sw - width));
  const y = clamp(isValidNumber(bounds.y) ? bounds.y : 50, 0, Math.max(0, sh - height));
  return { width, height, x, y };
};

function loadWindow(win, route) {
  if (isDev) {
    win.loadURL(`${VITE_DEV_SERVER_URL}/#${route}`);
  } else {
    // 强制使用绝对路径确保生产模式下能找到 index.html
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    console.log(`[Main Process] Loading window with path: ${indexPath}, hash: ${route}`);
    if (fs.existsSync(indexPath)) {
      win.loadFile(indexPath, { hash: route });
    } else {
      // 兼容直接在项目根目录运行的情况
      const fallbackPath = path.join(__dirname, 'index.html');
      console.log(`[Main Process] Falling back to path: ${fallbackPath}`);
      win.loadFile(fallbackPath, { hash: route });
    }
  }
}

function createToolWindow(type, existingWindow) {
  if (existingWindow) {
    existingWindow.focus();
    return existingWindow;
  }

  const ses = session.fromPartition('persist:timer-widget');
  const configs = {
    memo: { width: 320, height: 450, title: '备忘录', route: '/memo', alwaysOnTop: true, skipTaskbar: true },
    'task-memo': { width: 320, height: 450, title: '任务备注', route: '/memo?type=task', alwaysOnTop: false, skipTaskbar: false },
    todo: { width: 340, height: 500, title: '项目管理', route: '/todo', alwaysOnTop: true, skipTaskbar: true },
    ai: { width: 360, height: 500, title: 'AI 助手', route: '/ai', alwaysOnTop: true, skipTaskbar: true },
    settings: { width: 300, height: 350, title: '设置', route: '/settings', alwaysOnTop: true, skipTaskbar: true },
    create: { width: 500, height: 600, title: '新建任务', route: '/create', alwaysOnTop: true, skipTaskbar: true },
    promptLibrary: { width: 700, height: 600, title: '提示词库', route: '/prompt-library', alwaysOnTop: false, skipTaskbar: false },
    linkStation: { width: 340, height: 550, title: 'Link Station', route: '/link-station', alwaysOnTop: true, skipTaskbar: true },
  };
  const config = configs[type];
  console.log(`[Main] Creating window type: ${type}`, config);

  let x, y;
  if (mainWindow) {
    const [mainX, mainY] = mainWindow.getPosition();
    x = mainX - config.width - 10;
    y = mainY;
  }

  const win = new BrowserWindow({
    width: config.width,
    height: config.height,
    x,
    y,
    title: config.title,
    frame: false,
    transparent: false,
    backgroundColor: '#1a1a1a',
    alwaysOnTop: config.alwaysOnTop || false,
    resizable: true,
    maximizable: false,
    minWidth: 250,
    minHeight: 200,
    skipTaskbar: config.skipTaskbar ?? true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      session: ses,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: false, // 允许本地文件处理 Cookie 和跨域
    },
  });

  if (config.alwaysOnTop) {
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  win.setMenu(null);

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  loadWindow(win, config.route);

  win.webContents.on('did-finish-load', () => {
    win.webContents.insertCSS(`
      * { scrollbar-width: none !important; }
      *::-webkit-scrollbar { display: none !important; }
      [data-drag="true"] { -webkit-app-region: drag; }
      [data-drag="false"] { -webkit-app-region: no-drag; }
    `);
  });

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Main Process] ${type} window failed to load: ${validatedURL} (${errorCode}: ${errorDescription})`);
  });

  return win;
}

let mainWindow;
let createWindow;
let memoWindow;
const taskMemoWindows = new Map(); // Map<taskId, BrowserWindow>
let todoWindow;
let aiWindow;
let settingsWindow;
let promptLibraryWindow;
let linkStationWindow;
let chartWindow;
let tray = null;
let isQuitting = false;

function createMainWindow() {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  const windowWidth = 300;
  const windowHeight = 200;
  const ses = session.fromPartition('persist:timer-widget');
  const defaultBounds = {
    width: windowWidth,
    height: windowHeight,
    x: screenWidth - windowWidth - 50,
    y: 50,
  };
  const savedBounds = normalizeBounds(loadWindowState(defaultBounds), 200, 100);
  const { width, height, x, y } = savedBounds;

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: false,
    backgroundColor: '#1a1a1a',
    alwaysOnTop: true,
    resizable: true,
    maximizable: false,
    minWidth: 200,
    minHeight: 100,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      session: ses,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // 立即设置最高置顶层级
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    if (openUrl.includes('#/create')) { openCreateWindow(); return { action: 'deny' }; }
    if (openUrl.includes('#/memo')) { openMemoWindow(); return { action: 'deny' }; }
    if (openUrl.includes('#/todo')) { openTodoWindow(); return { action: 'deny' }; }
    if (openUrl.includes('#/settings')) { openSettingsWindow(); return { action: 'deny' }; }
    if (openUrl.includes('#/ai')) { openAiWindow(); return { action: 'deny' }; }
    return { action: 'allow' };
  });

  loadWindow(mainWindow, '/kanban');

  mainWindow.webContents.on('did-navigate', (_event, url) => {
    if (url.includes('#/login')) {
      mainWindow.setSize(320, 420);
      mainWindow.center();
    } else if (url.includes('#/timer')) {
      const [w, h] = mainWindow.getSize();
      if (w === 320 && h === 420) {
        const restored = normalizeBounds(loadWindowState(defaultBounds), 200, 100);
        mainWindow.setBounds(restored);
      }
    }
  });

  mainWindow.webContents.on('did-start-navigation', (event, url) => {
    console.log(`[Main Process] Started navigation to: ${url}`);
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Main Process] Failed to load: ${validatedURL} (${errorCode}: ${errorDescription})`);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(`
      * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
      *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
      [data-drag="true"] { -webkit-app-region: drag !important; }
      [data-drag="false"] { -webkit-app-region: no-drag !important; }
    `);
    mainWindow.show();
    // 强制设置置顶层级，确保在 Windows 上不被 Obsidian 等应用覆盖
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  let saveTimeout;
  const scheduleSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => saveWindowState(mainWindow), 200);
  };

  mainWindow.on('resize', scheduleSave);
  mainWindow.on('move', scheduleSave);
  mainWindow.on('close', () => saveWindowState(mainWindow));

  mainWindow.on('focus', () => {
    // 每次获取焦点时重新应用置顶
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    globalShortcut.register('F5', () => mainWindow.reload());
    globalShortcut.register('CommandOrControl+Shift+I', () => mainWindow.webContents.toggleDevTools());
  });

  mainWindow.on('blur', () => {
    globalShortcut.unregister('F5');
    globalShortcut.unregister('CommandOrControl+Shift+I');
    // Re-enforce always on top on blur to prevent losing z-index
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
    }
  });

  mainWindow.on('restore', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    globalShortcut.unregisterAll();
  });
}

app.on('ready', () => {
  const ses = session.fromPartition('persist:timer-widget');
  // ses.clearCache().then(() => {
  //   setTimeout(createMainWindow, 300);
  // });
  setTimeout(createMainWindow, 300);

  // Create Tray
  let iconPath = path.join(__dirname, 'icon.ico');
  if (!fs.existsSync(iconPath)) {
    // Fallback if structured differently in asar
    iconPath = path.join(process.resourcesPath, 'icon.ico');
  }

  try {
    const trayIcon = nativeImage.createFromPath(iconPath);
    tray = new Tray(trayIcon);
    tray.setToolTip('Timer Widget');
  } catch (e) {
    console.error('Failed to create tray:', e);
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口 (Show)',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.setAlwaysOnTop(true, 'screen-saver');
          mainWindow.focus();
        } else {
          createMainWindow();
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出 (Exit)',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
        mainWindow.focus();
      }
    } else {
      createMainWindow();
    }
  });
});

function openCreateWindow() {
  if (createWindow) { createWindow.focus(); return; }
  createWindow = createToolWindow('create', null);
  createWindow.on('closed', () => {
    createWindow = null;
    // Removed reload here to avoid interrupting IPC/Storage logic
    // If we use IPC, the TimerPage will update itself anyway.
  });
}


function openTaskMemoWindow(taskId, taskName) {
  if (taskMemoWindows.has(taskId)) {
    const win = taskMemoWindows.get(taskId);
    if (!win.isDestroyed()) {
      win.focus();
      return;
    }
    taskMemoWindows.delete(taskId);
  }

  // Calculate position: Left of Todo Window
  let x, y;
  const safeName = taskName ? encodeURIComponent(taskName) : '';
  const config = { width: 320, height: 450, title: '任务备注', route: `/memo?type=task&id=${taskId}&title=${safeName}`, alwaysOnTop: false, skipTaskbar: false };

  if (todoWindow && !todoWindow.isDestroyed()) {
    const [todoX, todoY] = todoWindow.getPosition();
    x = todoX - config.width - 10; // 10px spacing
    y = todoY;
  } else if (mainWindow && !mainWindow.isDestroyed()) {
    // Fallback to main window
    const [mainX, mainY] = mainWindow.getPosition();
    x = mainX - config.width - 10;
    y = mainY;
  }

  // Note: We can't reuse createToolWindow easily because of position override and unique route. 
  // But wait, createToolWindow calculates position based on main window. 
  // Let's modify createToolWindow or manually create here. 
  // To stick to pattern, let's manually create to override position logic specifically.

  const ses = session.fromPartition('persist:timer-widget');
  const win = new BrowserWindow({
    width: config.width,
    height: config.height,
    x, y,
    title: config.title,
    frame: false,
    transparent: false,
    backgroundColor: '#1a1a1a',
    alwaysOnTop: false,
    resizable: true,
    maximizable: false,
    minWidth: 250,
    minHeight: 200,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      session: ses,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: false,
    },
  });

  win.setMenu(null);
  if (isDev) win.webContents.openDevTools({ mode: 'detach' });

  loadWindow(win, config.route);

  win.webContents.on('did-finish-load', () => {
    win.webContents.insertCSS(`
      * { scrollbar-width: none !important; }
      *::-webkit-scrollbar { display: none !important; }
      [data-drag="true"] { -webkit-app-region: drag; }
      [data-drag="false"] { -webkit-app-region: no-drag; }
    `);
  });

  win.on('closed', () => {
    taskMemoWindows.delete(taskId);
  });

  taskMemoWindows.set(taskId, win);
}

function openTodoWindow() {
  if (todoWindow) {
    todoWindow.close();
    // todoWindow = null; // Handled by 'closed' event, but explicit is fine
    return;
  }
  todoWindow = createToolWindow('todo', null);
  todoWindow.on('closed', () => { todoWindow = null; });
}

function openSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.close();
    return;
  }
  settingsWindow = createToolWindow('settings', null);
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

function openAiWindow() {
  if (aiWindow) {
    aiWindow.close();
    return;
  }
  aiWindow = createToolWindow('ai', null);
  if (isDev) aiWindow.webContents.openDevTools({ mode: 'detach' });
  aiWindow.on('closed', () => { aiWindow = null; });
}

// Added toggle logic for Memo as well
function openMemoWindow() {
  if (memoWindow) {
    memoWindow.close();
    return;
  }
  memoWindow = createToolWindow('memo', null);
  memoWindow.on('closed', () => { memoWindow = null; });
}

function openPromptLibraryWindow() {
  if (promptLibraryWindow) {
    promptLibraryWindow.close();
    return;
  }
  promptLibraryWindow = createToolWindow('promptLibrary', null);
  if (isDev) promptLibraryWindow.webContents.openDevTools({ mode: 'detach' });
  promptLibraryWindow.on('closed', () => { promptLibraryWindow = null; });
}

function openLinkStationWindow() {
  if (linkStationWindow) {
    linkStationWindow.close();
    return;
  }
  linkStationWindow = createToolWindow('linkStation', null);
  if (isDev) linkStationWindow.webContents.openDevTools({ mode: 'detach' });
  linkStationWindow.on('closed', () => { linkStationWindow = null; });
}

function openChartWindow(query) {
  if (chartWindow && !chartWindow.isDestroyed()) {
    chartWindow.focus();
    loadWindow(chartWindow, `/chart?${query || ''}`);
    return;
  }

  const ses = session.fromPartition('persist:timer-widget');
  chartWindow = new BrowserWindow({
    width: 720,
    height: 560,
    title: '统计',
    frame: false,
    transparent: false,
    backgroundColor: '#1a1a1a',
    alwaysOnTop: false,
    resizable: true,
    maximizable: false,
    minWidth: 360,
    minHeight: 300,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      session: ses,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: false,
    },
  });

  chartWindow.setMenu(null);
  if (isDev) chartWindow.webContents.openDevTools({ mode: 'detach' });

  loadWindow(chartWindow, `/chart?${query || ''}`);

  chartWindow.webContents.on('did-finish-load', () => {
    chartWindow.webContents.insertCSS(`
      * { scrollbar-width: none !important; }
      *::-webkit-scrollbar { display: none !important; }
      [data-drag="true"] { -webkit-app-region: drag; }
      [data-drag="false"] { -webkit-app-region: no-drag; }
    `);
  });

  chartWindow.on('closed', () => { chartWindow = null; });
}

ipcMain.on('open-create-window', () => openCreateWindow());
// ipcMain.on('open-create-window', () => openCreateWindow()); // Duplicate removed
ipcMain.on('open-memo-window', () => openMemoWindow());
ipcMain.on('open-task-memo-window', (event, { taskId, taskName }) => openTaskMemoWindow(taskId, taskName));
ipcMain.on('open-todo-window', () => openTodoWindow());
ipcMain.on('open-ai-window', () => openAiWindow());
ipcMain.on('open-settings-window', () => openSettingsWindow());
ipcMain.on('open-prompt-library-window', () => openPromptLibraryWindow());
ipcMain.on('open-link-station-window', () => openLinkStationWindow());
ipcMain.on('open-chart-window', (event, { query }) => openChartWindow(query));
ipcMain.on('open-external-link', async (event, url) => {
  try {
    await shell.openExternal(url);
  } catch (err) {
    console.error(`[Main] Failed to open external link '${url}':`, err);
  }
});

// Link Station Data Persistence
ipcMain.handle('get-links-data', async () => {
  try {
    const dataPath = path.join(app.getPath('userData'), 'link-station-data.json');
    if (!fs.existsSync(dataPath)) return null;
    return JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  } catch (e) {
    console.error('Failed to read link station data', e);
    return null;
  }
});

ipcMain.on('save-links-data', (event, data) => {
  try {
    const dataPath = path.join(app.getPath('userData'), 'link-station-data.json');
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to save link station data', e);
  }
});

const projectWindows = new Map(); // Map<projectId, BrowserWindow>

ipcMain.on('open-project-window', (event, { projectId, title }) => {
  console.log(`[Main] Request open project window: ${projectId}`);

  if (projectWindows.has(projectId)) {
    const existingWin = projectWindows.get(projectId);
    if (!existingWin.isDestroyed()) {
      console.log(`[Main] Focusing existing window for ${projectId}`);
      if (existingWin.isMinimized()) existingWin.restore();
      existingWin.show();
      existingWin.focus();
      return;
    }
    projectWindows.delete(projectId);
  }

  const ses = session.fromPartition('persist:timer-widget');
  const win = new BrowserWindow({
    width: 400,
    height: 600,
    title: title || 'Project',
    frame: false,
    transparent: false,
    backgroundColor: '#1a1a1a',
    alwaysOnTop: false,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      session: ses,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: false,
    },
  });

  const url = isDev
    ? `http://localhost:5173/#/project/${projectId}`
    : `file://${path.join(__dirname, 'dist/index.html')}#/project/${projectId}`;

  win.loadURL(url);

  win.webContents.on('did-finish-load', () => {
    win.webContents.insertCSS(`
      * { scrollbar-width: none !important; }
      *::-webkit-scrollbar { display: none !important; }
      [data-drag="true"] { -webkit-app-region: drag; }
      [data-drag="false"] { -webkit-app-region: no-drag; }
    `);
  });

  win.on('closed', () => {
    projectWindows.delete(projectId);
  });

  projectWindows.set(projectId, win);
});

// Handle task creation IPC from Create window to Main window
ipcMain.on('start-task', (event, taskData) => {
  console.log('[Main Process] Received start-task:', taskData.name);
  if (mainWindow) {
    mainWindow.webContents.send('on-start-task', taskData);
  }
});

// Helper to log to both stdout and renderer console
function logToCombined(type, ...args) {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
  const prefix = type === 'error' ? '❌' : 'ℹ️';
  const fullMessage = `${prefix} ${message}`;

  // 1. 写入日志文件
  writeLog(fullMessage);

  // 2. Send to Renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('on-console-log', { type, message: fullMessage });
  }
}

// Handle task creation from Create window (Local mode, no AI)
// NOTE: AI parsing removed in standalone mode. Text is used as-is.
ipcMain.on('ai-create-task', async (event, { text, userId, autoStart }) => {
  logToCombined('info', '📝 [Main Process] Received create-task:', text);

  try {
    const db = require('./local-db');
    const title = text.trim() || '未命名任务';
    const newTask = db.createTask({ title, projectId: 'proj-inbox' });

    logToCombined('info', '✅ [Main Process] Local task created:', newTask.id, newTask.title);

    if (mainWindow && !mainWindow.isDestroyed()) {
      const taskData = {
        id: newTask.id,
        name: newTask.title,
        userId: userId || 'local-user',
        categoryPath: newTask.projectId,
        date: new Date().toISOString().split('T')[0],
        initialTime: 0,
        instanceTagNames: [],
        timestamp: Date.now(),
        autoStart: autoStart
      };
      mainWindow.webContents.send('on-start-task', taskData);
    }
  } catch (error) {
    logToCombined('error', '❌ [Main Process] Task creation failed:', error.message);
  }
});

// 工具栏右键菜单
ipcMain.on('show-toolbar-context-menu', (event) => {
  const template = [
    {
      label: '📚 提示词库',
      click: () => {
        openPromptLibraryWindow();
      }
    },
    {
      label: '🔗 链接收纳槽',
      click: () => {
        openLinkStationWindow();
      }
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
});

ipcMain.on('backup-and-push', async (event, backupData) => {
  const timestamp = new Date().toLocaleString();
  const backupFilePath = path.join(__dirname, 'backup_projects.json');
  
  logToCombined('info', `📦 [Main Process] Starting backup to: ${backupFilePath}`);
  
  try {
    // 1. 写入文件
    fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2));
    logToCombined('info', '✅ [Main Process] Backup file written.');

    // 2. 执行 Git 命令
    const commitMsg = `chore: auto-backup local projects [${timestamp}]`;
    const gitCmd = `git add backup_projects.json && git commit -m "${commitMsg}" && git push`;
    
    logToCombined('info', `🐚 [Main Process] Executing: ${gitCmd}`);
    
    exec(gitCmd, { cwd: __dirname }, (error, stdout, stderr) => {
      if (error) {
        logToCombined('error', `❌ [Main Process] Git backup failed: ${error.message}`);
        return;
      }
      logToCombined('info', '✅ [Main Process] Git backup successful.');
      if (stdout) logToCombined('info', `[Git Output] ${stdout}`);
    });
  } catch (err) {
    logToCombined('error', `❌ [Main Process] Backup process failed: ${err.message}`);
  }
});

// ============================================================
// Local Database IPC Handlers (Standalone, no Nexus)
// ============================================================
const db = require('./local-db');

ipcMain.handle('db:getProjects', async () => db.getProjects());
ipcMain.handle('db:createProject', async (event, data) => db.createProject(data));
ipcMain.handle('db:updateProject', async (event, { id, ...data }) => db.updateProject(id, data));
ipcMain.handle('db:deleteProject', async (event, id) => db.deleteProject(id));

ipcMain.handle('db:getBoards', async (event, filter) => db.getBoards(filter || {}));
ipcMain.handle('db:createBoard', async (event, data) => db.createBoard(data));
ipcMain.handle('db:updateBoard', async (event, { id, ...data }) => db.updateBoard(id, data));
ipcMain.handle('db:deleteBoard', async (event, id) => db.deleteBoard(id));

ipcMain.handle('db:getTasks', async (event, filter) => db.getTasks(filter || {}));
ipcMain.handle('db:createTask', async (event, data) => db.createTask(data));
ipcMain.handle('db:updateTask', async (event, { id, ...data }) => db.updateTask(id, data));
ipcMain.handle('db:deleteTask', async (event, id) => db.deleteTask(id));

ipcMain.handle('db:getTimeLogs', async (event, filter) => db.getTimeLogs(filter || {}));
ipcMain.handle('db:createTimeLog', async (event, data) => db.createTimeLog(data));
ipcMain.handle('db:updateTimeLog', async (event, { id, ...data }) => db.updateTimeLog(id, data));
ipcMain.handle('db:deleteTimeLog', async (event, id) => db.deleteTimeLog(id));

ipcMain.handle('db:startTaskTimer', async (event, taskId) => db.startTaskTimer(taskId));
ipcMain.handle('db:stopTaskTimer', async (event, taskId) => db.stopTaskTimer(taskId));
ipcMain.handle('db:getRunningTask', async () => db.getRunningTask());

ipcMain.handle('db:getAllData', async () => db.getAllData());
ipcMain.handle('db:importData', async (event, data) => db.importData(data));

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createMainWindow();
});
