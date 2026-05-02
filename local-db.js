const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// ============================================================
// Local JSON Database for Timer (Standalone, no Nexus)
// ============================================================
// Tables: projects, tasks, timeLogs
// Storage: <userData>/timer-data.json

const DB_FILE_NAME = 'timer-data.json';

let dbPath = null;
let dataCache = null;

function getDbPath() {
  if (!dbPath) {
    const userData = app ? app.getPath('userData') : require('os').homedir();
    dbPath = path.join(userData, DB_FILE_NAME);
  }
  return dbPath;
}

function initDefaults() {
  return {
    projects: [
      { id: 'proj-inbox', name: 'Inbox', order: 0, color: '#888888' },
      { id: 'proj-deadline', name: '死线', order: 1, color: '#ff4444' },
      { id: 'proj-important', name: '重要', order: 2, color: '#ffaa00' },
      { id: 'proj-explore', name: '探索', order: 3, color: '#4488ff' },
    ],
    boards: [
      { id: 'board-todo', projectId: 'proj-inbox', name: 'To Do', order: 0, color: '#888888' },
      { id: 'board-doing', projectId: 'proj-inbox', name: 'In Progress', order: 1, color: '#4488ff' },
      { id: 'board-done', projectId: 'proj-inbox', name: 'Done', order: 2, color: '#44aa44' },
    ],
    tasks: [],
    timeLogs: [],
    meta: { version: 2, createdAt: new Date().toISOString() },
  };
}

function readDb() {
  if (dataCache) return dataCache;
  const filePath = getDbPath();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      dataCache = JSON.parse(raw);
      // Ensure all tables exist
      if (!dataCache.projects) dataCache.projects = initDefaults().projects;
      if (!dataCache.boards) dataCache.boards = initDefaults().boards;
      if (!dataCache.tasks) dataCache.tasks = [];
      if (!dataCache.timeLogs) dataCache.timeLogs = [];
      if (!dataCache.meta) dataCache.meta = initDefaults().meta;
      // Migration: add boardId to tasks that don't have one
      dataCache.tasks.forEach(t => {
        if (!t.boardId) t.boardId = 'board-todo';
      });
      return dataCache;
    }
  } catch (e) {
    console.error('[LocalDB] Failed to read DB, initializing fresh:', e.message);
  }
  dataCache = initDefaults();
  writeDb();
  return dataCache;
}

function writeDb() {
  const filePath = getDbPath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(dataCache, null, 2), 'utf-8');
  } catch (e) {
    console.error('[LocalDB] Failed to write DB:', e.message);
  }
}

function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ============================================================
// CRUD API
// ============================================================

// --- Projects ---
function getProjects() {
  return readDb().projects;
}

function createProject(project) {
  const db = readDb();
  const newProject = {
    id: generateId('proj'),
    name: project.name || '未命名',
    order: typeof project.order === 'number' ? project.order : db.projects.length,
    color: project.color || '#888888',
  };
  db.projects.push(newProject);
  writeDb();
  return newProject;
}

function updateProject(id, updates) {
  const db = readDb();
  const idx = db.projects.findIndex(p => p.id === id);
  if (idx === -1) return null;
  db.projects[idx] = { ...db.projects[idx], ...updates };
  writeDb();
  return db.projects[idx];
}

function deleteProject(id) {
  const db = readDb();
  const idx = db.projects.findIndex(p => p.id === id);
  if (idx === -1) return false;
  db.projects.splice(idx, 1);
  // Cascade: move tasks to inbox or delete them? Move to inbox for safety.
  db.tasks.forEach(t => { if (t.projectId === id) t.projectId = 'proj-inbox'; });
  writeDb();
  return true;
}

// --- Boards ---
function getBoards(filter = {}) {
  let boards = readDb().boards;
  if (filter.projectId) boards = boards.filter(b => b.projectId === filter.projectId);
  return boards.sort((a, b) => (a.order || 0) - (b.order || 0));
}

function createBoard(board) {
  const db = readDb();
  const newBoard = {
    id: generateId('board'),
    projectId: board.projectId || 'proj-inbox',
    name: board.name || 'New Board',
    order: typeof board.order === 'number' ? board.order : db.boards.filter(b => b.projectId === board.projectId).length,
    color: board.color || '#888888',
  };
  db.boards.push(newBoard);
  writeDb();
  return newBoard;
}

function updateBoard(id, updates) {
  const db = readDb();
  const idx = db.boards.findIndex(b => b.id === id);
  if (idx === -1) return null;
  db.boards[idx] = { ...db.boards[idx], ...updates };
  writeDb();
  return db.boards[idx];
}

function deleteBoard(id) {
  const db = readDb();
  const idx = db.boards.findIndex(b => b.id === id);
  if (idx === -1) return false;
  db.boards.splice(idx, 1);
  // Move tasks to first board
  const firstBoard = db.boards[0];
  if (firstBoard) {
    db.tasks.forEach(t => { if (t.boardId === id) t.boardId = firstBoard.id; });
  }
  writeDb();
  return true;
}

// --- Tasks ---
function getTasks(filter = {}) {
  let tasks = readDb().tasks;
  if (filter.projectId) tasks = tasks.filter(t => t.projectId === filter.projectId);
  if (filter.boardId) tasks = tasks.filter(t => t.boardId === filter.boardId);
  if (filter.parentId !== undefined) {
    tasks = tasks.filter(t => (t.parentId || null) === filter.parentId);
  }
  if (filter.completed !== undefined) tasks = tasks.filter(t => t.completed === filter.completed);
  return tasks.sort((a, b) => (a.order || 0) - (b.order || 0));
}

