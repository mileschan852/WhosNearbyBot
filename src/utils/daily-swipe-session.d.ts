export interface DailySwipeProgress {
  dateKey: string;
  seenIds: string[];
  completed: boolean;
}

export function getDailySwipeDateKey(date?: Date): string;
export function createDailySwipeProgress(
  dateKey: string,
  seenIds?: string[],
  completed?: boolean,
): DailySwipeProgress;
export function loadDailySwipeProgress(
  storage: Storage | null,
  accountId: string | null,
  dateKey: string,
): DailySwipeProgress;
export function saveDailySwipeProgress(
  storage: Storage | null,
  accountId: string | null,
  progress: DailySwipeProgress,
): boolean;
