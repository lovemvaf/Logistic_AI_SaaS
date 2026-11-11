import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import api from './api';

const LOCATION_TASK_NAME = 'background-location-task';

const batchBuffer: { lat: number; lng: number; timestamp: string }[] = [];

export const initBackgroundLocation = async () => {
  try {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') return;

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== 'granted') return;

    const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (!hasStarted) {
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 60000,
        distanceInterval: 100,
        showsBackgroundLocationIndicator: true,
      });
    }

    TaskManager.defineTask(LOCATION_TASK_NAME, (result: any) => {
      if (result.error) {
        console.error('Background location task error:', result.error);
        return;
      }
      if (result.data) {
        const { coords } = result.data;
        batchBuffer.push({
          lat: coords.latitude,
          lng: coords.longitude,
          timestamp: new Date().toISOString(),
        });

        if (batchBuffer.length >= 10) {
          syncGPSBatch();
        }
      }
    });

    console.log('Background location tracking started.');
  } catch (err) {
    console.error('Failed to init background location', err);
  }
};

async function syncGPSBatch() {
  if (batchBuffer.length === 0) return;
  try {
    await api.post('/mobile/gps-batch', { points: [...batchBuffer] });
    batchBuffer.length = 0;
    console.log('GPS batch synced');
  } catch (e) {
    console.warn('GPS Batch sync error', e);
  }
}

export const syncCurrentLocation = async () => {
  try {
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    batchBuffer.push({
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      timestamp: new Date().toISOString(),
    });

    if (batchBuffer.length >= 5) {
      await syncGPSBatch();
    }
  } catch (e) {
    console.warn('Location sync error', e);
  }
};
