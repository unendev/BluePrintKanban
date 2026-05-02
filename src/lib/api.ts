// ============================================================
// Local API Layer: Intercepts all /api/* calls and routes them
// to Electron IPC (local-db.js). No network, no Nexus.
// ============================================================

export const API_BASE_URL = ''; // No longer used; kept for compatibility

// Helper to check if we're inside Electron with local DB bridge
const isElectronLocal = () => {
  // @ts-ignore
  return typeof window !== 'undefined' && window.electron && typeof window.electron.invoke === 'function';
};

// Unified invoke helper
async function invokeDb(channel: string, data?: unknown) {
  if (!isElectronLocal()) {
    throw new Error('Local DB bridge not available. Are you running inside Electron?');
  }
  // @ts-ignore
  const result = await window.electron.invoke(channel, data);
  return result;
}

// Legacy compatibility: getApiUrl still exists but returns local path
export function getApiUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return path;
}

// ============================================================
// API Route Mapping: /api/* → IPC channels
// ============================================================

async function handleLocalApi(url: string, options?: RequestInit): Promise<unknown> {
  const path = url.replace(/^\/api\//, '');

  // --- Timer Tasks (legacy compatibility) ---
  if (path === 'timer-tasks' && (!options || options.method === 'GET')) {
    // GET /api/timer-tasks?userId=...&date=...
    return invokeDb('db:getTasks', {});
  }

  if (path === 'timer-tasks' && options?.method === 'POST') {
    const body = options.body ? JSON.parse(options.body as string) : {};
    return invokeDb('db:createTask', {
      title: body.name || body.title || '未命名任务',
      projectId: body.projectId || body.categoryPath || 'proj-inbox',
      parentId: body.parentId || null,
    });
  }

  if (path === 'timer-tasks' && options?.method === 'PUT') {
    const body = options.body ? JSON.parse(options.body as string) : {};
    if (body.id) {
      return invokeDb('db:updateTask', { id: body.id, ...body });
    }
    throw new Error('PUT /api/timer-tasks requires id');
  }

  if (path.startsWith('timer-tasks') && options?.method === 'DELETE') {
    const urlObj = new URL(url, 'http://localhost');
    const id = urlObj.searchParams.get('id');
    if (id) return invokeDb('db:deleteTask', id);
    throw new Error('DELETE /api/timer-tasks requires id');
  }

  // --- Instance Tags (legacy compatibility: store as project colors or ignore) ---
  if (path === 'instance-tags') {
    // Return empty or map to project colors
    return { instanceTags: [] };
  }

  // --- Timer Categories (legacy compatibility) ---
  if (path === 'timer-categories' || path === 'log-categories') {
    const projects = await invokeDb('db:getProjects');
    return projects.map((p: { name: string; color: string }) => ({
      name: p.name,
      color: p.color,
    }));
  }

  // --- Auth (legacy compatibility: always return local user) ---
  if (path === 'auth/session') {
    return { user: { id: 'local-user', name: 'Local User', email: 'local@timer.app' } };
  }

  if (path === 'auth/token') {
    return { token: 'local-token', user: { id: 'local-user', name: 'Local User' } };
  }

  // --- Widget AI Sessions (legacy: return empty, no AI in MVP) ---
  if (path === 'widget/ai/sessions') {
    return [];
  }

  if (path === 'chat/widget') {
    throw new Error('AI chat not available in local standalone mode');
  }

  // --- Task Parse (legacy: simple local parser) ---
  if (path === 'timer-tasks/parse') {
    const body = options?.body ? JSON.parse(options.body as string) : {};
    const text = body.text || '';
    // Simple local parser: first line is title, any number is duration in minutes
    const lines = text.split('\n');
    const name = lines[0].trim() || '未命名任务';
    const durationMatch = text.match(/(\d+)\s*(分钟|min|m)/);
    const duration = durationMatch ? parseInt(durationMatch[1], 10) : 0;
    return { name, duration, categoryPath: 'proj-inbox', instanceTags: [] };
  }

  // Fallback: unknown route
  console.warn('[LocalAPI] Unhandled route:', path);
  throw new Error(`Unhandled local API route: ${path}`);
}

// ============================================================
// fetcher: SWR-compatible, intercepts /api/* automatically
// ============================================================

export const fetcher = async (url: string) => {
  if (url.startsWith('/api/')) {
    return handleLocalApi(url);
  }
  // For non-api URLs, fall back to regular fetch (shouldn't happen in standalone mode)
  const res = await fetch(getApiUrl(url), { credentials: 'include' });
  return res.json();
};

// ============================================================
// localFetch: Drop-in replacement for fetch() in components
// ============================================================

export async function localFetch(url: string, options?: RequestInit): Promise<Response> {
  if (!url.startsWith('/api/')) {
    // Pass through to regular fetch for non-API URLs
    return fetch(getApiUrl(url), options);
  }

  try {
    const data = await handleLocalApi(url, options);
    // Wrap in a Response-like object for compatibility
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => data,
      text: async () => JSON.stringify(data),
      headers: new Headers({ 'content-type': 'application/json' }),
    } as Response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 500,
      statusText: message,
      json: async () => ({ error: message }),
      text: async () => message,
      headers: new Headers({ 'content-type': 'application/json' }),
    } as Response;
  }
}

// ============================================================
// Direct DB Access (for new components)
// ============================================================

export const db = {
  projects: {
    getAll: () => invokeDb('db:getProjects'),
    create: (data: Record<string, unknown>) => invokeDb('db:createProject', data),
    update: (id: string, data: Record<string, unknown>) => invokeDb('db:updateProject', { id, ...data }),
    delete: (id: string) => invokeDb('db:deleteProject', id),
  },
  tasks: {
    getAll: (filter?: Record<string, unknown>) => invokeDb('db:getTasks', filter),
    create: (data: Record<string, unknown>) => invokeDb('db:createTask', data),
    update: (id: string, data: Record<string, unknown>) => invokeDb('db:updateTask', { id, ...data }),
    delete: (id: string) => invokeDb('db:deleteTask', id),
  },
  timeLogs: {
    getAll: (filter?: Record<string, unknown>) => invokeDb('db:getTimeLogs', filter),
    create: (data: Record<string, unknown>) => invokeDb('db:createTimeLog', data),
    update: (id: string, data: Record<string, unknown>) => invokeDb('db:updateTimeLog', { id, ...data }),
    delete: (id: string) => invokeDb('db:deleteTimeLog', id),
  },
  timer: {
    start: (taskId: string) => invokeDb('db:startTaskTimer', taskId),
    stop: (taskId: string) => invokeDb('db:stopTaskTimer', taskId),
    getRunning: () => invokeDb('db:getRunningTask'),
  },
  getAllData: () => invokeDb('db:getAllData'),
  importData: (data: unknown) => invokeDb('db:importData', data),
};
