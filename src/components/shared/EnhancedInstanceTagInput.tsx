import React, { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { InstanceTagCache, InstanceTag } from '@/lib/instance-tag-cache'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { Clock, Sparkles, Tags, Plus, Tag, ChevronRight, Loader2, Trash2, X } from 'lucide-react'
import { getApiUrl } from '@/lib/api'
import { cn } from '@/lib/utils'

interface EnhancedInstanceTagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  userId?: string
  placeholder?: string
  maxTags?: number
  className?: string
}

export function EnhancedInstanceTagInput({
  tags,
  onChange,
  userId = 'user-1',
  placeholder = '输入事务项...',
  maxTags = 10,
  className = ''
}: EnhancedInstanceTagInputProps) {
  const [open, _setOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [availableTags, setAvailableTags] = useState<InstanceTag[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [recentTags, setRecentTags] = useState<string[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [deletedHistoryTags, setDeletedHistoryTags] = useState<string[]>([])

  // 包装 setOpen 以便记录日志
  const setOpen = (val: boolean) => {
    console.log(`[TagInput] setOpen calling with: ${val}`);
    _setOpen(val);
  }

  // 1. 初始化逻辑：本地优先
  useEffect(() => {
    const initData = () => {
      const recent = localStorage.getItem('recentInstanceTags')
      if (recent) {
        try {
          const parsed = JSON.parse(recent)
          setRecentTags(Array.isArray(parsed) ? parsed.slice(0, 10) : [])
        } catch (e) { }
      }

      const cachedData = InstanceTagCache.loadFromStorage()
      if (cachedData && cachedData.length > 0) {
        setAvailableTags(cachedData)
      }

      const blackList = localStorage.getItem('deleted_history_tags')
      if (blackList) {
        try {
          setDeletedHistoryTags(JSON.parse(blackList));
        } catch (e) { }
      }
    }
    initData()
  }, [])

  // 2. 同步逻辑：后台静默拉取
  useEffect(() => {
    const syncData = async () => {
      if (availableTags.length === 0) setIsLoading(true);
      try {
        const [predefinedTags, usedTagsResponse] = await Promise.all([
          InstanceTagCache.fetchFromServer(userId).catch(() => []),
          fetch(getApiUrl(`/api/timer-tasks/instance-tags?userId=${userId}`), { credentials: 'include' })
            .then(res => res.ok ? res.json() : { instanceTags: [] })
            .catch(() => ({ instanceTags: [] }))
        ])

        const safePredefinedTags = Array.isArray(predefinedTags) ? predefinedTags : []

        // 关键逻辑：分拆旧有的逗号分隔脏数据
        const rawHistoryTags: string[] = usedTagsResponse.instanceTags || [];
        const splitHistoryTags: string[] = [];

        rawHistoryTags.forEach(tagStr => {
          if (tagStr.includes(',')) {
            // 如果包含逗号，分拆并清理
            const parts = tagStr.split(',').map(p => p.trim()).filter(p => p.length > 0);
            splitHistoryTags.push(...parts);
          } else {
            splitHistoryTags.push(tagStr.trim());
          }
        });

        // 转换为 InstanceTag 对象并进行初步去重
        const historyTags = Array.from(new Set(splitHistoryTags)).map((tagName: string) => ({
          id: `used-${tagName}`,
          name: tagName.startsWith('#') ? tagName : `#${tagName}`,
          userId: userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }))

        // 全局合并并去重
        const allTagsMap: Record<string, InstanceTag> = {};
        safePredefinedTags.forEach(tag => allTagsMap[tag.name] = tag);
        historyTags.forEach((tag: InstanceTag) => {
          if (!allTagsMap[tag.name]) allTagsMap[tag.name] = tag;
        });

        const mergedTags = Object.values(allTagsMap);
        if (JSON.stringify(mergedTags) !== JSON.stringify(availableTags)) {
          setAvailableTags(mergedTags);
          // InstanceTagCache.updateInstanceTags(mergedTags); // REMOVED: Do not pollute cache with history tags
        }
      } catch (error) {
        console.error('[TagInput] Sync failed:', error)
      } finally {
        setIsLoading(false)
      }
    }
    syncData()
  }, [userId])

  // 过滤逻辑
  const searchPart = inputValue.toLowerCase().replace(/^#/, '').trim();

  const filteredRecent = recentTags.filter(tag => {
    const isNotSelected = !tags.includes(tag);
    const isNotDeleted = !deletedHistoryTags.includes(tag);
    const normalizedTagName = tag.toLowerCase().replace(/^#/, '');
    if (!searchPart) return isNotSelected && isNotDeleted;
    return isNotSelected && isNotDeleted && normalizedTagName.includes(searchPart);
  });

  const filteredAvailable = availableTags.filter(tag => {
    const isNotSelected = !tags.includes(tag.name);
    const isNotDeleted = !deletedHistoryTags.includes(tag.name);
    const normalizedTagName = tag.name.toLowerCase().replace(/^#/, '');
    const notInRecent = !filteredRecent.includes(tag.name);
    if (!searchPart) return isNotSelected && isNotDeleted && notInRecent;
    return isNotSelected && isNotDeleted && notInRecent && normalizedTagName.includes(searchPart);
  });

  const totalSuggestions = filteredRecent.length + filteredAvailable.length;

  const deleteTag = async (id: string, name: string) => {
    if (!window.confirm(`确定要移除事务项 "${name.replace(/^#/, '')}" 吗？`)) return;

    console.log('[TagInput] Deleting tag:', id, name);

    if (id.startsWith('used-')) {
      // 对于历史标签，本地拉黑
      const newBlacklist = [...deletedHistoryTags, name];
      setDeletedHistoryTags(newBlacklist);
      localStorage.setItem('deleted_history_tags', JSON.stringify(newBlacklist));
      setAvailableTags(prev => prev.filter(t => t.name !== name));
    } else {
      // 对于正式标签，调用 API
      try {
        const response = await fetch(getApiUrl(`/api/instance-tags/${id}`), {
          method: 'DELETE',
          credentials: 'include'
        });
        if (response.ok) {
          setAvailableTags(prev => prev.filter(t => t.id !== id));
          InstanceTagCache.removeInstanceTag(id);
        }
      } catch (error) {
        console.error('[TagInput] Delete API failed:', error);
      }
    }

    // 统一清理最近使用
    const updatedRecent = recentTags.filter(t => t !== name);
    if (updatedRecent.length !== recentTags.length) {
      setRecentTags(updatedRecent);
      localStorage.setItem('recentInstanceTags', JSON.stringify(updatedRecent));
    }
  }

  const createTag = async (tagName: string) => {
    const formattedTag = tagName.startsWith('#') ? tagName : `#${tagName}`
    setIsCreating(true)
    try {
      const response = await fetch(getApiUrl('/api/instance-tags'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formattedTag, userId })
      })
      if (response.ok) {
        const newTag = await response.json()
        setAvailableTags(prev => [...prev, newTag])
        InstanceTagCache.addInstanceTag(newTag)
        return formattedTag
      }
    } catch (error) { } finally {
      setIsCreating(false)
    }
    return null
  }

  const addTag = async (tagName: string) => {
    if (!tagName || tags.includes(tagName) || tags.length >= maxTags) return

    let finalTag = tagName
    const existing = availableTags.find(t => t.name === tagName || t.name === `#${tagName}` || t.name.replace(/^#/, '') === tagName.replace(/^#/, ''))

    if (!existing) {
      const created = await createTag(tagName)
      if (!created) return
      finalTag = created
    } else {
      finalTag = existing.name
    }

    const recent = JSON.parse(localStorage.getItem('recentInstanceTags') || '[]')
    const updated = [finalTag, ...recent.filter((t: string) => t !== finalTag)].slice(0, 10)
    localStorage.setItem('recentInstanceTags', JSON.stringify(updated))
    setRecentTags(updated.slice(0, 5))

    onChange([...tags, finalTag])
    setInputValue('')
    setOpen(false)
    setSelectedIndex(0)
  }

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter(t => t !== tagToRemove))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % (totalSuggestions || 1));
      if (!open) setOpen(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + totalSuggestions) % (totalSuggestions || 1));
      if (!open) setOpen(true);
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (open && totalSuggestions > 0) {
        if (selectedIndex < filteredRecent.length) {
          addTag(filteredRecent[selectedIndex]);
        } else {
          addTag(filteredAvailable[selectedIndex - filteredRecent.length].name);
        }
      } else if (inputValue.trim()) {
        addTag(inputValue.trim());
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-tight">事务项 (可选)</label>
        {isLoading && <Loader2 className="h-3 w-3 animate-spin text-zinc-500" />}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-md border border-emerald-500/30 transition-all hover:bg-emerald-500/30">
              {tag.replace(/^#/, '')}
              <button onClick={() => removeTag(tag)} className="hover:text-red-400 ml-1">×</button>
            </span>
          ))}
        </div>
      )}

      <Popover open={open} onOpenChange={(val) => setOpen(val)}>
        <PopoverAnchor asChild>
          <div className={cn(
            "relative flex items-center w-full bg-zinc-800/50 border border-zinc-700 rounded-lg overflow-hidden transition-all group cursor-text",
            open && "border-emerald-500 ring-2 ring-emerald-500/20 bg-zinc-800"
          )}>
            <input
              type="text"
              className="flex-1 bg-transparent px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
              placeholder={tags.length >= maxTags ? "已达到上限" : placeholder}
              value={inputValue}
              onChange={e => {
                setInputValue(e.target.value);
                setSelectedIndex(0);
                if (!open) setOpen(true);
              }}
              onFocus={(e) => { e.stopPropagation(); setOpen(true); }}
              onClick={(e) => { e.stopPropagation(); if (!open) setOpen(true); }}
              onMouseDown={(e) => { e.stopPropagation(); }}
              onKeyDown={handleKeyDown}
              disabled={tags.length >= maxTags}
            />
            <div className="px-3 flex items-center text-zinc-600 group-hover:text-zinc-400 transition-colors">
              <Tag size={16} />
            </div>
          </div>
        </PopoverAnchor>
        <PopoverContent
          className="w-[var(--radix-popover-anchor-width)] p-0 bg-zinc-900 border-zinc-800 shadow-2xl z-[1002]"
          align="start"
          sideOffset={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command className="bg-transparent" shouldFilter={false}>
            <div className="hidden">
              <CommandInput value={inputValue} onValueChange={setInputValue} />
            </div>
            <CommandList className="max-h-[280px] overflow-y-auto custom-scrollbar">

              {filteredRecent.length > 0 && (
                <CommandGroup heading={
                  <div className="flex items-center gap-1.5 py-1">
                    <Clock className="h-3 w-3 text-zinc-500" />
                    <span className="text-[10px] uppercase tracking-wider font-bold">最近使用</span>
                  </div>
                }>
                  {filteredRecent.map((tag, index) => (
                    <CommandItem
                      key={`recent-${tag}`}
                      value={tag}
                      onSelect={() => addTag(tag)}
                      className={cn(
                        "cursor-pointer py-2 px-2 flex items-center justify-between transition-colors",
                        selectedIndex === index ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-300 hover:bg-zinc-800"
                      )}
                    >
                      <div className="flex items-center flex-1">
                        <Tag className={cn("mr-2 h-3 w-3", selectedIndex === index ? "text-emerald-400" : "text-zinc-500")} />
                        <span className="text-sm">{tag.replace(/^#/, '')}</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteTag(`recent-${tag}`, tag); }}
                        className="p-1 rounded-md text-zinc-600 hover:text-red-400 transition-colors ml-2"
                        title="从历史中移除"
                      >
                        <X size={14} />
                      </button>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {filteredRecent.length > 0 && filteredAvailable.length > 0 && <CommandSeparator className="bg-zinc-800" />}

              {filteredAvailable.length > 0 && (
                <CommandGroup heading={
                  <div className="flex items-center gap-1.5 py-1">
                    <Sparkles className="h-3 w-3 text-zinc-500" />
                    <span className="text-[10px] uppercase tracking-wider font-bold">匹配项</span>
                  </div>
                }>
                  {filteredAvailable.map((tag, index) => {
                    const globalIndex = index + filteredRecent.length;
                    return (
                      <CommandItem
                        key={tag.id}
                        value={tag.name}
                        onSelect={() => addTag(tag.name)}
                        className={cn(
                          "cursor-pointer py-2 px-2 flex items-center justify-between transition-colors",
                          selectedIndex === globalIndex ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-300 hover:bg-zinc-800"
                        )}
                      >
                        <div className="flex items-center flex-1">
                          <ChevronRight className={cn("mr-2 h-3 w-3", selectedIndex === globalIndex ? "text-emerald-400" : "text-zinc-600")} />
                          <Tag className={cn("mr-2 h-3 w-3", selectedIndex === globalIndex ? "text-emerald-400" : "text-zinc-500")} />
                          <span className="text-sm">{tag.name.replace(/^#/, '')}</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteTag(tag.id, tag.name); }}
                          className="p-1 rounded-md text-zinc-600 hover:text-red-400 transition-colors ml-2"
                          title="移除此标签"
                        >
                          <Trash2 size={14} />
                        </button>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}

              {inputValue.trim() && (
                <div className="p-2">
                  <Button variant="ghost" size="sm" className="w-full text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 justify-start h-9 px-2" onClick={() => addTag(inputValue)}>
                    <Plus className="mr-2 h-4 w-4" />
                    <span className="text-sm">创建并添加 "{inputValue}"</span>
                  </Button>
                </div>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {tags.length >= maxTags && (
        <p className="text-[10px] text-orange-400">已达到标签上限</p>
      )}
    </div>
  )
}
