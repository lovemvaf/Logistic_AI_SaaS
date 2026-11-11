export enum SyncStatus {
  PENDING = 'PENDING',
  SYNCING = 'SYNCING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  DEAD_LETTER = 'DEAD_LETTER',
}

export interface SyncAction {
  id: string;
  sequence?: number;
  table: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: any;
  status: SyncStatus;
  retryCount: number;
  nextAttemptAt?: number;
  lastError?: string;
  createdAt: number;
}

export interface SyncResult {
  success: boolean;
  syncedCount: number;
  failedCount: number;
  errors: string[];
}

export interface SyncConfig {
  serverUrl: string;
  token: string;
  batchSize?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  onSyncComplete?: (result: SyncResult) => void;
  onError?: (error: string) => void;
}

const DEFAULT_CONFIG: Partial<SyncConfig> = {
  batchSize: 50,
  maxRetries: 5,
  retryDelayMs: 5000,
};

const STORAGE_KEY = 'offline_sync_queue';
const DELTA_KEY = 'offline_sync_delta';
const MAX_RETRY_COUNT = 5;
let monotonicSequence = 0;

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  monotonicSequence += 1;
  const tsHex = Date.now().toString(16).padStart(12, '0');
  const seqHex = monotonicSequence.toString(16).padStart(8, '0');
  return `${tsHex.slice(0, 8)}-${tsHex.slice(8, 12)}-4000-8000-${seqHex}0000`;
}

