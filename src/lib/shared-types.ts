/**
 * Shared types and utilities previously imported from @dashboard/shared
 */

export interface TimerTask {
  id: string;
  name: string;
  running: boolean;
  elapsedTime: number;
  startTime?: number;
  categoryPath?: string;
  tags?: string[];
  children?: TimerTask[];
  version?: number;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  isPaused?: boolean;
}

/**
 * Format seconds into HH:MM:SS or MM:SS display string
 */
export function formatTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(String(hours).padStart(2, '0'));
  }
  parts.push(String(minutes).padStart(2, '0'));
  parts.push(String(seconds).padStart(2, '0'));

  return parts.join(':');
}

/**
 * Parse a time input string (e.g. "1h30m", "90", "1:30") into total seconds
 */
export function parseTimeInput(input: string): number | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  // Try "1h30m" or "1h 30m" format
  const hmMatch = trimmed.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m?)?$/i);
  if (hmMatch) {
    const hours = parseInt(hmMatch[1] || '0', 10);
    const minutes = parseInt(hmMatch[2] || '0', 10);
    if (!isNaN(hours) && !isNaN(minutes)) {
      return hours * 3600 + minutes * 60;
    }
  }

  // Try "HH:MM:SS" or "MM:SS" format
  const timeMatch = trimmed.match(/^(?:(\d+):)?(\d+):(\d+)$/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1] || '0', 10);
    const minutes = parseInt(timeMatch[2], 10);
    const seconds = parseInt(timeMatch[3], 10);
    if (!isNaN(hours) && !isNaN(minutes) && !isNaN(seconds)) {
      return hours * 3600 + minutes * 60 + seconds;
    }
  }

  // Try plain number as minutes
  const num = parseInt(trimmed, 10);
  if (!isNaN(num)) {
    return num * 60;
  }

  return undefined;
}
