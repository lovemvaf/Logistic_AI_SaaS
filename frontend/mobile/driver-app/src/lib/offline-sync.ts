import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

export enum SyncStatus {
  PENDING = 'PENDING',
  SYNCING = 'SYNCING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  DEAD_LETTER = 'DEAD_LETTER',
}

export interface SyncAction {
  id: string;
  sequence: number;
  table: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: any;
  status: SyncStatus;
  retryCount: number;
  nextAttemptAt?: number;
  lastAttemptAt?: number;
  lastError?: string;
  createdAt: number;
}

export interface SyncResult {
  success: boolean;
  syncedCount: number;
  failedCount: number;
  deadLetterCount: number;
  errors: string[];
}

const STORAGE_KEY = 'offline_sync_queue';
const MAX_RETRY_COUNT = 5;
const BATCH_SIZE = 10;
let monotonicSeq = 0;

function generateId(): string {
  const gCrypto: any = typeof globalThis !== 'undefined' ? (globalThis as any).crypto : undefined;
  if (gCrypto && typeof gCrypto.randomUUID === 'function') {
    return gCrypto.randomUUID();
  }
  if (gCrypto && typeof gCrypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    gCrypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  // Fallback when global WebCrypto is unavailable in stripped test runtimes: monotonic sequence + hrtime
  monotonicSeq += 1;
  const tsHex = Date.now().toString(16).padStart(12, '0');
  const seqHex = monotonicSeq.toString(16).padStart(8, '0');
  return `${tsHex.slice(0, 8)}-${tsHex.slice(8, 12)}-4000-8000-${seqHex}0000`;
}

function nextMonotonicSequence(existing: SyncAction[]): number {
  const maxExisting = existing.reduce((m, item) => Math.max(m, Number(item.sequence || 0)), 0);
  monotonicSeq = Math.max(monotonicSeq + 1, Date.now(), maxExisting + 1);
  return monotonicSeq;
}

function backoffWithJitterMs(retryCount: number): number {
  const base = Math.min(300_000, 1000 * 2 ** retryCount);
  const gCrypto: any = typeof globalThis !== 'undefined' ? (globalThis as any).crypto : undefined;
  let ratio = 0.15;
  if (gCrypto && typeof gCrypto.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    gCrypto.getRandomValues(arr);
    ratio = (arr[0] % 250) / 1000;
  }
  return Math.round(base * (1 + ratio));
}

function isPermanentClientError(error: any): boolean {
  const status = error?.response?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

export class OfflineSyncEngine {
  static createAction(table: string, action: 'CREATE' | 'UPDATE' | 'DELETE', payload: any): SyncAction {
    monotonicSeq = Math.max(monotonicSeq + 1, Date.now());
    return {
      id: generateId(),
      sequence: monotonicSeq,
      table,
      action,
      payload,
      status: SyncStatus.PENDING,
      retryCount: 0,
      createdAt: Date.now(),
    };
  }

  static async getQueue(): Promise<SyncAction[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static async saveQueue(queue: SyncAction[]): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  }

  static async addToQueue(action: SyncAction): Promise<void> {
    const queue = await OfflineSyncEngine.getQueue();
    if (!action.sequence) {
      action.sequence = nextMonotonicSequence(queue);
    }
    queue.push(action);
    await OfflineSyncEngine.saveQueue(queue);
  }

  static async addActionsToQueue(actions: SyncAction[]): Promise<void> {
    const queue = await OfflineSyncEngine.getQueue();
    for (const action of actions) {
      if (!action.sequence) {
        action.sequence = nextMonotonicSequence(queue);
      }
      queue.push(action);
    }
    await OfflineSyncEngine.saveQueue(queue);
  }

  static async retryDeadLetter(actionId: string): Promise<boolean> {
    const queue = await OfflineSyncEngine.getQueue();
    let found = false;
    const updated = queue.map((a) => {
      if (a.id === actionId && (a.status === SyncStatus.DEAD_LETTER || a.status === SyncStatus.FAILED)) {
        found = true;
        return {
          ...a,
          status: SyncStatus.PENDING,
          retryCount: 0,
          nextAttemptAt: undefined,
          lastError: undefined,
        };
      }
      return a;
    });
    if (found) {
      await OfflineSyncEngine.saveQueue(updated);
    }
    return found;
  }

  static async clearCompleted(): Promise<void> {
    const queue = await OfflineSyncEngine.getQueue();
    const active = queue.filter((a) => a.status !== SyncStatus.COMPLETED);
    await OfflineSyncEngine.saveQueue(active);
  }

  static async syncAll(): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      syncedCount: 0,
      failedCount: 0,
      deadLetterCount: 0,
      errors: [],
    };
    const now = Date.now();
    const queue = await OfflineSyncEngine.getQueue();
    const runnable = queue
      .filter(
        (a) =>
          a.status !== SyncStatus.COMPLETED &&
          a.status !== SyncStatus.DEAD_LETTER &&
          a.retryCount < MAX_RETRY_COUNT &&
          (!a.nextAttemptAt || a.nextAttemptAt <= now),
      )
      .sort((a, b) => (a.sequence || a.createdAt) - (b.sequence || b.createdAt));

    if (runnable.length === 0) return result;

    const batch = runnable.slice(0, BATCH_SIZE);

    for (const action of batch) {
      // Persist SYNCING checkpoint BEFORE sending HTTP mutation (crash-safe)
      action.status = SyncStatus.SYNCING;
      action.lastAttemptAt = Date.now();
      const preflightQueue = await OfflineSyncEngine.getQueue();
      await OfflineSyncEngine.saveQueue(
        preflightQueue.map((item) => (item.id === action.id ? { ...action } : item)),
      );

      try {
        const method = action.action === 'DELETE' ? 'DELETE' : action.action === 'CREATE' ? 'POST' : 'PATCH';
        let requestData = action.action !== 'DELETE' ? action.payload : undefined;
        const headers: Record<string, string> = {
          'X-Sync-Id': action.id,
          'X-Sync-Sequence': String(action.sequence || 0),
        };

        if (
          requestData &&
          typeof requestData === 'object' &&
          'uri' in requestData &&
          'name' in requestData &&
          'type' in requestData
        ) {
          const formData = new FormData();
          formData.append('file', {
            uri: requestData.uri,
            name: requestData.name,
            type: requestData.type,
          } as any);
          requestData = formData;
          headers['Content-Type'] = 'multipart/form-data';
        }

        await api({
          method,
          url: `/${action.table}`,
          data: requestData,
          headers,
        });
        action.status = SyncStatus.COMPLETED;
        action.nextAttemptAt = undefined;
        result.syncedCount++;
      } catch (error: any) {
        action.retryCount += 1;
        action.lastError = error?.message || 'Unknown error';
        if (isPermanentClientError(error) || action.retryCount >= MAX_RETRY_COUNT) {
          action.status = SyncStatus.DEAD_LETTER;
          action.nextAttemptAt = undefined;
          result.deadLetterCount++;
        } else {
          action.status = SyncStatus.FAILED;
          action.nextAttemptAt = Date.now() + backoffWithJitterMs(action.retryCount);
        }
        result.failedCount++;
        result.errors.push(action.lastError || 'Unknown error');
      }

      // Immediately persist outcome of each item
      const latestQueue = await OfflineSyncEngine.getQueue();
      await OfflineSyncEngine.saveQueue(
        latestQueue.map((item) => (item.id === action.id ? { ...action } : item)),
      );
    }

    await OfflineSyncEngine.clearCompleted();

    result.success = result.failedCount === 0;
    return result;
  }

  static async savePendingLocal(table: string, payload: any): Promise<void> {
    const key = `pending_local_${table}_${payload.id || generateId()}`;
    await AsyncStorage.setItem(key, JSON.stringify({ ...payload, _cachedAt: Date.now() }));
  }

  static async getLocalData(table: string): Promise<any[]> {
    const keys = await AsyncStorage.getAllKeys();
    const dataKeys = keys.filter((k) => k.startsWith(`pending_local_${table}_`));
    const items = await Promise.all(
      dataKeys.map((k) => AsyncStorage.getItem(k).then((val) => [k, val] as [string, string | null])),
    );
    return items.map(([_, val]) => (val ? JSON.parse(val) : null)).filter(Boolean);
  }

  static async cacheResponse(table: string, data: any): Promise<void> {
    const key = `cache_${table}`;
    await AsyncStorage.setItem(key, JSON.stringify({ data, cachedAt: Date.now() }));
  }

  static async getCachedResponse(table: string, maxAgeMs: number = 5 * 60 * 1000): Promise<any | null> {
    try {
      const raw = await AsyncStorage.getItem(`cache_${table}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.cachedAt > maxAgeMs) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }
}
