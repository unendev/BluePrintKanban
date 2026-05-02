import React, { useRef, useState, useEffect } from 'react';
import { Plus, X, GripVertical } from 'lucide-react';
import { MarkdownView } from '@/components/shared/MarkdownView';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface EnvVariable {
    id: string;
    key: string;
    value: string;
}

interface SortableVariableItemProps {
    variable: EnvVariable;
    onUpdate: (id: string, field: 'key' | 'value', val: string) => void;
    onRemove: (id: string) => void;
}

function SortableVariableItem({ variable, onUpdate, onRemove }: SortableVariableItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: variable.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="flex items-center gap-2 group"
        >
            {/* KEY */}
            <div className="relative shrink-0 w-1/3 min-w-[100px]">
                <span className="absolute left-2 top-1.5 text-zinc-600 text-[10px] font-mono select-none">$</span>
                <input
                    value={variable.key}
                    onChange={(e) => onUpdate(variable.id, 'key', e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-zinc-800 rounded px-2 pl-5 py-1 text-xs font-mono text-purple-400 focus:border-zinc-600 focus:outline-none transition-colors uppercase placeholder-zinc-700"
                    placeholder="KEY"
                    spellCheck={false}
                />
            </div>

            {/* EQUALS */}
            <span
                {...attributes}
                {...listeners}
                className="text-zinc-600 hover:text-zinc-400 font-mono text-xs cursor-grab active:cursor-grabbing select-none px-1"
                title="Drag to reorder"
            >
                =
            </span>

            {/* VALUE */}
            <div className="flex-1 relative">
                <input
                    value={variable.value}
                    onChange={(e) => onUpdate(variable.id, 'value', e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 focus:border-zinc-600 focus:outline-none transition-colors placeholder-zinc-700"
                    placeholder="Value..."
                />
            </div>

            {/* DELETE */}
            <button
                onClick={() => onRemove(variable.id)}
                className="p-1 text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete"
            >
                <X size={12} />
            </button>
        </div>
    );
}

interface MemoBoardProps {
    storageKeyPrefix?: string;
    title?: string;
    showVariables?: boolean;
    showHeader?: boolean;
}

export function MemoBoard({ storageKeyPrefix = 'manifesto-global', title, showVariables = true, showHeader = true }: MemoBoardProps) {
    // --- State: Data ---
    const [variables, setVariables] = useState<EnvVariable[]>([]);
    const [logContent, setLogContent] = useState('');

    // --- State: UI ---
    const [isHeaderExpanded, setIsHeaderExpanded] = useState(true);
    const [viewMode, setViewMode] = useState<'edit' | 'preview'>('preview');

    // --- Undo / Redo (for this special console textarea) ---
    type TextSnapshot = {
        value: string;
        selectionStart: number;
        selectionEnd: number;
    };

    const undoStackRef = useRef<TextSnapshot[]>([]);
    const redoStackRef = useRef<TextSnapshot[]>([]);

    const pushUndoSnapshot = (textarea: HTMLTextAreaElement) => {
        undoStackRef.current.push({
            value: textarea.value,
            selectionStart: textarea.selectionStart ?? 0,
            selectionEnd: textarea.selectionEnd ?? 0,
        });
        // Any new edit invalidates redo history
        redoStackRef.current = [];

        // Guardrail: avoid unbounded memory
        if (undoStackRef.current.length > 200) {
            undoStackRef.current = undoStackRef.current.slice(-200);
        }
    };

    const restoreSnapshot = (snapshot: TextSnapshot, textarea: HTMLTextAreaElement) => {
        saveLog(snapshot.value);
        requestAnimationFrame(() => {
            const start = Math.max(0, Math.min(snapshot.selectionStart, snapshot.value.length));
            const end = Math.max(0, Math.min(snapshot.selectionEnd, snapshot.value.length));
            textarea.setSelectionRange(start, end);
        });
    };

    const defaultVariables: EnvVariable[] = [
        { id: '1', key: 'CURRENT_MISSION', value: 'Defining the Objective...' },
        { id: '2', key: 'STATUS', value: 'PLANNING' },
    ];

    // --- Initialization ---
    useEffect(() => {
        // Variables
        const savedVars = localStorage.getItem(`${storageKeyPrefix}-vars`);
        if (savedVars) {
            try {
                setVariables(JSON.parse(savedVars));
            } catch (e) {
                setVariables(defaultVariables);
            }
        } else {
            // Only load defaults if global
            if (storageKeyPrefix === 'manifesto-global') {
                setVariables(defaultVariables);
            } else {
                setVariables([]);
            }
        }

        // Log
        const savedLog = localStorage.getItem(`${storageKeyPrefix}-log`);
        if (savedLog) setLogContent(savedLog);
    }, [storageKeyPrefix]);

    // --- Persistence Wrappers ---
    const saveVariables = (newVars: EnvVariable[]) => {
        setVariables(newVars);
        localStorage.setItem(`${storageKeyPrefix}-vars`, JSON.stringify(newVars));
    };

    const saveLog = (val: string) => {
        setLogContent(val);
        localStorage.setItem(`${storageKeyPrefix}-log`, val);
    };

    // --- Handlers ---
    const addVariable = () => {
        const newVar = { id: Date.now().toString(), key: 'NEW_KEY', value: '' };
        saveVariables([...variables, newVar]);
    };

    const removeVariable = (id: string) => {
        saveVariables(variables.filter(v => v.id !== id));
    };

    const updateVariable = (id: string, field: 'key' | 'value', val: string) => {
        const newVars = variables.map(v =>
            v.id === id ? { ...v, [field]: val } : v
        );
        saveVariables(newVars);
    };

    // --- Drag and Drop ---
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = variables.findIndex((v) => v.id === active.id);
            const newIndex = variables.findIndex((v) => v.id === over.id);
            const newVars = arrayMove(variables, oldIndex, newIndex);
            saveVariables(newVars);
        }
    };

    return (
        <div className="flex flex-col h-full w-full bg-zinc-900 text-zinc-300 font-sans overflow-hidden">
            {/* --- HEADER --- */}
            {(showHeader || showVariables) && (
                <div className={`flex-none flex flex-col ${showHeader ? 'border-b border-zinc-800 bg-[#1a1a1a]' : ''}`}>
                    {showHeader && (
                        <div className="h-8 flex items-center justify-between px-3 select-none">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 tracking-widest uppercase">
                                <span>{title || "CONSOLE :: CONFIG"}</span>
                            </div>

                            <div className="flex items-center gap-1">
                                {showVariables && (
                                    <button
                                        onClick={() => setIsHeaderExpanded(!isHeaderExpanded)}
                                        className="w-6 h-6 rounded flex items-center justify-center text-zinc-600 hover:text-zinc-300 transition-colors"
                                        title={isHeaderExpanded ? "Collapse" : "Expand"}
                                    >
                                        <span className="text-[10px] transform transition-transform duration-200" style={{ transform: isHeaderExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                                            ▴
                                        </span>
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {showVariables && (showHeader ? isHeaderExpanded : true) && (
                        <div className={`p-3 space-y-2 overflow-y-auto max-h-[40vh] custom-scrollbar bg-[#161616] ${showHeader ? 'border-t border-zinc-800' : 'border-b border-zinc-800'}`}>
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleDragEnd}
                            >
                                <SortableContext
                                    items={variables.map(v => v.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    {variables.map((v) => (
                                        <SortableVariableItem
                                            key={v.id}
                                            variable={v}
                                            onUpdate={updateVariable}
                                            onRemove={removeVariable}
                                        />
                                    ))}
                                </SortableContext>
                            </DndContext>

                            {/* Add Button */}
                            <button
                                onClick={addVariable}
                                className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors mt-2"
                            >
                                <Plus size={10} />
                                <span>Add Variable</span>
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* --- BODY: LOG / CONTENT --- */}
            <main
                className="flex-1 flex flex-col min-h-0 relative overflow-hidden"
                onMouseEnter={() => setViewMode('edit')}
                onMouseLeave={() => setViewMode('preview')}
            >
                {viewMode === 'edit' ? (
                    <textarea
                        value={logContent}
                        onChange={(e) => saveLog(e.target.value)}
                        onBlur={() => setViewMode('preview')}
                        onKeyDown={(e) => {
                            const isCtrlLike = e.ctrlKey || e.metaKey;
                            if (isCtrlLike) {
                                const textarea = e.currentTarget;
                                const start = textarea.selectionStart;
                                const value = textarea.value;
                                const lines = value.split('\n');
                                const getLineIndexAt = (pos: number) => value.substring(0, pos).split('\n').length - 1;
                                const currentLineIndex = getLineIndexAt(start);

                                // Ctrl+Z: undo (only when we have our own history; otherwise let browser handle native undo)
                                if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
                                    if (undoStackRef.current.length > 0) {
                                        e.preventDefault();
                                        const snapshot = undoStackRef.current.pop()!;
                                        // Save current state for redo
                                        redoStackRef.current.push({
                                            value: textarea.value,
                                            selectionStart: textarea.selectionStart ?? 0,
                                            selectionEnd: textarea.selectionEnd ?? 0,
                                        });
                                        restoreSnapshot(snapshot, textarea);
                                    }
                                    return;
                                }

                                // Ctrl+Shift+Z / Ctrl+Y: redo
                                if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') {
                                    if (redoStackRef.current.length > 0) {
                                        e.preventDefault();
                                        const snapshot = redoStackRef.current.pop()!;
                                        // Save current state for undo
                                        undoStackRef.current.push({
                                            value: textarea.value,
                                            selectionStart: textarea.selectionStart ?? 0,
                                            selectionEnd: textarea.selectionEnd ?? 0,
                                        });
                                        restoreSnapshot(snapshot, textarea);
                                    }
                                    return;
                                }
 
                                if (e.key === 'd') {
                                    pushUndoSnapshot(textarea);
                                    e.preventDefault();
                                    const newLines = [...lines];
                                    newLines.splice(currentLineIndex, 1);
                                    const newValue = newLines.join('\n');
                                    saveLog(newValue);
                                    requestAnimationFrame(() => {
                                        const pos = newLines.slice(0, currentLineIndex).reduce((acc, line) => acc + line.length + 1, 0);
                                        textarea.setSelectionRange(pos, pos);
                                    });
                                } else if (e.key === 'ArrowUp') {
                                    pushUndoSnapshot(textarea);
                                    e.preventDefault();
                                    if (currentLineIndex > 0) {
                                        const newLines = [...lines];
                                        const temp = newLines[currentLineIndex];
                                        newLines[currentLineIndex] = newLines[currentLineIndex - 1];
                                        newLines[currentLineIndex - 1] = temp;
                                        const newValue = newLines.join('\n');
                                        saveLog(newValue);
                                        requestAnimationFrame(() => {
                                            const newIndex = currentLineIndex - 1;
                                            const lineStart = newLines.slice(0, newIndex).reduce((acc, line) => acc + line.length + 1, 0);
                                            const lineStartBefore = lines.slice(0, currentLineIndex).reduce((acc, line) => acc + line.length + 1, 0);
                                            const col = start - lineStartBefore;
                                            const newPos = lineStart + Math.min(col, newLines[newIndex].length);
                                            textarea.setSelectionRange(newPos, newPos);
                                        });
                                    }
                                } else if (e.key === 'ArrowDown') {
                                    pushUndoSnapshot(textarea);
                                    e.preventDefault();
                                    if (currentLineIndex < lines.length - 1) {
                                        const newLines = [...lines];
                                        const temp = newLines[currentLineIndex];
                                        newLines[currentLineIndex] = newLines[currentLineIndex + 1];
                                        newLines[currentLineIndex + 1] = temp;
                                        const newValue = newLines.join('\n');
                                        saveLog(newValue);
                                        requestAnimationFrame(() => {
                                            const newIndex = currentLineIndex + 1;
                                            const lineStart = newLines.slice(0, newIndex).reduce((acc, line) => acc + line.length + 1, 0);
                                            const lineStartBefore = lines.slice(0, currentLineIndex).reduce((acc, line) => acc + line.length + 1, 0);
                                            const col = start - lineStartBefore;
                                            const newPos = lineStart + Math.min(col, newLines[newIndex].length);
                                            textarea.setSelectionRange(newPos, newPos);
                                        });
                                    }
                                }
                            }
                        }}
                        autoFocus
                        className="flex-1 w-full h-full bg-transparent resize-none border-none outline-none p-4 text-sm leading-relaxed text-zinc-300 placeholder-zinc-700 custom-scrollbar font-mono"
                        placeholder="// Runtime logs..."
                        spellCheck={false}
                    />
                ) : (
                    <div
                        className="flex-1 w-full h-full p-4 overflow-y-auto custom-scrollbar cursor-text"
                        onClick={() => setViewMode('edit')}
                    >
                        <MarkdownView
                            content={logContent || '*System Standby.*'}
                            variant="goc"
                            className="prose-sm max-w-none"
                        />
                    </div>
                )}

                {/* Footer Info */}
                <div className="h-6 flex items-center justify-between px-4 bg-zinc-900 border-t border-zinc-800 text-[10px] text-zinc-600 select-none">
                    <div className="flex items-center gap-2">
                        <span>{logContent.length} chars</span>
                        <span className="text-zinc-700">|</span>
                        <span>{viewMode === 'edit' ? 'EDITABLE' : 'READONLY'}</span>
                    </div>
                    <span className="uppercase tracking-widest opacity-50">
                        {storageKeyPrefix === 'manifesto-global' ? 'Global Console' : storageKeyPrefix.replace('task-memo-', 'Task: ')}
                    </span>
                </div>
            </main>

            <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #555; }
      `}</style>
        </div>
    );
}
