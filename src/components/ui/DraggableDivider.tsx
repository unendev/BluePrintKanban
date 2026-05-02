import React from 'react';

interface DraggableDividerProps {
    onMouseDown: (e: React.MouseEvent) => void;
    isDragging: boolean;
}

export function DraggableDivider({ onMouseDown, isDragging }: DraggableDividerProps) {
    return (
        <div 
            className={`h-1 cursor-row-resize flex-shrink-0 z-50 transition-colors ${
                isDragging ? 'bg-emerald-500' : 'bg-zinc-700 hover:bg-emerald-500'
            }`}
            onMouseDown={onMouseDown}
        />
    );
}
