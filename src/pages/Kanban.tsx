import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Plus, X, Play, Pause, Trash2, ChevronLeft, ChevronRight,
  MoreHorizontal, Clock, GripVertical, Timer as TimerIcon, Unlink
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  getProjects,
  getBoards,
  getTasks,
  getTimers,
  createProject,
  createBoard,
  createTask,
  updateTask,
  deleteTask,
  deleteBoard,
  moveTask,
  startTimer,
  stopTimer,
  toggleTimer,
  attachTimer,
  detachTimer,
  getDisplayTime,
  type KanbanProject,
  type KanbanBoard,
  type KanbanTask,
  type KanbanTimer,
} from '@/lib/kanban-store';

// ============================================================
// Timer Display Utilities
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

function useDisplayTime(timer: KanbanTimer): number {
  const [display, setDisplay] = useState(() => getDisplayTime(timer));
  useEffect(() => {
    setDisplay(getDisplayTime(timer));
    if (!timer.isRunning) return;
    const id = setInterval(() => setDisplay(getDisplayTime(timer)), 1000);
    return () => clearInterval(id);
  }, [timer.isRunning, timer.totalSeconds, timer.startedAt]);
  return display;
}

// ============================================================
// TimerCard (UE Blueprint Node Style)
// ============================================================
function TimerCard({
  timer,
  onToggle,
  onDetach,
}: {
  timer: KanbanTimer;
  onToggle: (id: string) => void;
  onDetach: (taskId: string) => void;
}) {
  const displayTime = useDisplayTime(timer);
  const isRunning = timer.isRunning;

  return (
    <div
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-lg border shadow-lg transition-all animate-in fade-in zoom-in duration-200
        ${isRunning
          ? 'bg-amber-500/20 border-amber-500/50 shadow-amber-500/10'
          : 'bg-zinc-800 border-zinc-700 shadow-black/20'
        }
      `}
    >
      <div className={`
        flex items-center justify-center w-6 h-6 rounded-full transition-colors
        ${isRunning ? 'bg-amber-500 text-amber-950' : 'bg-zinc-700 text-zinc-400'}
      `}>
        <TimerIcon size={12} className={isRunning ? 'animate-spin-slow' : ''} />
      </div>
      
      <span className={`text-xs font-mono font-bold tracking-tight ${isRunning ? 'text-amber-400' : 'text-zinc-300'}`}>
        {formatTime(displayTime)}
      </span>

      <div className="w-px h-3 bg-zinc-700 mx-1" />

      <div className="flex items-center gap-1">
        <button
          onClick={() => onToggle(timer.id)}
          className={`p-1 rounded-md transition-colors ${isRunning ? 'hover:bg-amber-500/20 text-amber-400' : 'hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200'}`}
        >
          {isRunning ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
        </button>
        <button
          onClick={() => onDetach(timer.taskId)}
          className="p-1 rounded-md hover:bg-red-500/10 text-zinc-600 hover:text-red-400 transition-colors"
          title="Detach timer"
        >
          <Unlink size={12} />
        </button>
      </div>
    </div>
  );
}

// ============================================================
// TaskCard (Simplified)
// ============================================================
function TaskCard({
  task,
  timer,
  onDelete,
  onAttachTimer,
  onToggleTimer,
  onDetachTimer,
  dragHandle,
}: {
  task: KanbanTask;
  timer?: KanbanTimer;
  onDelete: (id: string) => void;
  onAttachTimer: (taskId: string) => void;
  onToggleTimer: (timerId: string) => void;
  onDetachTimer: (taskId: string) => void;
  dragHandle?: React.ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative group flex items-start gap-4 mb-3">
      {/* Main Task Card */}
      <div
        ref={cardRef}
        className={`
          flex-1 min-w-0 rounded-xl border p-3 transition-all select-none
          ${timer?.isRunning
            ? 'bg-zinc-800/80 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.12)]'
            : 'bg-zinc-800/50 border-zinc-700/50 hover:border-zinc-600/70 hover:bg-zinc-800/70'
          }
        `}
      >
        <div className="flex items-start gap-2">
          {dragHandle && <div className="mt-0.5 text-zinc-600 cursor-grab active:cursor-grabbing">{dragHandle}</div>}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-zinc-100 leading-relaxed break-words">{task.title}</p>
          </div>
          <div className="flex items-center gap-1">
            {!task.timerId && (
              <button
                onClick={() => onAttachTimer(task.id)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-500 hover:text-amber-400 hover:bg-zinc-700 transition-all"
                title="Add Timer"
              >
                <Clock size={14} />
              </button>
            )}
            <button
              onClick={() => onDelete(task.id)}
              className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-700 transition-all"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Floating/Attached Timer Card */}
      {timer && (
        <div className="relative flex items-center h-[46px] shrink-0">
          {/* Connection Line */}
          <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-4 h-px bg-gradient-to-r from-zinc-700 to-amber-500/50" />
          <TimerCard 
            timer={timer} 
            onToggle={onToggleTimer} 
            onDetach={onDetachTimer} 
          />
        </div>
      )}
    </div>
  );
}

function SortableTaskCard(props: {
  task: KanbanTask;
  timer?: KanbanTimer;
  onDelete: (id: string) => void;
  onAttachTimer: (taskId: string) => void;
  onToggleTimer: (timerId: string) => void;
  onDetachTimer: (taskId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.task.id, data: { type: 'task' } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    position: isDragging ? ('relative' as const) : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="group">
      <TaskCard
        {...props}
        dragHandle={<GripVertical size={14} {...attributes} {...listeners} />}
      />
    </div>
  );
}

// ============================================================
// Board Column
// ============================================================
function BoardColumn({
  board,
  tasks,
  timers,
  onDeleteTask,
  onAddTask,
  onDeleteBoard,
  onAttachTimer,
  onToggleTimer,
  onDetachTimer,
}: {
  board: KanbanBoard;
  tasks: KanbanTask[];
  timers: KanbanTimer[];
  onDeleteTask: (id: string) => void;
  onAddTask: (boardId: string, title: string) => void;
  onDeleteBoard: (id: string) => void;
  onAttachTimer: (taskId: string) => void;
  onToggleTimer: (timerId: string) => void;
  onDetachTimer: (taskId: string) => void;
}) {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = () => {
    const t = newTaskTitle.trim();
    if (!t) return;
    onAddTask(board.id, t);
    setNewTaskTitle('');
    setIsAdding(false);
  };

  return (
    <div className="flex flex-col h-full min-w-[320px] max-w-[450px] rounded-xl bg-zinc-900/60 border border-zinc-800/60 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.2)]" style={{ backgroundColor: board.color }} />
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{board.name}</h3>
          <span className="text-[10px] font-mono text-zinc-600 bg-zinc-800/80 px-1.5 py-0.5 rounded-full border border-zinc-700/50">{tasks.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsAdding(true)}
            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={() => onDeleteBoard(board.id)}
            className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-3 min-h-0 custom-scrollbar">
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <SortableTaskCard
              key={task.id}
              task={task}
              timer={timers.find(tm => tm.id === task.timerId)}
              onDelete={onDeleteTask}
              onAttachTimer={onAttachTimer}
              onToggleTimer={onToggleTimer}
              onDetachTimer={onDetachTimer}
            />
          ))}
        </SortableContext>

        {/* Quick add */}
        {isAdding ? (
          <div className="mt-1 animate-in slide-in-from-top-2 duration-200">
            <input
              autoFocus
              value={newTaskTitle}
              onChange={e => setNewTaskTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') { setIsAdding(false); setNewTaskTitle(''); }
              }}
              placeholder="What needs to be done?"
              className="w-full px-4 py-2.5 text-sm bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500/20"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleAdd}
                className="flex-1 py-1.5 text-xs font-bold bg-zinc-100 text-zinc-900 rounded-lg hover:bg-white transition-colors"
              >
                Add Node
              </button>
              <button
                onClick={() => { setIsAdding(false); setNewTaskTitle(''); }}
                className="px-4 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="w-full mt-1 py-3 flex items-center justify-center gap-2 text-xs font-medium text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/40 rounded-xl transition-all border border-dashed border-zinc-800/60 hover:border-zinc-700/60"
          >
            <Plus size={14} /> Add Task Node
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Project Selector
// ============================================================
function ProjectSelector({
  projects,
  activeId,
  onSelect,
  onCreate,
}: {
  projects: KanbanProject[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');

  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
      {projects.map(p => (
        <button
          key={p.id}
          onClick={() => onSelect(p.id)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border
            ${p.id === activeId
              ? 'bg-zinc-100 text-zinc-900 border-zinc-100 shadow-lg shadow-white/5'
              : 'bg-zinc-800/60 text-zinc-400 border-transparent hover:bg-zinc-800 hover:text-zinc-200'
            }
          `}
        >
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}
        </button>
      ))}
      {isCreating ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { onCreate(name); setName(''); setIsCreating(false); }
              if (e.key === 'Escape') { setIsCreating(false); setName(''); }
            }}
            placeholder="Project name"
            className="w-32 px-3 py-2 text-xs bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none"
          />
        </div>
      ) : (
        <button
          onClick={() => setIsCreating(true)}
          className="p-2 rounded-xl text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          <Plus size={16} />
        </button>
      )}
    </div>
  );
}