function loadFromStorage<T>(key: string): T[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveToStorage<T>(key: string, data: T[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Failed to save to localStorage (${key}):`, e);
  }
}

export class OfflineSyncEngine {
  private config: SyncConfig;
  private workerInterval: ReturnType<typeof setInterval> | null = null;
  private onlineListeners: (() => void)[] = [];
  private offlineListeners: (() => void)[] = [];

  constructor(config: SyncConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config } as SyncConfig;
  }

  static createAction(table: string, action: 'CREATE' | 'UPDATE' | 'DELETE', payload: any): SyncAction {
    monotonicSequence = Math.max(monotonicSequence + 1, Date.now());
    return {
      id: generateId(),
      sequence: monotonicSequence,
      table,
      action,
      payload,
      status: SyncStatus.PENDING,
      retryCount: 0,
      createdAt: Date.now()
    };
  }

  addToQueue(action: SyncAction): void {
    const queue = this.getQueue();
    queue.push(action);
    saveToStorage(STORAGE_KEY, queue);
  }

  static addToQueue(action: SyncAction): void {
    const queue = loadFromStorage<SyncAction>(STORAGE_KEY);
    queue.push(action);
    saveToStorage(STORAGE_KEY, queue);
  }

  getQueue(): SyncAction[] {
    return loadFromStorage<SyncAction>(STORAGE_KEY);
  }

  static getQueue(): SyncAction[] {
    return loadFromStorage<SyncAction>(STORAGE_KEY);
  }

  clearCompleted(): void {
    const queue = this.getQueue();
    const pending = queue.filter(a => a.status !== SyncStatus.COMPLETED);
    saveToStorage(STORAGE_KEY, pending);
  }

  static clearCompleted(): void {
    const queue = loadFromStorage<SyncAction>(STORAGE_KEY);
    const pending = queue.filter(a => a.status !== SyncStatus.COMPLETED);
    saveToStorage(STORAGE_KEY, pending);
  }

  static resolveConflict(localData: any, serverData: any): any {
    if (!serverData) return localData;
    const localTime = localData.updatedAt || 0;
    const serverTime = serverData.updatedAt || 0;
    return localTime > serverTime ? localData : serverData;
  }

  static markAsFailed(action: SyncAction, error: string): SyncAction {
    return {
      ...action,
      status: SyncStatus.FAILED,
      retryCount: (action.retryCount || 0) + 1,
      lastError: error
    };
  }

  static prepareSyncBatch(queue: SyncAction[], batchSize: number = 50): any {
    const now = Date.now();
    const pendingActions = queue
      .filter((a) =>
        (a.status === SyncStatus.PENDING || a.status === SyncStatus.FAILED) &&
        a.retryCount < MAX_RETRY_COUNT &&
        (!a.nextAttemptAt || a.nextAttemptAt <= now)
      )
      .sort((a, b) => (a.sequence || a.createdAt) - (b.sequence || b.createdAt))
      .slice(0, batchSize);
    return {
      batchId: generateId(),
      actions: pendingActions,
      timestamp: now
    };
  }

  static async sync(
    serverUrl: string,
    token: string,
    queue: SyncAction[],
    batchSize: number = 50
  ): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      syncedCount: 0,
      failedCount: 0,
      errors: []
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      result.success = false;
      result.errors.push('Device is offline');
      return result;
    }

    const batch = OfflineSyncEngine.prepareSyncBatch(queue, batchSize);

    for (const action of batch.actions) {
      try {
        action.status = SyncStatus.SYNCING;
        saveToStorage(STORAGE_KEY, queue);

        const method = action.action === 'DELETE' ? 'DELETE' : action.action === 'CREATE' ? 'POST' : 'PATCH';

        const fetchOptions: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Sync-Id': action.id,
          },
        };

        if (action.action !== 'DELETE') {
          fetchOptions.body = JSON.stringify(action.payload);
        }

        const response = await fetch(`${serverUrl}/${action.table}`, fetchOptions);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        action.status = SyncStatus.COMPLETED;
        action.nextAttemptAt = undefined;
        result.syncedCount++;
      } catch (error) {
        action.retryCount++;
        action.lastError = error instanceof Error ? error.message : String(error);
        if (action.retryCount >= MAX_RETRY_COUNT) {
          action.status = SyncStatus.DEAD_LETTER;
          action.nextAttemptAt = undefined;
        } else {
          action.status = SyncStatus.FAILED;
          action.nextAttemptAt = Date.now() + Math.min(300_000, 1000 * 2 ** action.retryCount);
        }
        result.failedCount++;
        result.errors.push(action.lastError);
      }
      saveToStorage(STORAGE_KEY, queue);
    }

    saveToStorage(STORAGE_KEY, queue.filter(a => a.status !== SyncStatus.COMPLETED));

    result.success = result.failedCount === 0;
    return result;
  }

  async syncAll(): Promise<SyncResult> {
    const queue = this.getQueue();
    return OfflineSyncEngine.sync(
      this.config.serverUrl,
      this.config.token,
      queue,
      this.config.batchSize
    );
  }

  startBackgroundSync(intervalMs: number = 30000): void {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
    }

    this.workerInterval = setInterval(async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;

      const queue = this.getQueue();
      if (queue.length === 0) return;

      const result = await this.syncAll();
      if (result.success && this.config.onSyncComplete) {
        this.config.onSyncComplete(result);
      }
      if (!result.success && this.config.onError) {
        result.errors.forEach(e => this.config.onError!(e));
      }
    }, intervalMs);

    if (typeof window !== 'undefined') {
      const handleOnline = () => {
        this.onlineListeners.forEach(fn => fn());
        this.syncAll();
      };
      const handleOffline = () => {
        this.offlineListeners.forEach(fn => fn());
      };
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }
  }

  stopBackgroundSync(): void {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
    }
  }

  onOnline(callback: () => void): void {
    this.onlineListeners.push(callback);
  }

  onOffline(callback: () => void): void {
    this.offlineListeners.push(callback);
  }

  getQueueSize(): number {
    return this.getQueue().length;
  }

  getFailedCount(): number {
    return this.getQueue().filter(a => a.status === SyncStatus.FAILED).length;
  }

  isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  static getDeltaSyncData(key: string): any {
    const allData = loadFromStorage<{ key: string; data: any; updatedAt: number }>(DELTA_KEY);
    const entry = allData.find(d => d.key === key);
    return entry ? entry.data : null;
  }

  static setDeltaSyncData(key: string, data: any): void {
    const allData = loadFromStorage<{ key: string; data: any; updatedAt: number }>(DELTA_KEY);
    const existing = allData.findIndex(d => d.key === key);
    const entry = { key, data, updatedAt: Date.now() };
    if (existing >= 0) {
      allData[existing] = entry;
    } else {
      allData.push(entry);
    }
    saveToStorage(DELTA_KEY, allData);
  }

  static clearDeltaSyncData(key?: string): void {
    if (key) {
      const allData = loadFromStorage<{ key: string; data: any; updatedAt: number }>(DELTA_KEY);
      saveToStorage(DELTA_KEY, allData.filter(d => d.key !== key));
    } else {
      saveToStorage(DELTA_KEY, []);
    }
  }
}
