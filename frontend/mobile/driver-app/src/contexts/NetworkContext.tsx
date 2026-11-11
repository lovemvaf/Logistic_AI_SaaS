import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { OfflineSyncEngine, SyncResult } from '../lib/offline-sync';

interface NetworkContextType {
  isOnline: boolean;
  pendingCount: number;
  lastSyncResult: SyncResult | null;
  isSyncing: boolean;
  triggerSync: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextType>({
  isOnline: true,
  pendingCount: 0,
  lastSyncResult: null,
  isSyncing: false,
  triggerSync: async () => {},
});

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = state.isConnected ?? false;
      setIsOnline(online);
      if (online) {
        triggerSync();
      }
    });

    return () => unsubscribe();
  }, []);

  const refreshPendingCount = useCallback(async () => {
    const queue = await OfflineSyncEngine.getQueue();
    setPendingCount(queue.filter(a => a.status !== 'COMPLETED').length);
  }, []);

  const triggerSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await OfflineSyncEngine.syncAll();
      setLastSyncResult(result);
      await refreshPendingCount();
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshPendingCount]);

  useEffect(() => {
    refreshPendingCount();
    const interval = setInterval(() => {
      if (isOnline) {
        triggerSync();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [isOnline, triggerSync, refreshPendingCount]);

  return (
    <NetworkContext.Provider value={{ isOnline, pendingCount, lastSyncResult, isSyncing, triggerSync }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
