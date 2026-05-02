import { useState, useEffect, useMemo } from 'react';
import Fuse from 'fuse.js';
import type { Prompt, PromptCategory } from '@/lib/types/prompt';

const STORAGE_KEY = 'widget-prompts-library-v1';
const CATEGORY_KEY = 'widget-prompts-library-selected-category';

export function usePromptLibrary() {
    const [prompts, setPrompts] = useState<Prompt[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    // 初始化：从 LocalStorage 加载
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                setPrompts(Array.isArray(parsed) ? parsed : []);
            } catch (e) {
                console.error('Failed to parse prompts:', e);
                setPrompts([]);
            }
        }

        const storedCategory = localStorage.getItem(CATEGORY_KEY);
        if (storedCategory) {
            setSelectedCategory(storedCategory);
        }
    }, []);

    useEffect(() => {
        if (selectedCategory) {
            localStorage.setItem(CATEGORY_KEY, selectedCategory);
        } else {
            localStorage.removeItem(CATEGORY_KEY);
        }
    }, [selectedCategory]);

    // 持久化：保存到 LocalStorage
    const savePrompts = (newPrompts: Prompt[]) => {
        setPrompts(newPrompts);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newPrompts));
    };

    // 创建提示词
    const createPrompt = (data: Omit<Prompt, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>) => {
        const newPrompt: Prompt = {
            ...data,
            id: `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            usageCount: 0
        };
        savePrompts([...prompts, newPrompt]);
        return newPrompt;
    };

    // 更新提示词
    const updatePrompt = (id: string, updates: Partial<Prompt>) => {
        savePrompts(
            prompts.map(p =>
                p.id === id
                    ? { ...p, ...updates, updatedAt: Date.now() }
                    : p
            )
        );
    };

    // 删除提示词
    const deletePrompt = (id: string) => {
        savePrompts(prompts.filter(p => p.id !== id));
    };

    // 增加使用次数
    const incrementUsage = (id: string) => {
        savePrompts(
            prompts.map(p =>
                p.id === id
                    ? { ...p, usageCount: p.usageCount + 1, updatedAt: Date.now() }
                    : p
            )
        );
    };

    // 搜索（使用 Fuse.js 模糊搜索）
    const fuse = useMemo(() => {
        return new Fuse(prompts, {
            keys: [
                { name: 'title', weight: 0.5 },
                { name: 'content', weight: 0.3 },
                { name: 'category', weight: 0.1 },
                { name: 'tags', weight: 0.1 }
            ],
            threshold: 0.3,
            minMatchCharLength: 2,
            includeScore: true
        });
    }, [prompts]);

    const searchResults = useMemo(() => {
        let results = prompts;

        // 搜索过滤
        if (searchQuery.trim()) {
            const fuseResults = fuse.search(searchQuery);
            results = fuseResults.map(r => r.item);
        }

        // 分类过滤
        if (selectedCategory) {
            results = results.filter(p => p.category.startsWith(selectedCategory));
        }

        return results;
    }, [prompts, searchQuery, selectedCategory, fuse]);

    // 构建分类树
    const categories = useMemo(() => {
        const categoryMap = new Map<string, number>();

        prompts.forEach(prompt => {
            const parts = prompt.category.split('/');
            let currentPath = '';

            parts.forEach(part => {
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                categoryMap.set(currentPath, (categoryMap.get(currentPath) || 0) + 1);
            });
        });

        const buildTree = (parentPath: string = ''): PromptCategory[] => {
            const children: PromptCategory[] = [];

            categoryMap.forEach((count, path) => {
                const parts = path.split('/');
                const expectedParent = parts.slice(0, -1).join('/');

                if (expectedParent === parentPath) {
                    children.push({
                        name: parts[parts.length - 1],
                        path,
                        count,
                        children: buildTree(path)
                    });
                }
            });

            return children.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
        };

        return buildTree();
    }, [prompts]);

    // 导出数据
    const exportPrompts = () => {
        const dataStr = JSON.stringify(prompts, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `prompts-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    // 导入数据
    const importPrompts = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target?.result as string);
                if (Array.isArray(imported)) {
                    // 合并导入，避免 ID 冲突
                    const existingIds = new Set(prompts.map(p => p.id));
                    const newPrompts = imported.filter(p => !existingIds.has(p.id));
                    savePrompts([...prompts, ...newPrompts]);
                }
            } catch (error) {
                console.error('Failed to import prompts:', error);
                alert('导入失败：文件格式错误');
            }
        };
        reader.readAsText(file);
    };

    return {
        prompts: searchResults,
        allPrompts: prompts,
        categories,
        searchQuery,
        setSearchQuery,
        selectedCategory,
        setSelectedCategory,
        createPrompt,
        updatePrompt,
        deletePrompt,
        incrementUsage,
        exportPrompts,
        importPrompts
    };
}
