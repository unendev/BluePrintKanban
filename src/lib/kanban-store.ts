/**
 * Blueprint Store - Infinite canvas with free nodes
 * Pure localStorage, no cloud.
 */

export type NodeType = 'task' | 'timer' | 'note';

export interface BlueprintNode {
  id: string;
  projectId: string;
  type: NodeType;
  title: string;
  content?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  completed?: boolean;
  timerData?: {
    isRunning: boolean;
    totalSeconds: number;
    startedAt: string | null;
  };
  connections: string[]; // ids of target nodes this node connects TO
  createdAt: string;
}

export interface BlueprintProject {
  id: string;
  name: string;
  color: string;
  order: number;
  camera: {
    x: number;
    y: number;
    zoom: number;
  };
  showGrid: boolean;
}

const STORAGE_KEY = 'blueprint-data-v3';

function generateId(prefix = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const DEFAULT_SIZES: Record<NodeType, { width: number; height: number }> = {
  task: { width: 240, height: 64 },
  timer: { width: 160, height: 44 },
  note: { width: 200, height: 120 },
};

const DEFAULT_COLORS: Record<NodeType, string> = {
  task: '#3b82f6',
  timer: '#f59e0b',
  note: '#22c55e',
};

function initData(): { projects: BlueprintProject[]; nodes: BlueprintNode[] } {
  const proj: BlueprintProject = {
    id: 'proj-inbox',
    name: 'Inbox',
    color: '#888888',
    order: 0,
    camera: { x: 0, y: 0, zoom: 1 },
    showGrid: true,
  };
  const now = new Date().toISOString();
  const nodes: BlueprintNode[] = [
    {
      id: 'node-1',
      projectId: proj.id,
      type: 'task',
      title: 'Welcome to Blueprint!',
      x: 100, y: 100,
      width: 260, height: 64,
      color: '#3b82f6',
      completed: false,
      connections: [],
      createdAt: now,
    },
    {
      id: 'node-2',
      projectId: proj.id,
      type: 'task',
      title: 'Right-click canvas to add nodes',
      x: 100, y: 200,
      width: 280, height: 64,
      color: '#3b82f6',
      completed: false,
      connections: [],
      createdAt: now,
    },
    {
      id: 'node-3',
      projectId: proj.id,
      type: 'task',
      title: 'Drag nodes to organize your thoughts',
      x: 400, y: 100,
      width: 300, height: 64,
      color: '#3b82f6',
      completed: false,
      connections: [],
      createdAt: now,
    },
    {
      id: 'node-4',
      projectId: proj.id,
      type: 'timer',
      title: 'Focus Timer',
      x: 440, y: 200,
      width: 160, height: 44,
      color: '#f59e0b',
      timerData: { isRunning: false, totalSeconds: 0, startedAt: null },
      connections: ['node-1'],
      createdAt: now,
    },
  ];
  return { projects: [proj], nodes };
}

function read(): { projects: BlueprintProject[]; nodes: BlueprintNode[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  const data = initData();
  write(data);
  return data;
}

function write(data: { projects: BlueprintProject[]; nodes: BlueprintNode[] }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ── Projects ───────────────────────────────────────────────

export function getProjects(): BlueprintProject[] {
  return read().projects.sort((a, b) => a.order - b.order);
}

export function createProject(name: string, color = '#888888'): BlueprintProject {
  const data = read();
  const proj: BlueprintProject = {
    id: generateId('proj'),
    name: name || 'New Project',
    color,
    order: data.projects.length,
    camera: { x: 0, y: 0, zoom: 1 },
    showGrid: true,
  };
  data.projects.push(proj);
  write(data);
  return proj;
}

export function deleteProject(id: string) {
  const data = read();
  data.projects = data.projects.filter(p => p.id !== id);
  data.nodes = data.nodes.filter(n => n.projectId !== id);
  write(data);
  return true;
}

export function updateProjectCamera(id: string, camera: Partial<BlueprintProject['camera']>) {
  const data = read();
  const idx = data.projects.findIndex(p => p.id === id);
  if (idx === -1) return null;
  data.projects[idx].camera = { ...data.projects[idx].camera, ...camera };
  write(data);
  return data.projects[idx];
}

export function toggleProjectGrid(id: string) {
  const data = read();
  const idx = data.projects.findIndex(p => p.id === id);
  if (idx === -1) return null;
  data.projects[idx].showGrid = !data.projects[idx].showGrid;
  write(data);
  return data.projects[idx];
}

// ── Nodes ──────────────────────────────────────────────────

export function getNodes(projectId?: string): BlueprintNode[] {
  let nodes = read().nodes;
  if (projectId) nodes = nodes.filter(n => n.projectId === projectId);
  return nodes;
}

export function createNode(
  projectId: string,
  type: NodeType,
  title: string,
  x: number,
  y: number,
  color?: string
): BlueprintNode {
  const data = read();
  const size = DEFAULT_SIZES[type];
  const node: BlueprintNode = {
    id: generateId('node'),
    projectId,
    type,
    title: title || `New ${type}`,
    x, y,
    width: size.width,
    height: size.height,
    color: color || DEFAULT_COLORS[type],
    connections: [],
    createdAt: new Date().toISOString(),
  };
  if (type === 'task') node.completed = false;
  if (type === 'timer') {
    node.timerData = { isRunning: false, totalSeconds: 0, startedAt: null };
  }
  data.nodes.push(node);
  write(data);
  return node;
}

export function updateNode(id: string, updates: Partial<BlueprintNode>) {
  const data = read();
  const idx = data.nodes.findIndex(n => n.id === id);
  if (idx === -1) return null;
  data.nodes[idx] = { ...data.nodes[idx], ...updates };
  write(data);
  return data.nodes[idx];
}

export function deleteNode(id: string) {
  const data = read();
  data.nodes = data.nodes.filter(n => n.id !== id);
  // Remove connections to deleted node
  data.nodes.forEach(n => {
    n.connections = n.connections.filter(c => c !== id);
  });
  write(data);
  return true;
}

// ── Connections ────────────────────────────────────────────

export function connectNodes(fromId: string, toId: string): boolean {
  const data = read();
  const from = data.nodes.find(n => n.id === fromId);
  if (!from) return false;
  if (from.connections.includes(toId)) return false;
  from.connections.push(toId);
  write(data);
  return true;
}

export function disconnectNodes(fromId: string, toId: string): boolean {
  const data = read();
  const from = data.nodes.find(n => n.id === fromId);
  if (!from) return false;
  from.connections = from.connections.filter(c => c !== toId);
  write(data);
  return true;
}

// ── Timer ──────────────────────────────────────────────────

export function startTimer(nodeId: string): BlueprintNode | null {
  const data = read();
  const now = new Date().toISOString();
  // Stop other running timers
  data.nodes.forEach(n => {
    if (n.id !== nodeId && n.timerData?.isRunning && n.timerData.startedAt) {
      const elapsed = Math.floor((Date.now() - new Date(n.timerData.startedAt).getTime()) / 1000);
      n.timerData.totalSeconds += elapsed;
      n.timerData.isRunning = false;
      n.timerData.startedAt = null;
    }
  });
  const node = data.nodes.find(n => n.id === nodeId);
  if (!node || !node.timerData) return null;
  node.timerData.isRunning = true;
  node.timerData.startedAt = now;
  write(data);
  return node;
}

export function stopTimer(nodeId: string): BlueprintNode | null {
  const data = read();
  const node = data.nodes.find(n => n.id === nodeId);
  if (!node || !node.timerData?.isRunning || !node.timerData.startedAt) return null;
  const elapsed = Math.floor((Date.now() - new Date(node.timerData.startedAt).getTime()) / 1000);
  node.timerData.totalSeconds += elapsed;
  node.timerData.isRunning = false;
  node.timerData.startedAt = null;
  write(data);
  return node;
}

export function toggleNodeTimer(nodeId: string): BlueprintNode | null {
  const node = read().nodes.find(n => n.id === nodeId);
  if (!node?.timerData) return null;
  return node.timerData.isRunning ? stopTimer(nodeId) : startTimer(nodeId);
}

export function getDisplayTime(node: BlueprintNode): number {
  if (!node.timerData) return 0;
  let total = node.timerData.totalSeconds;
  if (node.timerData.isRunning && node.timerData.startedAt) {
    total += Math.floor((Date.now() - new Date(node.timerData.startedAt).getTime()) / 1000);
  }
  return total;
}

export function getRunningNode(): BlueprintNode | null {
  return read().nodes.find(n => n.timerData?.isRunning) || null;
}
