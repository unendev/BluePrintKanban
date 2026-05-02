export interface Prompt {
    id: string;
    title: string;
    content: string;
    category: string;  // 分类路径，如 "AI助手/代码生成/Python"
    tags: string[];
    createdAt: number;
    updatedAt: number;
    usageCount: number;
}

export interface PromptCategory {
    name: string;
    path: string;
    count: number;
    children?: PromptCategory[];
}
