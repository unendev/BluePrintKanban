import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Plus, X, Play, Pause, Trash2, Grip, Grid3X3, RotateCcw, Clock,
  Timer as TimerIcon, Type, StickyNote, ChevronLeft, ChevronRight
} from 'lucide-react';
import {
  getProjects,
  getNodes,
  createProject,
  createNode,
  updateNode,
  deleteNode,
  updateProjectCamera,
  toggleProjectGrid,
  connectNodes,
  disconnectNodes,
  toggleNodeTimer,
  getDisplayTime,
  getRunningNode,
  type BlueprintProject,
  type BlueprintNode,
  type NodeType,
} from '@/lib/kanban-store';

// ============================================================
// Helpers
// ============================================================
function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(String(h).padStart(2, '0'));
  parts.push(String(m).padStart(2, '0'));
  parts.push(String(s).padStart(2, '0'));
  return parts.join(':');
}

function snapToGrid(val: number, gridSize: number): number {
  return Math.round(val / gridSize) * gridSize;
}

function useTimerTick(node: BlueprintNode): number {
  const [display, setDisplay] = useState(() => getDisplayTime(node));
  useEffect(() => {
    setDisplay(getDisplayTime(node));
    if (!node.timerData?.isRunning) return;
    const id = setInterval(() => setDisplay(getDisplayTime(node)), 1000);
    return () => clearInterval(id);
  }, [node.timerData?.isRunning, node.timerData?.totalSeconds, node.timerData?.startedAt]);
  return display;
}

// ============================================================
// Bezier Connection Line
// ============================================================
function ConnectionLine({
  from,
  to,
}: {
  from: { x: number; y: number; width: number; height: number };
  to: { x: number; y: number; width: number; height: number };
}) {
  const sx = from.x + from.width;
  const sy = from.y + from.height / 2;
  const ex = to.x;
  const ey = to.y + to.height / 2;
  const cx1 = sx + Math.max(60, (ex - sx) / 2);
  const cx2 = ex - Math.max(60, (ex - sx) / 2);

  return (
    <g>
      {/* glow */}
      <path
        d={`M ${sx} ${sy} C ${cx1} ${sy}, ${cx2} ${ey}, ${ex} ${ey}`}
        fill="none"
        stroke="#f59e0b"
        strokeWidth="3"
        opacity="0.2"
        strokeLinecap="round"
      />
      <path
        d={`M ${sx} ${sy} C ${cx1} ${sy}, ${cx2} ${ey}, ${ex} ${ey}`}
        fill="none"
        stroke="#f59e0b"
        strokeWidth="2"
        opacity="0.7"
        strokeLinecap="round"
        strokeDasharray="6 4"
      />
      {/* arrow head */}
      <circle cx={ex} cy={ey} r="3" fill="#f59e0b" opacity="0.8" />
    </g>
  );
}

// ============================================================
// Blueprint Node Component
// ============================================================
const NODE_ICON: Record<NodeType, React.ReactNode> = {
  task: <Type size={12} />,
  timer: <TimerIcon size={12} />,
  note: <StickyNote size={12} />,
};