function createTask(task) {
  const db = readDb();
  const newTask = {
    id: generateId('task'),
    projectId: task.projectId || 'proj-inbox',
    boardId: task.boardId || 'board-todo',
    title: task.title || '未命名任务',
    completed: false,
    parentId: task.parentId || null,
    order: typeof task.order === 'number' ? task.order : db.tasks.filter(t => t.boardId === (task.boardId || 'board-todo')).length,
    timer: { isRunning: false, totalSeconds: 0 },
    createdAt: new Date().toISOString(),
  };
  db.tasks.push(newTask);
  writeDb();
  return newTask;
}

function updateTask(id, updates) {
  const db = readDb();
  const idx = db.tasks.findIndex(t => t.id === id);
  if (idx === -1) return null;
  db.tasks[idx] = { ...db.tasks[idx], ...updates };
  writeDb();
  return db.tasks[idx];
}

function deleteTask(id) {
  const db = readDb();
  const idx = db.tasks.findIndex(t => t.id === id);
  if (idx === -1) return false;
  db.tasks.splice(idx, 1);
  // Cascade: delete subtasks
  db.tasks = db.tasks.filter(t => t.parentId !== id);
  // Cascade: delete timeLogs
  db.timeLogs = db.timeLogs.filter(l => l.taskId !== id);
  writeDb();
  return true;
}

// --- TimeLogs ---
function getTimeLogs(filter = {}) {
  let logs = readDb().timeLogs;
  if (filter.taskId) logs = logs.filter(l => l.taskId === filter.taskId);
  return logs.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
}

function createTimeLog(log) {
  const db = readDb();
  const newLog = {
    id: generateId('log'),
    taskId: log.taskId,
    startedAt: log.startedAt || new Date().toISOString(),
    endedAt: log.endedAt || null,
    duration: log.duration || 0,
  };
  db.timeLogs.push(newLog);
  writeDb();
  return newLog;
}

function updateTimeLog(id, updates) {
  const db = readDb();
  const idx = db.timeLogs.findIndex(l => l.id === id);
  if (idx === -1) return null;
  db.timeLogs[idx] = { ...db.timeLogs[idx], ...updates };
  writeDb();
  return db.timeLogs[idx];
}

function deleteTimeLog(id) {
  const db = readDb();
  const idx = db.timeLogs.findIndex(l => l.id === id);
  if (idx === -1) return false;
  db.timeLogs.splice(idx, 1);
  writeDb();
  return true;
}

// --- Timer Control (convenience) ---
function startTaskTimer(taskId) {
  const db = readDb();
  const task = db.tasks.find(t => t.id === taskId);
  if (!task) return null;
  // Stop any other running timers
  db.tasks.forEach(t => {
    if (t.id !== taskId && t.timer && t.timer.isRunning) {
      const elapsed = Math.floor((Date.now() - new Date(t.timer.startedAt).getTime()) / 1000);
      t.timer.totalSeconds = (t.timer.totalSeconds || 0) + elapsed;
      t.timer.isRunning = false;
      t.timer.startedAt = null;
      // Close open timeLog
      const openLog = db.timeLogs.find(l => l.taskId === t.id && !l.endedAt);
      if (openLog) {
        openLog.endedAt = new Date().toISOString();
        openLog.duration = elapsed;
      }
    }
  });
  task.timer = task.timer || { isRunning: false, totalSeconds: 0 };
  task.timer.isRunning = true;
  task.timer.startedAt = new Date().toISOString();
  // Create new timeLog
  const newLog = {
    id: generateId('log'),
    taskId: taskId,
    startedAt: task.timer.startedAt,
    endedAt: null,
    duration: 0,
  };
  db.timeLogs.push(newLog);
  writeDb();
  return { task, log: newLog };
}

function stopTaskTimer(taskId) {
  const db = readDb();
  const task = db.tasks.find(t => t.id === taskId);
  if (!task || !task.timer || !task.timer.isRunning) return null;
  const elapsed = Math.floor((Date.now() - new Date(task.timer.startedAt).getTime()) / 1000);
  task.timer.totalSeconds = (task.timer.totalSeconds || 0) + elapsed;
  task.timer.isRunning = false;
  task.timer.startedAt = null;
  // Close open timeLog
  const openLog = db.timeLogs.find(l => l.taskId === taskId && !l.endedAt);
  if (openLog) {
    openLog.endedAt = new Date().toISOString();
    openLog.duration = elapsed;
  }
  writeDb();
  return { task, elapsed };
}

function getRunningTask() {
  const db = readDb();
  return db.tasks.find(t => t.timer && t.timer.isRunning) || null;
}

// --- Full data dump / restore ---
function getAllData() {
  return readDb();
}

function importData(newData) {
  dataCache = {
    projects: newData.projects || [],
    boards: newData.boards || initDefaults().boards,
    tasks: newData.tasks || [],
    timeLogs: newData.timeLogs || [],
    meta: { ...initDefaults().meta, importedAt: new Date().toISOString() },
  };
  writeDb();
  return dataCache;
}

module.exports = {
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  getBoards,
  createBoard,
  updateBoard,
  deleteBoard,
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  getTimeLogs,
  createTimeLog,
  updateTimeLog,
  deleteTimeLog,
  startTaskTimer,
  stopTaskTimer,
  getRunningTask,
  getAllData,
  importData,
};
