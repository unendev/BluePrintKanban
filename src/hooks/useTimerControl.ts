/**
 * 通用计时器控制 Hook（简化版）
 * 核心功能：互斥、异步锁、版本冲突检测、乐观更新
 */

import { useState, useCallback } from 'react';
import { getDeviceId } from '@/lib/device-fingerprint';
import { fetchWithRetry } from '@/lib/fetch-utils';

import type { TimerTask } from '@/lib/shared-types';

interface UseTimerControlOptions {
  tasks: TimerTask[];
  onTasksChange: (tasks: TimerTask[]) => void;
  onVersionConflict?: () => void; // 版本冲突回调
  onTasksPaused?: (pausedTasks: Array<{ id: string; name: string }>) => void; // 互斥暂停回调
}

export function useTimerControl(options: UseTimerControlOptions) {
  const { tasks, onTasksChange, onVersionConflict, onTasksPaused } = options;

  // 简化异步锁：单个布尔值，防止重复点击
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * 递归查找任务（支持子任务）
   */
  const findTaskById = useCallback((taskId: string, taskList: TimerTask[] = tasks): TimerTask | null => {
    for (const task of taskList) {
      if (task.id === taskId) return task;
      if (task.children) {
        const found = findTaskById(taskId, task.children);
        if (found) return found;
      }
    }
    return null;
  }, [tasks]);

  /**
   * 递归查找所有运行中的任务（支持子任务）
   */
  const findAllRunningTasks = useCallback((excludeId: string, taskList: TimerTask[] = tasks): TimerTask[] => {
    const running: TimerTask[] = [];
    for (const task of taskList) {
      if (task.id !== excludeId && task.isRunning && !task.isPaused) {
        running.push(task);
      }
      if (task.children) {
        running.push(...findAllRunningTasks(excludeId, task.children));
      }
    }
    return running;
  }, [tasks]);

  /**
   * 递归更新任务状态（支持子任务）
   */
  const updateTasksRecursive = useCallback((
    taskList: TimerTask[],
    updater: (task: TimerTask) => TimerTask
  ): TimerTask[] => {
    return taskList.map(task => {
      const updated = updater(task);
      if (task.children) {
        return { ...updated, children: updateTasksRecursive(task.children, updater) };
      }
      return updated;
    });
  }, []);

  /**
   * 启动计时器返回结果类型
   */
  type StartTimerResult =
    | { success: true }
    | { success: false; reason: 'version_conflict'; conflictTaskName?: string }
    | { success: false; reason: 'not_found' }
    | { success: false; reason: 'processing' }
    | { success: false; reason: 'error'; error: unknown };

  /**
   * 启动计时器
   */
  const startTimer = useCallback(async (taskId: string): Promise<StartTimerResult> => {
    if (isProcessing) {
      return { success: false, reason: 'processing' };
    }

    const targetTask = findTaskById(taskId);
    if (!targetTask) {
      return { success: false, reason: 'not_found' };
    }

    const runningTasks = findAllRunningTasks(taskId);
    setIsProcessing(true);

    const versionMap = new Map<string, number>();
    tasks.forEach(task => {
      if (task.version !== undefined) {
        versionMap.set(task.id, task.version);
      }
    });

    try {
      const currentTime = Math.floor(Date.now() / 1000);
      const nowISO = new Date().toISOString(); // 用于本地排序刷新

      const runningTaskIds = new Set(runningTasks.map(t => t.id));
      const updatedTasks = updateTasksRecursive(tasks, (task) => {
        if (runningTaskIds.has(task.id)) {
          const runningTime = task.startTime ? currentTime - task.startTime : 0;
          return {
            ...task,
            isRunning: false,
            isPaused: true,
            elapsedTime: task.elapsedTime + runningTime,
            startTime: null,
            pausedTime: 0,
            updatedAt: nowISO // 关键：更新时间戳，确保排序靠前
          };
        }
        if (task.id === taskId) {
          return {
            ...task,
            isRunning: true,
            isPaused: false,
            startTime: currentTime,
            pausedTime: 0,
            updatedAt: nowISO
          };
        }
        return task;
      });
      onTasksChange(updatedTasks);

      let currentTasks = updatedTasks;
      const deviceId = getDeviceId();

      if (runningTasks.length > 0) {
        for (const runningTask of runningTasks) {
          const runningTime = runningTask.startTime ? currentTime - runningTask.startTime : 0;
          console.log('🛑 [useTimerControl] Auto-pausing running active task:', {
            name: runningTask.name,
            startTime: runningTask.startTime,
            currentTime,
            runningTime,
            newElapsed: runningTask.elapsedTime + runningTime
          });
          const currentVersion = versionMap.get(runningTask.id) ?? runningTask.version;

          const pauseResponse = await fetchWithRetry('/api/timer-tasks', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: runningTask.id,
              version: currentVersion,
              deviceId,
              elapsedTime: runningTask.elapsedTime + runningTime,
              isPaused: true,
              isRunning: false,
              startTime: null,
              pausedTime: 0
            })
          });

          if (pauseResponse.status === 409) {
            setIsProcessing(false);
            return {
              success: false,
              reason: 'version_conflict',
              conflictTaskName: runningTask.name
            };
          }

          const updatedPausedTask = await pauseResponse.json();
          versionMap.set(runningTask.id, updatedPausedTask.version);

          currentTasks = updateTasksRecursive(currentTasks, (task) => {
            if (task.id === runningTask.id) {
              return {
                ...task,
                version: updatedPausedTask.version,
                elapsedTime: updatedPausedTask.elapsedTime,
                isPaused: true,
                isRunning: false,
                startTime: null,
                pausedTime: 0,
                updatedAt: updatedPausedTask.updatedAt || nowISO // 使用服务器返回的最新时间
              };
            }
            return task;
          });
        }
        onTasksPaused?.(runningTasks.map(t => ({ id: t.id, name: t.name })));
      }

      const targetVersion = versionMap.get(taskId) ?? targetTask.version;

      const startResponse = await fetchWithRetry('/api/timer-tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          version: targetVersion,
          deviceId,
          isRunning: true,
          isPaused: false,
          startTime: currentTime,
          pausedTime: 0
        })
      });

      if (startResponse.status === 409) {
        setIsProcessing(false);
        return {
          success: false,
          reason: 'version_conflict',
          conflictTaskName: targetTask.name
        };
      }

      const updatedTask = await startResponse.json();
      const finalTasks = updateTasksRecursive(currentTasks, (task) => {
        if (task.id === taskId) {
          return {
            ...task,
            version: updatedTask.version,
            isRunning: true,
            startTime: currentTime,
            isPaused: false,
            pausedTime: 0,
            updatedAt: updatedTask.updatedAt || nowISO
          };
        }
        return task;
      });
      onTasksChange(finalTasks);
      return { success: true };

    } catch (error) {
      setIsProcessing(false);
      return { success: false, reason: 'error', error };
    } finally {
      setIsProcessing(false);
    }
  }, [tasks, onTasksChange, onTasksPaused, isProcessing, findTaskById, findAllRunningTasks, updateTasksRecursive]);

  /**
   * 暂停计时器
   */
  const pauseTimer = useCallback(async (taskId: string) => {
    if (isProcessing) return;

    const targetTask = findTaskById(taskId);
    if (!targetTask || !targetTask.isRunning) return;

    setIsProcessing(true);

    try {
      const currentTime = Math.floor(Date.now() / 1000);
      const nowISO = new Date().toISOString();
      const runningTime = targetTask.startTime ? currentTime - targetTask.startTime : 0;

      console.log('⏸️ [useTimerControl] Pausing Task:', {
        name: targetTask.name,
        startTime: targetTask.startTime,
        currentTime,
        runningTime,
        prevElapsed: targetTask.elapsedTime,
        newElapsed: targetTask.elapsedTime + runningTime
      });

      const newElapsedTime = targetTask.elapsedTime + runningTime;
      const deviceId = getDeviceId();

      const updatedTasks = updateTasksRecursive(tasks, (task) =>
        task.id === taskId
          ? { ...task, elapsedTime: newElapsedTime, isPaused: true, isRunning: false, startTime: null, pausedTime: 0, updatedAt: nowISO }
          : task
      );
      onTasksChange(updatedTasks);

      const response = await fetchWithRetry('/api/timer-tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          version: targetTask.version,
          deviceId,
          elapsedTime: newElapsedTime,
          isPaused: true,
          isRunning: false,
          startTime: null,
          pausedTime: 0
        })
      });

      if (response.status === 409) {
        onVersionConflict?.();
        return;
      }

      if (response.ok) {
        const updatedTask = await response.json();

        // 【防回溯保护】
        // 如果服务器返回的时间居然比我们本地算的还小（比如网络延迟导致），
        // 强制保留我们本地更准确的时间，防止“时光倒流”
        const finalElapsedTime = Math.max(updatedTask.elapsedTime, newElapsedTime);

        const finalTasks = updateTasksRecursive(updatedTasks, (task) =>
          task.id === taskId
            ? { ...task, version: updatedTask.version, elapsedTime: finalElapsedTime, updatedAt: updatedTask.updatedAt || nowISO }
            : task
        );
        onTasksChange(finalTasks);
      }

    } catch (error) {
      console.error('暂停计时器失败:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [tasks, onTasksChange, onVersionConflict, isProcessing, findTaskById, updateTasksRecursive]);

  /**
   * 停止计时器
   */
  const stopTimer = useCallback(async (taskId: string) => {
    if (isProcessing) return;

    const targetTask = findTaskById(taskId);
    if (!targetTask || !targetTask.isRunning) return;

    setIsProcessing(true);

    try {
      const currentTime = Math.floor(Date.now() / 1000);
      const nowISO = new Date().toISOString();
      const runningTime = targetTask.startTime ? currentTime - targetTask.startTime : 0;
      const newElapsedTime = targetTask.elapsedTime + runningTime;
      const deviceId = getDeviceId();

      const updatedTasks = updateTasksRecursive(tasks, (task) =>
        task.id === taskId
          ? { ...task, elapsedTime: newElapsedTime, isRunning: false, isPaused: false, startTime: null, pausedTime: 0, completedAt: currentTime, updatedAt: nowISO }
          : task
      );
      onTasksChange(updatedTasks);

      const response = await fetchWithRetry('/api/timer-tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          version: targetTask.version,
          deviceId,
          elapsedTime: newElapsedTime,
          isRunning: false,
          isPaused: false,
          startTime: null,
          pausedTime: 0,
          completedAt: currentTime
        })
      });

      if (response.status === 409) {
        onVersionConflict?.();
        return;
      }

      if (response.ok) {
        const updatedTask = await response.json();
        const finalTasks = updateTasksRecursive(updatedTasks, (task) =>
          task.id === taskId
            ? { ...task, version: updatedTask.version, updatedAt: updatedTask.updatedAt || nowISO }
            : task
        );
        onTasksChange(finalTasks);
      }

    } catch (error) {
      console.error('停止计时器失败:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [tasks, onTasksChange, onVersionConflict, isProcessing, findTaskById, updateTasksRecursive]);

  return {
    startTimer,
    pauseTimer,
    stopTimer,
    isProcessing
  };
}