function BlueprintNodeCard({
  node,
  isSelected,
  isConnecting,
  onSelect,
  onDragStart,
  onConnectStart,
  onConnectEnd,
  onDelete,
  onToggleTimer,
  onTitleChange,
}: {
  node: BlueprintNode;
  isSelected: boolean;
  isConnecting: boolean;
  onSelect: (id: string) => void;
  onDragStart: (e: React.MouseEvent, id: string) => void;
  onConnectStart: (e: React.MouseEvent, id: string) => void;
  onConnectEnd: (e: React.MouseEvent, id: string) => void;
  onDelete: (id: string) => void;
  onToggleTimer: (id: string) => void;
  onTitleChange: (id: string, title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(node.title);
  const displayTime = useTimerTick(node);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.type === 'task' || node.type === 'note') {
      setEditing(true);
      setEditTitle(node.title);
    }
  };

  const handleSubmit = () => {
    const t = editTitle.trim();
    if (t) onTitleChange(node.id, t);
    setEditing(false);
  };

  return (
    <div
      className={`absolute flex flex-col transition-shadow duration-150 select-none
        ${isSelected ? 'z-50' : 'z-10'}
      `}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
      }}
      onMouseDown={(e) => {
        if (e.button === 0) {
          if (isConnecting) {
            onConnectEnd(e, node.id);
          } else {
            onSelect(node.id);
            onDragStart(e, node.id);
          }
        }
      }}
      onDoubleClick={handleDoubleClick}
    >
      {/* Node body */}
      <div
        className={`
          flex-1 rounded-xl border px-3 py-2 flex items-center gap-2
          ${isSelected
            ? 'ring-2 ring-amber-500/60 border-amber-500/50 shadow-lg shadow-amber-500/10'
            : 'border-zinc-700/60 shadow-lg shadow-black/20'
          }
          ${node.type === 'task'
            ? node.completed
              ? 'bg-zinc-900/80 line-through opacity-50'
              : 'bg-zinc-800/80'
            : node.type === 'timer'
              ? node.timerData?.isRunning
                ? 'bg-amber-500/15 border-amber-500/40'
                : 'bg-zinc-800/80'
              : 'bg-zinc-800/80'
          }
        `}
      >
        {/* Type icon */}
        <div
          className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center"
          style={{ backgroundColor: node.color + '30', color: node.color }}
        >
          {NODE_ICON[node.type]}
        </div>

        {/* Title / Editor */}
        {editing ? (
          <input
            autoFocus
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
              if (e.key === 'Escape') setEditing(false);
            }}
            className="flex-1 min-w-0 bg-transparent text-xs text-zinc-100 outline-none border-b border-zinc-600"
            style={{ width: '100%' }}
          />
        ) : (
          <span className={`flex-1 min-w-0 text-xs truncate ${node.type === 'note' ? 'text-zinc-300 leading-relaxed' : 'text-zinc-100'}`}>
            {node.title}
          </span>
        )}

        {/* Timer display */}
        {node.type === 'timer' && node.timerData && (
          <span className={`text-[10px] font-mono font-bold ${node.timerData.isRunning ? 'text-amber-400' : 'text-zinc-500'}`}>
            {formatTime(displayTime)}
          </span>
        )}

        {/* Timer toggle */}
        {node.type === 'timer' && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleTimer(node.id); }}
            className={`shrink-0 p-1 rounded transition-colors ${node.timerData?.isRunning ? 'text-amber-400 hover:bg-amber-500/20' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700'}`}
          >
            {node.timerData?.isRunning ? <Pause size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" />}
          </button>
        )}
      </div>

      {/* Connection handle (right side) */}
      <div
        className={`
          absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2
          flex items-center justify-center cursor-crosshair transition-all
          ${isConnecting
            ? 'bg-amber-500 border-amber-400 scale-125'
            : 'bg-zinc-800 border-zinc-600 hover:border-amber-500 hover:bg-zinc-700'
          }
        `}
        onMouseDown={(e) => {
          e.stopPropagation();
          onConnectStart(e, node.id);
        }}
        title="Drag to connect"
      >
        <div className={`w-1.5 h-1.5 rounded-full ${isConnecting ? 'bg-white' : 'bg-zinc-500'}`} />
      </div>

      {/* Delete button (hover) */}
      {!editing && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-500 hover:text-red-400 hover:border-red-500/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}

