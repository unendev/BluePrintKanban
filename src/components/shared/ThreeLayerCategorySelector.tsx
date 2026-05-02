import React, { useState, useEffect } from 'react'
import { ChevronDown, Plus, Trash2, Check, Search, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CategoryCache, CategoryNode } from '@/lib/category-cache'
import { cn } from '@/lib/utils';
import { getApiUrl } from '@/lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface ThreeLayerCategorySelectorProps {
  value: string
  onChange: (path: string) => void
  className?: string
}

export function ThreeLayerCategorySelector({
  value,
  onChange,
  className = ''
}: ThreeLayerCategorySelectorProps) {
  // 三轴客观分类为固定字典：不允许在表单里新增/删除分类
  const ENABLE_CATEGORY_EDITING = false;

  const [allCategories, setAllCategories] = useState<CategoryNode[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [selectedTop, setSelectedTop] = useState('')
  const [selectedMid, setSelectedMid] = useState('')
  const [selectedSub, setSelectedSub] = useState('')

  const [showAddDialog, setShowAddDialog] = useState<false | 'top' | 'mid' | 'sub'>(false)
  const [newCatName, setNewCatName] = useState('')

  useEffect(() => {
    const loadCategories = async () => {
      const cached = CategoryCache.getCached()
      if (cached.length > 0) {
        setAllCategories(cached)
        setIsLoading(false)
      } else {
        setIsLoading(true)
      }
      try {
        const freshData = await CategoryCache.preload()
        setAllCategories(freshData)
      } catch (error) {
        console.error('加载分类失败:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadCategories()
  }, [])

  useEffect(() => {
    if (value && allCategories.length > 0) {
      const parts = value.split('/')
      setSelectedTop(parts[0] || '')
      setSelectedMid(parts[1] || '')
      setSelectedSub(parts[2] || '')
    }
  }, [value, allCategories])

  const topCategories = (allCategories || []).map(cat => ({ name: cat.name, id: cat.id }))

  const getMidCategories = () => {
    const topCat = allCategories.find(cat => cat.name === selectedTop)
    return topCat?.children?.map(cat => ({ name: cat.name, id: cat.id })) || []
  }

  const getSubCategories = () => {
    const topCat = allCategories.find(cat => cat.name === selectedTop)
    const midCat = topCat?.children?.find(cat => cat.name === selectedMid)
    return midCat?.children?.map(cat => ({ name: cat.name, id: cat.id })) || []
  }

  const midCategories = getMidCategories()
  const subCategories = getSubCategories()

  const buildPath = (top: string, mid: string, sub?: string) => {
    if (sub) return `${top}/${mid}/${sub}`
    return `${top}/${mid}`
  }

  const handleTopSelect = (top: string) => {
    setSelectedTop(top)
    setSelectedMid('')
    setSelectedSub('')
    onChange(top)
  }

  const handleMidSelect = (mid: string) => {
    setSelectedMid(mid)
    setSelectedSub('')
    onChange(buildPath(selectedTop, mid))
  }

  const handleSubSelect = (sub: string) => {
    setSelectedSub(sub)
    onChange(buildPath(selectedTop, selectedMid, sub))
  }

  const handleAdd = async () => {
    if (!ENABLE_CATEGORY_EDITING) return;
    if (!newCatName.trim() || !showAddDialog) return

    let payload: any = { type: showAddDialog, name: newCatName.trim() }
    if (showAddDialog === 'mid') payload.parentPath = selectedTop
    if (showAddDialog === 'sub') payload.parentPath = `${selectedTop}/${selectedMid}`

    try {
      const response = await fetch(getApiUrl('/api/log-categories'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('创建失败');
      const freshData = await CategoryCache.preload({ forceRefresh: true });
      setAllCategories(freshData);
      setNewCatName('');
      setShowAddDialog(false);
    } catch (error: any) {
      alert(error.message);
    }
  }

  if (isLoading) {
    return <div className="text-sm text-zinc-500 animate-pulse">加载分类中...</div>
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid grid-cols-3 gap-4">
        {/* Column 1: Top Level */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-tight">顶层分类</span>
            {ENABLE_CATEGORY_EDITING && (
              <button onClick={() => setShowAddDialog('top')} className="text-[10px] text-zinc-600 hover:text-emerald-500 flex items-center">
                <Plus size={10} className="mr-0.5" /> 新增
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
            {topCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => handleTopSelect(cat.name)}
                className={cn(
                  "px-3 py-2 text-xs font-medium rounded-md text-left transition-all",
                  selectedTop === cat.name
                    ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-zinc-800/50 text-zinc-400 border border-transparent hover:bg-zinc-800"
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Column 2: Mid Level */}
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <ChevronRight size={10} className="text-zinc-700" />
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-tight">中层分类</span>
          </div>
          {selectedTop ? (
            <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
              {midCategories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => handleMidSelect(cat.name)}
                  className={cn(
                    "px-3 py-2 text-xs font-medium rounded-md text-left transition-all",
                    selectedMid === cat.name
                      ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-zinc-800/50 text-zinc-400 border border-transparent hover:bg-zinc-800"
                  )}
                >
                  {cat.name}
                </button>
              ))}
              {ENABLE_CATEGORY_EDITING && (
                <button onClick={() => setShowAddDialog('mid')} className="p-2 text-[10px] text-zinc-600 hover:text-emerald-500 flex items-center justify-center border border-dashed border-zinc-800 rounded-md">
                  <Plus size={10} className="mr-1" /> 添加
                </button>
              )}
            </div>
          ) : (
            <div className="text-[10px] text-zinc-700 italic py-4">请先选择顶层分类</div>
          )}
        </div>

        {/* Column 3: Sub Level */}
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <ChevronRight size={10} className="text-zinc-700" />
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-tight">底层分类</span>
          </div>
          {selectedMid ? (
            <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
              {subCategories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => handleSubSelect(cat.name)}
                  className={cn(
                    "px-3 py-2 text-xs font-medium rounded-md text-left transition-all",
                    selectedSub === cat.name
                      ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-zinc-800/50 text-zinc-400 border border-transparent hover:bg-zinc-800"
                  )}
                >
                  {cat.name}
                </button>
              ))}
              {ENABLE_CATEGORY_EDITING && (
                <button onClick={() => setShowAddDialog('sub')} className="p-2 text-[10px] text-zinc-600 hover:text-emerald-500 flex items-center justify-center border border-dashed border-zinc-800 rounded-md">
                  <Plus size={10} className="mr-1" /> 添加
                </button>
              )}
            </div>
          ) : (
            <div className="text-[10px] text-zinc-700 italic py-4">请选择中层分类</div>
          )}
        </div>
      </div>

      {ENABLE_CATEGORY_EDITING && (
        <Dialog open={!!showAddDialog} onOpenChange={(o) => !o && setShowAddDialog(false)}>
          <DialogContent className="bg-zinc-900 border-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-sm">添加新分类 ({showAddDialog})</DialogTitle>
            </DialogHeader>
            <div className="flex gap-2">
              <Input
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="输入分类名称..."
                className="bg-zinc-800 border-zinc-700"
              />
              <Button onClick={handleAdd} className="bg-emerald-600 hover:bg-emerald-500">添加</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
