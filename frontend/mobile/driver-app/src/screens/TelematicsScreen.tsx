import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Switch, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import { postWithOffline } from '../lib/offline-utils';
import { OfflineSyncEngine, SyncStatus } from '../lib/offline-sync';
import { initBackgroundLocation } from '../lib/backgroundLocation';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { SurfaceCard } from '../components/SurfaceCard';
import { ActionButton } from '../components/ActionButton';

const LOG_KEY = '@telemetry_logs';
const TRACKING_KEY = '@telemetry_tracking';
const SPEED_KEY = '@telemetry_speed';

type LogPoint = {
  id: string;
  lat: number;
  lng: number;
  speed: number;
  at: string;
};

type SpeedState = { lat: number | null; lng: number | null; speedKmh: number };

export default function TelematicsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logs, setLogs] = useState<LogPoint[]>([]);
  const [pending, setPending] = useState(0);
  const [tracking, setTracking] = useState(false);
  const [speed, setSpeed] = useState<SpeedState>({ lat: null, lng: null, speedKmh: 0 });
  const [isOnline, setIsOnline] = useState(false);

  const refreshQueue = useCallback(async () => {
    const queue = await OfflineSyncEngine.getQueue();
    setPending(queue.filter((a) => a.status !== SyncStatus.COMPLETED && a.status !== SyncStatus.DEAD_LETTER).length);
  }, []);

  const logPosition = useCallback(async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const speedKmh = Math.max(0, Math.round((loc.coords.speed ?? 0) * 3.6 * 10) / 10);
      const nextSpeed: SpeedState = {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        speedKmh,
      };
      setSpeed(nextSpeed);
      await AsyncStorage.setItem(SPEED_KEY, JSON.stringify(nextSpeed));
      const stored = await AsyncStorage.getItem(LOG_KEY);
      const list: LogPoint[] = stored ? JSON.parse(stored) : [];
      list.unshift({
        id: `log-${Date.now()}`,
        lat: nextSpeed.lat ?? 0,
        lng: nextSpeed.lng ?? 0,
        speed: speedKmh,
        at: new Date().toISOString(),
      });
      await AsyncStorage.setItem(LOG_KEY, JSON.stringify(list.slice(0, 200)));
    } catch {
      // Ignore silent GPS failure during periodic sampling
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const net = await NetInfo.fetch();
      setIsOnline(net.isConnected ?? false);
      const stored = await AsyncStorage.getItem(LOG_KEY);
      setLogs(stored ? JSON.parse(stored) : []);
      const saved = await AsyncStorage.getItem(TRACKING_KEY);
      setTracking(saved === 'true');
      await refreshQueue();
      const localSpeed = await AsyncStorage.getItem(SPEED_KEY);
      if (localSpeed) {
        const parsed = JSON.parse(localSpeed);
        setSpeed({
          lat: parsed.lat ?? null,
          lng: parsed.lng ?? null,
          speedKmh: parsed.speedKmh ?? parsed.speed ?? 0,
        });
      }
    } catch {
      setLogs([]);
      setPending(0);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshQueue]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const toggleTracking = async () => {
    const next = !tracking;
    setTracking(next);
    await AsyncStorage.setItem(TRACKING_KEY, String(next));
    if (next) {
      await initBackgroundLocation();
    }
  };

  const handleSync = async () => {
    try {
      const syncResult = await OfflineSyncEngine.syncAll();
      if (logs.length > 0) {
        await postWithOffline('mobile/gps-batch', {
          points: logs.slice(0, 50).map((item) => ({
            lat: item.lat,
            lng: item.lng,
            timestamp: item.at,
          })),
        });
      }
      await refreshQueue();
      await load();
      Alert.alert(
        'Đồng bộ hoàn tất',
        `Đã đẩy ${syncResult.syncedCount} tác vụ hàng đợi (còn lỗi: ${syncResult.failedCount}).`,
      );
    } catch {
      await refreshQueue();
      Alert.alert('Ngoại tuyến', 'Không có kết nối máy chủ; điểm GPS tiếp tục nằm trong hàng đợi.');
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(logPosition, 60_000);
    return () => clearInterval(interval);
  }, [load, logPosition]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <View style={styles.header}>
        <Text style={[typography.h1, { color: colors.ink }]}>Phân tích telemetry</Text>
        <Text style={[typography.body1, { color: colors['ink-soft'] }]}>
          Hàng đợi ngoại tuyến, lịch sử vị trí và tốc độ thực tế.
        </Text>
      </View>

      <SurfaceCard style={styles.grid}>
        <View style={styles.cell}>
          <Text style={[typography.caption, { color: colors['ink-soft'] }]}>Chờ đồng bộ</Text>
          <Text style={[typography.h2, { color: colors.ink }]}>{pending}</Text>
        </View>
        <View style={styles.cell}>
          <Text style={[typography.caption, { color: colors['ink-soft'] }]}>Kết nối</Text>
          <Text style={[typography.h2, { color: colors.ink }]}>{isOnline ? 'Trực tuyến' : 'Ngoại tuyến'}</Text>
        </View>
        <View style={styles.cell}>
          <Text style={[typography.caption, { color: colors['ink-soft'] }]}>Vị trí cuối</Text>
          <Text style={[typography.body2, { color: colors['ink-soft'] }]}>
            {speed.lat === null || speed.lng === null ? '—' : `${speed.lat.toFixed(4)}, ${speed.lng.toFixed(4)}`}
          </Text>
        </View>
      </SurfaceCard>

      <SurfaceCard style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={[typography.h3, { color: colors.ink }]}>Giám sát vị trí nền</Text>
          <Switch
            value={tracking}
            onValueChange={toggleTracking}
            trackColor={{ false: colors.slate[300], true: colors.emerald[500] }}
            thumbColor={tracking ? colors.emerald[600] : colors.slate[100]}
          />
        </View>
        <Text style={[typography.body2, { color: colors['ink-soft'], marginBottom: 16 }]}>
          Ghi nhận điểm GPS nền khi ứng dụng thu nhỏ trong quá trình giao hàng.
        </Text>
        <View style={styles.actions}>
          <ActionButton title="Đồng bộ hàng đợi ngay" onPress={handleSync} variant="primary" style={styles.action} />
          <ActionButton title="Làm mới" onPress={onRefresh} variant="outline" style={styles.action} />
        </View>
      </SurfaceCard>

      <View style={styles.listHeader}>
        <Text style={[typography.h3, { color: colors.ink }]}>Lịch sử vị trí</Text>
        <Text style={[typography.caption, { color: colors['ink-soft'] }]}>{logs.length} điểm</Text>
      </View>

      {logs.length === 0 ? (
        <Text style={[typography.body1, { color: colors['ink-soft'], textAlign: 'center', padding: 40 }]}>
          Chưa ghi nhận tọa độ nào. Bật giám sát để bắt đầu thu thập dữ liệu.
        </Text>
      ) : (
        logs.slice(0, 10).map((log) => (
          <SurfaceCard key={log.id} style={styles.eventCard}>
            <View style={styles.row}>
              <Text style={[typography.body2, { color: colors.ink }]}>{new Date(log.at).toLocaleString('vi-VN')}</Text>
              <Text style={[typography.caption, { color: colors['ink-soft'] }]}>
                {log.lat.toFixed(4)}, {log.lng.toFixed(4)}
              </Text>
            </View>
            <Text style={[typography.caption, { color: colors['ink-soft'], marginTop: 4 }]}>
              Tốc độ: {(log.speed || 0).toFixed(1)} km/h
            </Text>
          </SurfaceCard>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: { padding: 16, paddingBottom: 8 },
  grid: { margin: 16, padding: 16, flexDirection: 'row', justifyContent: 'space-between' },
  cell: { alignItems: 'center' },
  card: { margin: 16, padding: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  actions: { gap: 12 },
  action: { marginTop: 8 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 },
  eventCard: { margin: 0, marginHorizontal: 16, marginBottom: 8, padding: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