// ============================================================
// Context Menu
// ============================================================
function ContextMenu({
  x,
  y,
  onCreate,
  onClose,
}: {
  x: number;
  y: number;
  onCreate: (type: NodeType) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => document.addEventListener('click', handler), 10);
    return () => document.removeEventListener('click', handler);
  }, [onClose]);

  const items: { type: NodeType; label: string; icon: React.ReactNode; color: string }[] = [
    { type: 'task', label: 'Task Node', icon: <Type size={14} />, color: '#3b82f6' },
    { type: 'timer', label: 'Timer Node', icon: <TimerIcon size={14} />, color: '#f59e0b' },
    { type: 'note', label: 'Note Node', icon: <StickyNote size={14} />, color: '#22c55e' },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl shadow-black/50 py-1.5 min-w-[160px] animate-in fade-in zoom-in-95 duration-150"
      style={{ left: x, top: y }}
    >
      <div className="px-3 py-1 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Add Node</div>
      {items.map((item) => (
        <button
          key={item.type}
          onClick={() => { onCreate(item.type); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ backgroundColor: item.color + '30', color: item.color }}>
            {item.icon}
          </div>
          {item.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// Main Blueprint Canvas
// ============================================================
export default function KanbanPage() {
  const [projects, setProjects] = useState<BlueprintProject[]>([]);
  const [nodes, setNodes] = useState<BlueprintNode[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('proj-inbox');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [showGrid, setShowGrid] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, nodeX: 0, nodeY: 0 });
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [connectLine, setConnectLine] = useState<{ sx: number; sy: number; ex: number; ey: number } | null>(null);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const activeProject = useMemo(
    () => projects.find(p => p.id === activeProjectId),
    [projects, activeProjectId]
  );

  // Load data
  const refresh = useCallback(() => {
    const projs = getProjects();
    setProjects(projs);
    setNodes(getNodes(activeProjectId));
    const proj = projs.find(p => p.id === activeProjectId);
    if (proj) {
      setCamera(proj.camera);
      setShowGrid(proj.showGrid);
    }
  }, [activeProjectId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Timer tick
  useEffect(() => {
    const running = getRunningNode();
    if (!running) return;
    const id = setInterval(() => {
      setNodes(prev => prev.map(n => ({ ...n })));
    }, 1000);
    return () => clearInterval(id);
  }, [nodes]);

  // Window resize
  useEffect(() => {
    const check = () => setIsSmallScreen(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Camera persistence
  useEffect(() => {
    if (!activeProjectId) return;
    updateProjectCamera(activeProjectId, camera);
  }, [camera, activeProjectId]);

  // ── Pan ──────────────────────────────────────────────────
  const handleContainerMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    // Middle mouse or spacebar+leftclick → pan
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - camera.x, y: e.clientY - camera.y });
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isPanning) {
      setCamera(prev => ({
        ...prev,
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      }));
    }
    if (draggingId) {
      const dx = (e.clientX - dragStart.x) / camera.zoom;
      const dy = (e.clientY - dragStart.y) / camera.zoom;
      const newX = snapToGrid(dragStart.nodeX + dx, 20);
      const newY = snapToGrid(dragStart.nodeY + dy, 20);
      setNodes(prev => prev.map(n =>
        n.id === draggingId ? { ...n, x: newX, y: newY } : n
      ));
    }
    if (connectingFrom) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const ex = (e.clientX - rect.left - camera.x) / camera.zoom;
      const ey = (e.clientY - rect.top - camera.y) / camera.zoom;
      const from = nodes.find(n => n.id === connectingFrom);
      if (from) {
        setConnectLine({
          sx: from.x + from.width,
          sy: from.y + from.height / 2,
          ex,
          ey,
        });
      }
    }
  }, [isPanning, panStart, draggingId, dragStart, camera, connectingFrom, nodes]);

  const handleMouseUp = useCallback(() => {
    if (draggingId) {
      const node = nodes.find(n => n.id === draggingId);
      if (node) updateNode(draggingId, { x: node.x, y: node.y });
      setDraggingId(null);
    }
    setIsPanning(false);
  }, [draggingId, nodes]);

  useEffect(() => {
    if (isPanning || draggingId || connectingFrom) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isPanning, draggingId, connectingFrom, handleMouseMove, handleMouseUp]);

  // ── Zoom ─────────────────────────────────────────────────
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const scaleFactor = 0.1;
    const delta = e.deltaY > 0 ? -scaleFactor : scaleFactor;
    const newZoom = Math.max(0.25, Math.min(3, camera.zoom + delta));

    // Zoom towards mouse
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const ratio = newZoom / camera.zoom;
    const newX = mx - (mx - camera.x) * ratio;
    const newY = my - (my - camera.y) * ratio;

    setCamera({ x: newX, y: newY, zoom: newZoom });
  };

  // ── Node drag ────────────────────────────────────────────
  const handleNodeDragStart = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    setSelectedId(id);
    setDraggingId(id);
    setDragStart({ x: e.clientX, y: e.clientY, nodeX: node.x, nodeY: node.y });
  };

  // ── Connection drag ──────────────────────────────────────
  const handleConnectStart = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConnectingFrom(id);
    const node = nodes.find(n => n.id === id);
    if (node) {
      setConnectLine({
        sx: node.x + node.width,
        sy: node.y + node.height / 2,
        ex: node.x + node.width + 100,
        ey: node.y + node.height / 2,
      });
    }
  };

  const handleConnectEnd = (e: React.MouseEvent, targetId: string) => {
    e.stopPropagation();
    if (!connectingFrom || connectingFrom === targetId) {
      setConnectingFrom(null);
      setConnectLine(null);
      return;
    }
    connectNodes(connectingFrom, targetId);
    setConnectingFrom(null);
    setConnectLine(null);
    refresh();
  };

  // ── Context menu ─────────────────────────────────────────
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCreateNodeFromMenu = (type: NodeType) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = snapToGrid((contextMenu!.x - rect.left - camera.x) / camera.zoom, 20);
    const y = snapToGrid((contextMenu!.y - rect.top - camera.y) / camera.zoom, 20);
    createNode(activeProjectId, type, '', x, y);
    refresh();
    setContextMenu(null);
  };

  // ── Double click blank ───────────────────────────────────
  const handleDoubleClickBlank = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = snapToGrid((e.clientX - rect.left - camera.x) / camera.zoom, 20);
    const y = snapToGrid((e.clientY - rect.top - camera.y) / camera.zoom, 20);
    createNode(activeProjectId, 'task', 'New Task', x, y);
    refresh();
  };

  // ── Keyboard ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId && !editingAnywhere()) {
          deleteNode(selectedId);
          setSelectedId(null);
          refresh();
        }
      }
    };
    const editingAnywhere = () => {
      const el = document.activeElement;
      return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA';
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, refresh]);

  // Filter nodes for active project
  const projectNodes = nodes.filter(n => n.projectId === activeProjectId);

  // Build connection lines
  const connections = useMemo(() => {
    const lines: { from: BlueprintNode; to: BlueprintNode }[] = [];
    projectNodes.forEach(from => {
      from.connections.forEach(toId => {
        const to = projectNodes.find(n => n.id === toId);
        if (to) lines.push({ from, to });
      });
    });
    return lines;
  }, [projectNodes]);

  return (
    <div className="flex flex-col h-screen w-full bg-zinc-950 text-zinc-100 select-none overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-2.5 border-b border-zinc-800/60 bg-zinc-900/90 backdrop-blur-xl shrink-0 z-[100]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Grip size={16} className="text-zinc-950" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tighter uppercase italic">Blueprint</h1>
            </div>
          </div>
          <div className="w-px h-5 bg-zinc-800" />
          {/* Project tabs */}
          <div className="flex items-center gap-1">
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => setActiveProjectId(p.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border
                  ${p.id === activeProjectId
                    ? 'bg-zinc-100 text-zinc-900 border-zinc-100'
                    : 'bg-zinc-800/60 text-zinc-400 border-transparent hover:bg-zinc-800'
                  }
                `}
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                {p.name}
              </button>
            ))}
            <button
              onClick={() => { createProject('New Project'); refresh(); }}
              className="p-1.5 rounded-xl text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Grid toggle */}
          <button
            onClick={() => {
              const p = toggleProjectGrid(activeProjectId);
              if (p) setShowGrid(p.showGrid);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border
              ${showGrid
                ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                : 'bg-transparent text-zinc-600 border-transparent hover:text-zinc-400'
              }
            `}
          >
            <Grid3X3 size={14} />
            Grid
          </button>
          {/* Reset view */}
          <button
            onClick={() => setCamera({ x: 0, y: 0, zoom: 1 })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <RotateCcw size={14} />
            Reset
          </button>
          <div className="text-[10px] font-mono text-zinc-600 px-2">
            {Math.round(camera.zoom * 100)}%
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className={`flex-1 relative overflow-hidden ${isPanning ? 'cursor-grabbing' : 'cursor-crosshair'}`}
        onMouseDown={handleContainerMouseDown}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClickBlank}
        onWheel={handleWheel}
      >
        {/* Grid background */}
        {showGrid && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `
                linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
              `,
              backgroundSize: `${20 * camera.zoom}px ${20 * camera.zoom}px`,
              transform: `translate(${camera.x % (20 * camera.zoom)}px, ${camera.y % (20 * camera.zoom)}px)`,
              width: 'calc(100% + 40px)',
              height: 'calc(100% + 40px)',
            }}
          />
        )}

        {/* World transform layer */}
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {/* Connection lines (SVG layer) */}
          <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
            <g>
              {connections.map((c, i) => (
                <ConnectionLine
                  key={i}
                  from={{ x: c.from.x, y: c.from.y, width: c.from.width, height: c.from.height }}
                  to={{ x: c.to.x, y: c.to.y, width: c.to.width, height: c.to.height }}
                />
              ))}
              {connectLine && (
                <path
                  d={`M ${connectLine.sx} ${connectLine.sy} C ${connectLine.sx + 100} ${connectLine.sy}, ${connectLine.ex - 100} ${connectLine.ey}, ${connectLine.ex} ${connectLine.ey}`}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                  opacity="0.6"
                  strokeLinecap="round"
                />
              )}
            </g>
          </svg>

          {/* Nodes */}
          {projectNodes.map(node => (
            <div key={node.id} className="group">
              <BlueprintNodeCard
                node={node}
                isSelected={selectedId === node.id}
                isConnecting={connectingFrom === node.id}
                onSelect={setSelectedId}
                onDragStart={handleNodeDragStart}
                onConnectStart={handleConnectStart}
                onConnectEnd={handleConnectEnd}
                onDelete={(id) => { deleteNode(id); refresh(); }}
                onToggleTimer={(id) => { toggleNodeTimer(id); refresh(); }}
                onTitleChange={(id, title) => { updateNode(id, { title }); refresh(); }}
              />
            </div>
          ))}
        </div>

        {/* Instructions */}
        {projectNodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-zinc-600">
              <div className="text-4xl mb-4 opacity-20">⊹</div>
              <p className="text-sm font-medium">Empty Canvas</p>
              <p className="text-xs mt-1 opacity-60">Right-click or double-click to add nodes</p>
              <p className="text-xs mt-0.5 opacity-60">Drag connection handles to link nodes</p>
            </div>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onCreate={handleCreateNodeFromMenu}
          onClose={() => setContextMenu(null)}
        />
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .animate-in { animation-duration: 0.15s; animation-fill-mode: both; }
        .fade-in { animation-name: fadeIn; }
        .zoom-in-95 { animation-name: zoomIn95; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoomIn95 { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      `}} />
    </div>
  );
}
