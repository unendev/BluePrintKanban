import React, { useMemo, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import useSWR from 'swr';
import { fetcher, getApiUrl } from '@/lib/api';
import type { TimerTask } from '@/lib/shared-types';
import ReactECharts from 'echarts-for-react';

type ChartMode = 'task' | 'tag' | 'category';
type RangePreset = '1d' | '3d' | '7d' | '30d' | 'custom';
type ChartVariant = 'dialog' | 'window';

interface TaskChartDialogProps {
  mode: ChartMode;
  filterValue: string;
  title: string;
  userId?: string | null;
  onClose: () => void;
  variant?: ChartVariant;
  allowCustomize?: boolean;
}

export default function TaskChartDialog({
  mode,
  filterValue,
  title,
  userId,
  onClose,
  variant = 'dialog',
  allowCustomize = false
}: TaskChartDialogProps) {
  const [activeMode, setActiveMode] = useState<ChartMode>(mode);
  const [activeValue, setActiveValue] = useState<string>(filterValue);
  const [activeTitle, setActiveTitle] = useState<string>(title);
  const [rangePreset, setRangePreset] = useState<RangePreset>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const { startDate, endDate } = useMemo(() => {
    const today = new Date();
    const end = new Date(today);
    const format = (d: Date) => d.toISOString().split('T')[0];

    if (rangePreset === 'custom' && customStart && customEnd) {
      return { startDate: customStart, endDate: customEnd };
    }

    const days = rangePreset === '1d' ? 1 : rangePreset === '3d' ? 3 : rangePreset === '7d' ? 7 : 30;
    const start = new Date(today);
    start.setDate(start.getDate() - (days - 1));
    return { startDate: format(start), endDate: format(end) };
  }, [rangePreset, customStart, customEnd]);

  const apiUserId = userId || 'user-1';

  const { data: tasks = [], isLoading } = useSWR<TimerTask[]>(
    `/api/timer-tasks?userId=${apiUserId}&startDate=${startDate}&endDate=${endDate}`,
    fetcher
  );

  const allTasks = useMemo(() => {
    const flatten = (taskList: TimerTask[]): TimerTask[] => {
      const result: TimerTask[] = [];
      for (const task of taskList) {
        result.push(task);
        if (task.children && task.children.length > 0) {
          result.push(...flatten(task.children));
        }
      }
      return result;
    };
    return flatten(tasks);
  }, [tasks]);

  const tagOptions = useMemo(() => {
    const tags = new Set<string>();
    allTasks.forEach(t => {
      if (t.instanceTag) tags.add(t.instanceTag);
      if (Array.isArray(t.instanceTagNames)) {
        t.instanceTagNames.forEach(name => name && tags.add(name));
      }
      if (Array.isArray(t.instanceTags)) {
        t.instanceTags.forEach((it: any) => {
          const name = it?.instanceTag?.name || it?.name;
          if (name) tags.add(name);
        });
      }
    });
    return Array.from(tags).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [allTasks]);

  const categoryOptions = useMemo(() => {
    const cats = new Set<string>();
    allTasks.forEach(t => {
      if (t.categoryPath) {
        cats.add(t.categoryPath);
      }
    });
    return Array.from(cats).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [allTasks]);

  const taskOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; name: string }[] = [];
    allTasks.forEach(t => {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        list.push({ id: t.id, name: t.name });
      }
    });
    return list.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  }, [allTasks]);

  const resolveTaskId = useCallback((input: string) => {
    if (!input) return '';
    const exactId = taskOptions.find(t => t.id === input);
    if (exactId) return exactId.id;
    const exactName = taskOptions.find(t => t.name === input);
    if (exactName) return exactName.id;
    const includesName = taskOptions.find(t => t.name.includes(input));
    return includesName ? includesName.id : input;
  }, [taskOptions]);

  const resolveTaskTitle = useCallback((input: string) => {
    if (!input) return '';
    const byId = taskOptions.find(t => t.id === input);
    if (byId) return byId.name;
    const byName = taskOptions.find(t => t.name === input);
    if (byName) return byName.name;
    const includesName = taskOptions.find(t => t.name.includes(input));
    return includesName ? includesName.name : input;
  }, [taskOptions]);

  const allDateRange = useMemo(() => {
    if (allTasks.length === 0) {
      const today = new Date().toISOString().split('T')[0];
      return { start: today, end: today };
    }
    let min = '9999-12-31';
    let max = '0000-01-01';
    allTasks.forEach(t => {
      const date = t.date || t.createdAt.split('T')[0];
      if (date < min) min = date;
      if (date > max) max = date;
    });
    return { start: min, end: max };
  }, [allTasks]);

  // 聚合数据：按日期统计该任务的时长
  const chartData = useMemo(() => {
    if (!tasks.length) return { dates: [], durations: [] };

    const flattenTasks = (taskList: TimerTask[]): TimerTask[] => {
      const result: TimerTask[] = [];
      for (const task of taskList) {
        result.push(task);
        if (task.children && task.children.length > 0) {
          result.push(...flattenTasks(task.children));
        }
      }
      return result;
    };

    // 找到目标任务及其所有子任务
    const findTaskAndChildren = (id: string, taskList: TimerTask[]): TimerTask[] => {
      const result: TimerTask[] = [];
      for (const task of taskList) {
        if (task.id === id) {
          result.push(task);
          if (task.children) {
            result.push(...task.children);
          }
        }
        if (task.children) {
          result.push(...findTaskAndChildren(id, task.children));
        }
      }
      return result;
    };

    const getTagNames = (task: TimerTask): string[] => {
      const names: string[] = [];
      if (task.instanceTag) names.push(task.instanceTag);
      if (Array.isArray(task.instanceTagNames)) names.push(...task.instanceTagNames);
      if (Array.isArray(task.instanceTags)) {
        task.instanceTags.forEach((t: any) => {
          const name = t?.instanceTag?.name || t?.name;
          if (name) names.push(name);
        });
      }
      return Array.from(new Set(names.filter(Boolean)));
    };

    let relatedTasks: TimerTask[] = [];
    if (activeMode === 'task') {
      const resolvedId = resolveTaskId(activeValue);
      relatedTasks = findTaskAndChildren(resolvedId, tasks);
    } else if (activeMode === 'tag') {
      relatedTasks = allTasks.filter(t => getTagNames(t).includes(activeValue));
    } else if (activeMode === 'category') {
      relatedTasks = allTasks.filter(t => (t.categoryPath || '').startsWith(activeValue));
    }
    
    // 按日期聚合时长
    const dateMap = new Map<string, number>();
    
    for (const task of relatedTasks) {
      const date = task.date || task.createdAt.split('T')[0];
      const duration = task.elapsedTime || 0;
      dateMap.set(date, (dateMap.get(date) || 0) + duration);
    }

    // 生成完整的日期范围（填充空白日期）
    const dates: string[] = [];
    const durations: number[] = [];
    
    for (let d = new Date(startDate); d <= new Date(endDate); d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      dates.push(dateStr);
      durations.push(dateMap.get(dateStr) || 0);
    }

    return { dates, durations };
  }, [tasks, activeMode, activeValue, startDate, endDate, resolveTaskId]);

  // 计算总时长
  const totalDuration = useMemo(() => {
    return chartData.durations.reduce((sum, d) => sum + d, 0);
  }, [chartData]);

  // ECharts 配置
  const chartOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      borderColor: '#52525b',
      textStyle: { color: '#e4e4e7' },
      formatter: (params: any) => {
        const value = params[0].value;
        const hours = Math.floor(value / 3600);
        const minutes = Math.floor((value % 3600) / 60);
        return `${params[0].name}<br/>${hours}h ${minutes}m`;
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '10%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: chartData.dates.map(d => d.slice(5)), // 只显示 MM-DD
      axisLine: { lineStyle: { color: '#52525b' } },
      axisLabel: { 
        color: '#a1a1aa',
        fontSize: 10,
        interval: 4 // 每隔 4 天显示一个标签
      }
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#52525b' } },
      axisLabel: { 
        color: '#a1a1aa',
        fontSize: 10,
        formatter: (value: number) => {
          const hours = Math.floor(value / 3600);
          return `${hours}h`;
        }
      },
      splitLine: { lineStyle: { color: '#27272a' } }
    },
    series: [{
      name: '时长',
      type: 'line',
      smooth: true,
      data: chartData.durations,
      lineStyle: { color: '#10b981', width: 2 },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(16, 185, 129, 0.3)' },
            { offset: 1, color: 'rgba(16, 185, 129, 0.05)' }
          ]
        }
      },
      itemStyle: { color: '#10b981' }
    }]
  }), [chartData]);

  const formatTotalTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const rangeDays = useMemo(() => {
    if (rangePreset === 'custom' && customStart && customEnd) {
      const start = new Date(customStart);
      const end = new Date(customEnd);
      const diff = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
      return Math.max(diff, 1);
    }
    return rangePreset === '1d' ? 1 : rangePreset === '3d' ? 3 : rangePreset === '7d' ? 7 : 30;
  }, [rangePreset, customStart, customEnd]);

  const isWindow = variant === 'window';

  const modeLabel = activeMode === 'task' ? '任务' : activeMode === 'tag' ? '标签' : '分类';

  return (
    <div
      className={isWindow ? "w-full h-full bg-zinc-900 text-zinc-100" : "fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"}
      onClick={isWindow ? undefined : onClose}
    >
      <div
        className={isWindow ? "w-full h-full bg-zinc-900 flex flex-col" : "bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-2xl shadow-2xl"}
        onClick={isWindow ? undefined : (e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800" data-drag={isWindow ? "true" : "false"}>
          <div data-drag={isWindow ? "true" : "false"}>
            <h3 className="text-lg font-bold text-white">{activeTitle}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              {modeLabel} 时间统计
            </p>
          </div>
          <div className="flex items-center gap-2" data-drag="false">
            <select
              value={rangePreset}
              onChange={(e) => {
                const next = e.target.value as RangePreset;
                setRangePreset(next);
                if (next === 'custom') {
                  setCustomStart(allDateRange.start);
                  setCustomEnd(allDateRange.end);
                }
              }}
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded px-2 py-1 focus:outline-none focus:border-zinc-500"
            >
              <option value="1d">近 1 天</option>
              <option value="3d">近 3 天</option>
              <option value="7d">近 7 天</option>
              <option value="30d">近 30 天</option>
              <option value="custom">自定义</option>
            </select>
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                onFocus={() => {
                  if (rangePreset !== 'custom') {
                    setRangePreset('custom');
                    setCustomStart(allDateRange.start);
                    setCustomEnd(allDateRange.end);
                  }
                }}
                className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded px-2 py-1 focus:outline-none focus:border-zinc-500"
                data-drag="false"
              />
              <span className="text-zinc-600 text-xs">-</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                onFocus={() => {
                  if (rangePreset !== 'custom') {
                    setRangePreset('custom');
                    setCustomStart(allDateRange.start);
                    setCustomEnd(allDateRange.end);
                  }
                }}
                className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded px-2 py-1 focus:outline-none focus:border-zinc-500"
                data-drag="false"
              />
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            data-drag="false"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className={isWindow ? "flex-1 overflow-y-auto p-4" : "p-4"}>
          {allowCustomize && (
            <div className="mb-4 p-3 rounded-lg border border-zinc-800 bg-zinc-900/60 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-16 text-xs text-zinc-500">统计对象</span>
                <select
                  value={activeMode}
                  onChange={(e) => {
                    const nextMode = e.target.value as ChartMode;
                    setActiveMode(nextMode);
                    setActiveValue('');
                    setActiveTitle(nextMode === 'tag' ? '#标签' : nextMode === 'category' ? '分类' : '任务');
                  }}
                  className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded px-2 py-1 focus:outline-none focus:border-zinc-500"
                >
                  <option value="category">分类</option>
                  <option value="tag">标签</option>
                  <option value="task">任务</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-16 text-xs text-zinc-500">对象值</span>
                {activeMode === 'task' ? (
                  <>
                    <input
                      value={activeValue}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        setActiveValue(nextValue);
                        setActiveTitle(resolveTaskTitle(nextValue) || '任务');
                      }}
                      list="task-options"
                      className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded px-2 py-1 focus:outline-none focus:border-zinc-500"
                      placeholder="输入任务名称（支持模糊）"
                    />
                    <datalist id="task-options">
                      {taskOptions.map(task => (
                        <option key={task.id} value={task.name} />
                      ))}
                    </datalist>
                  </>
                ) : (
                  <select
                    value={activeValue}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setActiveValue(nextValue);
                      if (activeMode === 'tag') setActiveTitle(`#${nextValue}`);
                      else if (activeMode === 'category') setActiveTitle(nextValue);
                    }}
                    className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded px-2 py-1 focus:outline-none focus:border-zinc-500"
                  >
                    <option value="">请选择</option>
                    {activeMode === 'category' && categoryOptions.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    {activeMode === 'tag' && tagOptions.map(tag => (
                      <option key={tag} value={tag}>{tag}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}
          {isLoading ? (
            <div className="h-64 flex items-center justify-center text-zinc-500">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin"></div>
                <span className="text-sm">加载中...</span>
              </div>
            </div>
          ) : !activeValue ? (
            <div className="h-64 flex flex-col items-center justify-center text-zinc-500">
              <p className="text-sm">缺少统计对象</p>
              <p className="text-xs text-zinc-600 mt-1">请先设置统计对象</p>
            </div>
          ) : chartData.durations.every(d => d === 0) ? (
            <div className="h-64 flex flex-col items-center justify-center text-zinc-500">
              <p className="text-sm">暂无数据</p>
              <p className="text-xs text-zinc-600 mt-1">当前范围内无记录</p>
            </div>
          ) : (
            <>
              {/* 统计卡片 */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/50">
                  <p className="text-xs text-zinc-500 mb-1">总时长</p>
                  <p className="text-lg font-bold text-emerald-400">{formatTotalTime(totalDuration)}</p>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/50">
                  <p className="text-xs text-zinc-500 mb-1">活跃天数</p>
                  <p className="text-lg font-bold text-blue-400">
                    {chartData.durations.filter(d => d > 0).length} 天
                  </p>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/50">
                  <p className="text-xs text-zinc-500 mb-1">日均时长</p>
                  <p className="text-lg font-bold text-purple-400">
                    {formatTotalTime(Math.floor(totalDuration / rangeDays))}
                  </p>
                </div>
              </div>

              {/* 图表 */}
              <div className="bg-zinc-800/30 rounded-lg p-3 border border-zinc-700/30">
                {/* @ts-ignore - ECharts-for-React type incompatibility in some environments */}
                <ReactECharts
                  option={chartOption}
                  style={{ height: '280px' }}
                  opts={{ renderer: 'canvas' }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
