/**
 * Kanban Store - Blueprint-inspired, pure localStorage.
 * Data model: projects[] → boards[] → tasks[] → timers[] (独立挂载)
 */

// ── Types ──────────────────────────────────────────────────

export interface KanbanTimer {
  id: string;
  taskId: string;
  isRunning: boolean;
  totalSeconds: number;
  startedAt: string | null;
  createdAt: string;
}

export interface KanbanTask {
  id: string;
  projectId: string;
  boardId: string;
  title: string;
  completed: boolean;
  order: number;
  timerId: string | null; // 挂载的计时器引用（可选）
  createdAt: string;
}

export interface KanbanBoard {
  id: string;
  projectId: string;
  name: string;
  order: number;
  color: string;
}

export interface KanbanProject {
  id: string;
  name: string;
  color: string;
  order: number;
}

// ── Storage ────────────────────────────────────────────────

const STORAGE_KEY = 'kanban-data-v2';

function generateId(prefix = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

interface StoreData {
  projects: KanbanProject[];
  boards: KanbanBoard[];
  tasks: KanbanTask[];
  timers: KanbanTimer[];
}

function initData(): StoreData {
  const inbox: KanbanProject = { id: 'proj-inbox', name: 'Inbox', color: '#888888', order: 0 };
  const boards: KanbanBoard[] = [
    { id: 'board-todo', projectId: inbox.id, name: 'To Do', order: 0, color: '#888888' },
    { id: 'board-doing', projectId: inbox.id, name: 'In Progress', order: 1, color: '#4488ff' },
    { id: 'board-done', projectId: inbox.id, name: 'Done', order: 2, color: '#44aa44' },
  ];
  return { projects: [inbox], boards, tasks: [], timers: [] };
}

function read(): StoreData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  const data = initData();
  write(data);
  return data;
}

