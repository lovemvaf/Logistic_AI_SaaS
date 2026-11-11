import api from './api';
import { OfflineSyncEngine, SyncAction } from './offline-sync';
import NetInfo from '@react-native-community/netinfo';

/**
 * Helper to determine if device is online.
 */
export const isOnline = async (): Promise<boolean> => {
  const state = await NetInfo.fetch();
  return state.isConnected ?? false;
};

/**
 * Generic function to perform an API request and fallback to offline queue on failure.
 * actionType must be one of 'CREATE' | 'UPDATE' | 'DELETE'.
 */
export async function requestWithOffline(
  method: 'POST' | 'PATCH' | 'DELETE',
  endpoint: string, // without leading slash
  payload: any = undefined
): Promise<any> {
  try {
    const config = {
      method,
      url: `/${endpoint}`,
      data: payload,
    };
    // @ts-ignore – axios instance accepts these fields
    const response = await api(config);
    return response;
  } catch (err) {
    // Always queue offline action regardless of error cause.
    const action: SyncAction = OfflineSyncEngine.createAction(endpoint, method === 'POST' ? 'CREATE' : method === 'PATCH' ? 'UPDATE' : 'DELETE', payload);
    await OfflineSyncEngine.addToQueue(action);
    // Rethrow original error so UI can display appropriate message.
    throw err;
  }
}

export const postWithOffline = (endpoint: string, payload: any) => requestWithOffline('POST', endpoint, payload);
export const patchWithOffline = (endpoint: string, payload: any) => requestWithOffline('PATCH', endpoint, payload);
export const deleteWithOffline = (endpoint: string) => requestWithOffline('DELETE', endpoint);
