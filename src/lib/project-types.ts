export interface TodoItem {
    id: string;
    text: string;
    completed: boolean;
    createdAt: string;
    group?: string;
    order?: number;
    children?: TodoItem[];
}

export interface Project {
    id: string;
    name: string;
    description: string;
    status: 'active' | 'completed' | 'archived';
    createdAt: number;
    updatedAt: number;
    progressLogs: { id: string; text: string; createdAt: number }[];
    todos: TodoItem[];
    memo?: string; // Scratchpad
    group?: string;
    order?: number;
    groupOrder?: string[]; // Order of todo groups
}

export const STORAGE_KEY_PROJECTS = 'projects-v1';
export const STORAGE_KEY_LEGACY_TODOS = 'todo-items-v1';