// ============================================================
// Main Kanban Page
// ============================================================
export default function KanbanPage() {
  const [projects, setProjects] = useState<KanbanProject[]>([]);
  const [boards, setBoards] = useState<KanbanBoard[]>([]);
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [timers, setTimers] = useState<KanbanTimer[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('proj-inbox');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [currentBoardIndex, setCurrentBoardIndex] = useState(0);

  // Load data
  const refresh = useCallback(() => {
    setProjects(getProjects());
    setBoards(getBoards(activeProjectId));
    setTasks(getTasks({ projectId: activeProjectId }));
    setTimers(getTimers());
  }, [activeProjectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Window resize → detect small screen
  useEffect(() => {
    const check = () => setIsSmallScreen(window.innerWidth < 1024); // Increased threshold for node layout
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Board index reset when project changes
  useEffect(() => {
    setCurrentBoardIndex(0);
  }, [activeProjectId]);

  // Timer tick for running tasks
  useEffect(() => {
    const hasRunning = timers.some(tm => tm.isRunning);
    if (!hasRunning) return;
    const id = setInterval(() => {
      setTimers(getTimers());
    }, 1000);
    return () => clearInterval(id);
  }, [timers]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const activeTask = tasks.find(t => t.id === active.id);
    const overTask = tasks.find(t => t.id === over.id);
    if (!activeTask || !overTask) return;

    if (activeTask.boardId === overTask.boardId) {
      const boardTasks = tasks.filter(t => t.boardId === activeTask.boardId).sort((a, b) => a.order - b.order);
      const oldIndex = boardTasks.findIndex(t => t.id === active.id);
      const newIndex = boardTasks.findIndex(t => t.id === over.id);
      const reordered = arrayMove(boardTasks, oldIndex, newIndex);
      reordered.forEach((t, i) => updateTask(t.id, { order: i }));
    } else {
      moveTask(activeTask.id, overTask.boardId);
    }
    refresh();
  };

  const handleAttachTimer = (taskId: string) => {
    attachTimer(taskId);
    refresh();
  };

  const handleDetachTimer = (taskId: string) => {
    detachTimer(taskId);
    refresh();
  };

  const handleToggleTimer = (timerId: string) => {
    toggleTimer(timerId);
    refresh();
  };

  const filteredBoards = boards.filter(b => b.projectId === activeProjectId);

  return (
    <div className="flex flex-col h-screen w-full bg-zinc-950 text-zinc-100 select-none overflow-hidden font-sans antialiased">
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-6 py-3 border-b border-zinc-800/60 bg-zinc-900/80 backdrop-blur-xl shrink-0"
        data-drag="true"
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Clock size={18} className="text-zinc-950" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tighter uppercase italic">Blueprint</h1>
              <div className="text-[10px] text-amber-500/80 font-mono font-bold leading-none -mt-0.5">V1.0.NODE</div>
            </div>
          </div>
          <div className="w-px h-6 bg-zinc-800 mx-2" />
          <ProjectSelector
            projects={projects}
            activeId={activeProjectId}
            onSelect={setActiveProjectId}
            onCreate={(name) => { createProject(name); refresh(); }}
          />
        </div>
        <div className="flex items-center gap-3">
          {isSmallScreen && filteredBoards.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/50 rounded-xl border border-zinc-700/50 text-[10px] font-mono font-bold text-zinc-500">
              <button
                onClick={() => setCurrentBoardIndex(i => Math.max(0, i - 1))}
                disabled={currentBoardIndex === 0}
                className="p-1 rounded hover:bg-zinc-700 disabled:opacity-20 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-zinc-300 w-8 text-center">{currentBoardIndex + 1}/{filteredBoards.length}</span>
              <button
                onClick={() => setCurrentBoardIndex(i => Math.min(filteredBoards.length - 1, i + 1))}
                disabled={currentBoardIndex === filteredBoards.length - 1}
                className="p-1 rounded hover:bg-zinc-700 disabled:opacity-20 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
          <button
            onClick={() => { createBoard(activeProjectId, 'New Sector'); refresh(); }}
            className="flex items-center gap-2 px-4 py-2 text-xs font-black bg-zinc-100 text-zinc-900 rounded-xl hover:bg-white transition-all shadow-lg shadow-white/5 active:scale-95"
          >
            <Plus size={14} strokeWidth={3} /> NEW SECTOR
          </button>
        </div>
      </div>

      {/* Boards area */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setActiveId(active.id as string)}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 min-h-0 bg-[radial-gradient(#18181b_1px,transparent_1px)] [background-size:24px_24px]">
          {isSmallScreen ? (
            <div className="h-full flex justify-center">
              {filteredBoards[currentBoardIndex] && (
                <BoardColumn
                  key={filteredBoards[currentBoardIndex].id}
                  board={filteredBoards[currentBoardIndex]}
                  tasks={tasks.filter(t => t.boardId === filteredBoards[currentBoardIndex].id)}
                  timers={timers}
                  onDeleteTask={(id) => { deleteTask(id); refresh(); }}
                  onAddTask={(boardId, title) => {
                    createTask(activeProjectId, boardId, title);
                    refresh();
                  }}
                  onDeleteBoard={(id) => { deleteBoard(id); refresh(); }}
                  onAttachTimer={handleAttachTimer}
                  onToggleTimer={handleToggleTimer}
                  onDetachTimer={handleDetachTimer}
                />
              )}
            </div>
          ) : (
            <div className="flex gap-8 h-full items-start">
              {filteredBoards.map(board => (
                <BoardColumn
                  key={board.id}
                  board={board}
                  tasks={tasks.filter(t => t.boardId === board.id)}
                  timers={timers}
                  onDeleteTask={(id) => { deleteTask(id); refresh(); }}
                  onAddTask={(boardId, title) => {
                    createTask(activeProjectId, boardId, title);
                    refresh();
                  }}
                  onDeleteBoard={(id) => { deleteBoard(id); refresh(); }}
                  onAttachTimer={handleAttachTimer}
                  onToggleTimer={handleToggleTimer}
                  onDetachTimer={handleDetachTimer}
                />
              ))}
            </div>
          )}
        </div>

        <DragOverlay>
          {activeId ? (
            <div className="opacity-80 scale-105">
              <TaskCard
                task={tasks.find(t => t.id === activeId)!}
                timer={timers.find(tm => tm.taskId === activeId)}
                onDelete={() => {}}
                onAttachTimer={() => {}}
                onToggleTimer={() => {}}
                onDetachTimer={() => {}}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
        .animate-spin-slow { animation: spin 8s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
