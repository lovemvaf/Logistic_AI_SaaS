// Ambient declaration so `tsc --noEmit` succeeds without adding `expo-task-manager`
// to the frozen workspace lockfile; install `expo-task-manager` before native EAS builds.
declare module 'expo-task-manager' {
  export interface TaskManagerTaskBody<T = any> {
    data?: T;
    error?: { code?: string | number; message: string } | null;
    executionInfo?: { eventId?: string; taskName?: string };
  }

  export function defineTask<T = any>(
    taskName: string,
    taskExecutor: (body: TaskManagerTaskBody<T>) => void | Promise<void>,
  ): void;
}