function write(data: StoreData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ── Projects ───────────────────────────────────────────────

export function getProjects(): KanbanProject[] {
  return read().projects.sort((a, b) => a.order - b.order);
}

export function createProject(name: string, color = '#888888'): KanbanProject {
  const data = read();
  const proj: KanbanProject = {
    id: generateId('proj'),
    name: name || 'New Project',
    color,
    order: data.projects.length,
  };
  data.projects.push(proj);
  const defaultBoards = ['To Do', 'In Progress', 'Done'];
  defaultBoards.forEach((n, i) => {
    data.boards.push({
      id: generateId('board'),
      projectId: proj.id,
      name: n,
      order: i,
      color: i === 0 ? '#888888' : i === 1 ? '#4488ff' : '#44aa44',
    });
  });
  write(data);
  return proj;
}

export function updateProject(id: string, updates: Partial<KanbanProject>) {
  const data = read();
  const idx = data.projects.findIndex(p => p.id === id);
  if (idx === -1) return null;
  data.projects[idx] = { ...data.projects[idx], ...updates };
  write(data);
  return data.projects[idx];
}

export function deleteProject(id: string) {
  const data = read();
  data.projects = data.projects.filter(p => p.id !== id);
  data.boards = data.boards.filter(b => b.projectId !== id);
  const tasksToDelete = data.tasks.filter(t => t.projectId === id);
  const timerIdsToDelete = tasksToDelete.map(t => t.timerId).filter(Boolean) as string[];
  data.timers = data.timers.filter(tm => !timerIdsToDelete.includes(tm.id));
  data.tasks = data.tasks.filter(t => t.projectId !== id);
  write(data);
  return true;
}

// ── Boards ─────────────────────────────────────────────────

export function getBoards(projectId?: string): KanbanBoard[] {
  let boards = read().boards;
  if (projectId) boards = boards.filter(b => b.projectId === projectId);
  return boards.sort((a, b) => a.order - b.order);
}

export function createBoard(projectId: string, name: string, color = '#888888'): KanbanBoard {
  const data = read();
  const board: KanbanBoard = {
    id: generateId('board'),
    projectId,
    name: name || 'New Board',
    order: data.boards.filter(b => b.projectId === projectId).length,
    color,
  };
  data.boards.push(board);
  write(data);
  return board;
}

export function updateBoard(id: string, updates: Partial<KanbanBoard>) {
  const data = read();
  const idx = data.boards.findIndex(b => b.id === id);
  if (idx === -1) return null;
  data.boards[idx] = { ...data.boards[idx], ...updates };
  write(data);
  return data.boards[idx];
}

export function deleteBoard(id: string) {
  const data = read();
  const board = data.boards.find(b => b.id === id);
  if (!board) return false;
  data.boards = data.boards.filter(b => b.id !== id);
  const first = data.boards.find(b => b.projectId === board.projectId);
  if (first) {
    data.tasks.forEach(t => { if (t.boardId === id) t.boardId = first.id; });
  }
  write(data);
  return true;
}

// ── Tasks ──────────────────────────────────────────────────

export function getTasks(filter?: { projectId?: string; boardId?: string }): KanbanTask[] {
  let tasks = read().tasks;
  if (filter?.projectId) tasks = tasks.filter(t => t.projectId === filter.projectId);
  if (filter?.boardId) tasks = tasks.filter(t => t.boardId === filter.boardId);
  return tasks.sort((a, b) => a.order - b.order);
}

export function createTask(projectId: string, boardId: string, title: string): KanbanTask {
  const data = read();
  const task: KanbanTask = {
    id: generateId('task'),
    projectId,
    boardId,
    title: title || 'New Task',
    completed: false,
    order: data.tasks.filter(t => t.boardId === boardId).length,
    timerId: null,
    createdAt: new Date().toISOString(),
  };
  data.tasks.push(task);
  write(data);
  return task;
}

export function updateTask(id: string, updates: Partial<KanbanTask>) {
  const data = read();
  const idx = data.tasks.findIndex(t => t.id === id);
  if (idx === -1) return null;
  data.tasks[idx] = { ...data.tasks[idx], ...updates };
  write(data);
  return data.tasks[idx];
}

export function deleteTask(id: string) {
  const data = read();
  const task = data.tasks.find(t => t.id === id);
  if (task?.timerId) {
    data.timers = data.timers.filter(tm => tm.id !== task.timerId);
  }
  data.tasks = data.tasks.filter(t => t.id !== id);
  write(data);
  return true;
}

export function moveTask(taskId: string, targetBoardId: string, newOrder?: number) {
  const data = read();
  const task = data.tasks.find(t => t.id === taskId);
  if (!task) return null;
  task.boardId = targetBoardId;
  if (typeof newOrder === 'number') task.order = newOrder;
  const board = data.boards.find(b => b.id === targetBoardId);
  if (board?.name.toLowerCase() === 'done') task.completed = true;
  write(data);
  return task;
}

// ── Timers (独立挂载) ──────────────────────────────────────

export function getTimers(filter?: { taskId?: string }): KanbanTimer[] {
  let timers = read().timers;
  if (filter?.taskId) timers = timers.filter(tm => tm.taskId === filter.taskId);
  return timers;
}

export function getTimerById(id: string): KanbanTimer | undefined {
  return read().timers.find(tm => tm.id === id);
}

export function getTimerByTaskId(taskId: string): KanbanTimer | undefined {
  return read().timers.find(tm => tm.taskId === taskId);
}

/** 为指定任务创建并挂载一个计时器 */
export function attachTimer(taskId: string): KanbanTimer | null {
  const data = read();
  const task = data.tasks.find(t => t.id === taskId);
  if (!task) return null;
  if (task.timerId) return data.timers.find(tm => tm.id === task.timerId) || null;

  const timer: KanbanTimer = {
    id: generateId('timer'),
    taskId,
    isRunning: false,
    totalSeconds: 0,
    startedAt: null,
    createdAt: new Date().toISOString(),
  };
  data.timers.push(timer);
  task.timerId = timer.id;
  write(data);
  return timer;
}

/** 从任务上卸载并删除计时器 */
export function detachTimer(taskId: string): boolean {
  const data = read();
  const task = data.tasks.find(t => t.id === taskId);
  if (!task || !task.timerId) return false;
  data.timers = data.timers.filter(tm => tm.id !== task.timerId);
  task.timerId = null;
  write(data);
  return true;
}

export function startTimer(timerId: string): KanbanTimer | null {
  const data = read();
  const now = new Date().toISOString();
  // 停止其他正在运行的计时器
  data.timers.forEach(tm => {
    if (tm.id !== timerId && tm.isRunning && tm.startedAt) {
      const elapsed = Math.floor((Date.now() - new Date(tm.startedAt).getTime()) / 1000);
      tm.totalSeconds += elapsed;
      tm.isRunning = false;
      tm.startedAt = null;
    }
  });
  const timer = data.timers.find(tm => tm.id === timerId);
  if (!timer) return null;
  timer.isRunning = true;
  timer.startedAt = now;
  write(data);
  return timer;
}

export function stopTimer(timerId: string): KanbanTimer | null {
  const data = read();
  const timer = data.timers.find(tm => tm.id === timerId);
  if (!timer || !timer.isRunning || !timer.startedAt) return null;
  const elapsed = Math.floor((Date.now() - new Date(timer.startedAt).getTime()) / 1000);
  timer.totalSeconds += elapsed;
  timer.isRunning = false;
  timer.startedAt = null;
  write(data);
  return timer;
}

export function toggleTimer(timerId: string): KanbanTimer | null {
  const tm = getTimerById(timerId);
  if (!tm) return null;
  return tm.isRunning ? stopTimer(timerId) : startTimer(timerId);
}

export function getRunningTimer(): KanbanTimer | null {
  return read().timers.find(tm => tm.isRunning) || null;
}

export function getDisplayTime(timer: KanbanTimer): number {
  let total = timer.totalSeconds;
  if (timer.isRunning && timer.startedAt) {
    total += Math.floor((Date.now() - new Date(timer.startedAt).getTime()) / 1000);
  }
  return total;
}
