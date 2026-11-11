import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import { postWithOffline } from '../lib/offline-utils';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { SurfaceCard } from '../components/SurfaceCard';
import { ActionButton } from '../components/ActionButton';

const TELEMETRY_KEY = '@telemetry_events';
const SPEED_KEY = '@telemetry_speed';
const OVERSPEED_THRESHOLD_KMH = 85;

type TelemetryEvent = {
  id: string;
  kind: 'SPEED' | 'HARSH_BRK' | 'HARSH_TURN' | 'HARSH_IGN' | 'IDLE_TOO_LONG' | 'SOS';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  at: string;
  lat?: number;
  lng?: number;
  speed?: number;
  note?: string;
};

type RiskTier = {
  score: number;
  lane: 'an toàn' | 'cảnh giác' | 'nghiêm trọng';
  tone: 'success' | 'warning' | 'danger';
  note: string;
};

type SpeedState = { lat: number | null; lng: number | null; speedKmh: number };

const FINE: Record<TelemetryEvent['kind'], number> = {
  SPEED: 3,
  HARSH_BRK: 5,
  HARSH_TURN: 4,
  HARSH_IGN: 2,
  IDLE_TOO_LONG: 4,
  SOS: 20,
};

const EVENT_LABELS: Record<TelemetryEvent['kind'], string> = {
  SPEED: 'Vượt tốc độ cho phép',
  HARSH_BRK: 'Phanh gấp',
  HARSH_TURN: 'Đánh lái gắt',
  HARSH_IGN: 'Tăng tốc đột ngột',
  IDLE_TOO_LONG: 'Dừng đỗ quá lâu',
  SOS: 'Khẩn cấp SOS',
};

const computeTier = (score: number): RiskTier => {
  if (score >= 90) {
    return {
      score,
      lane: 'an toàn',
      tone: 'success',
      note: 'Tài xế tuân thủ quy định và chưa ghi nhận sự kiện rủi ro gần đây.',
    };
  }
  if (score >= 75) {
    return {
      score,
      lane: 'cảnh giác',
      tone: 'warning',
      note: 'Có một số cảnh báo an toàn, cần chú ý tốc độ và phanh xe.',
    };
  }
  return {
    score,
    lane: 'nghiêm trọng',
    tone: 'danger',
    note: 'Điểm an toàn thấp, cần kiểm tra hành trình ngay.',
  };
};

export default function SafetyScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [score, setScore] = useState(100);
  const [safety, setSafety] = useState<RiskTier>(computeTier(100));
  const [speed, setSpeed] = useState<SpeedState>({ lat: null, lng: null, speedKmh: 0 });
  const [isOnline, setIsOnline] = useState(false);

  const applyScore = useCallback((eventsList: TelemetryEvent[]) => {
    const penalty = eventsList.reduce((total, e) => total + (FINE[e.kind] ?? 0), 0);
    const computed = Math.max(0, 100 - penalty);
    setScore(computed);
    setSafety(computeTier(computed));
    setEvents(eventsList);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const net = await NetInfo.fetch();
      setIsOnline(net.isConnected ?? false);
      const [telemetry, localSpeed] = await Promise.all([
        AsyncStorage.getItem(TELEMETRY_KEY),
        AsyncStorage.getItem(SPEED_KEY),
      ]);
      const eventsList: TelemetryEvent[] = telemetry ? JSON.parse(telemetry) : [];
      const storedSpeed: SpeedState = localSpeed
        ? JSON.parse(localSpeed)
        : { lat: null, lng: null, speedKmh: 0 };
      setSpeed(storedSpeed);
      applyScore(eventsList);
    } catch {
      applyScore([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyScore]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const trackSpeed = useCallback(async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const speedKmh = Math.max(0, (loc.coords.speed ?? 0) * 3.6);
      const nextSpeed: SpeedState = {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        speedKmh: Math.round(speedKmh * 10) / 10,
      };
      setSpeed(nextSpeed);
      await AsyncStorage.setItem(SPEED_KEY, JSON.stringify(nextSpeed));

      if (nextSpeed.speedKmh > OVERSPEED_THRESHOLD_KMH) {
        const stored = await AsyncStorage.getItem(TELEMETRY_KEY);
        const eventsList: TelemetryEvent[] = stored ? JSON.parse(stored) : [];
        eventsList.unshift({
          id: `tel-${Date.now()}`,
          kind: 'SPEED',
          severity: 'MEDIUM',
          at: new Date().toISOString(),
          lat: nextSpeed.lat ?? undefined,
          lng: nextSpeed.lng ?? undefined,
          speed: nextSpeed.speedKmh,
          note: `Tốc độ ${nextSpeed.speedKmh.toFixed(1)} km/h vượt ngưỡng ${OVERSPEED_THRESHOLD_KMH} km/h`,
        });
        const trimmed = eventsList.slice(0, 50);
        await AsyncStorage.setItem(TELEMETRY_KEY, JSON.stringify(trimmed));
        applyScore(trimmed);
      }
    } catch {
      // Location unavailability does not break telemetry screen
    }
  }, [applyScore]);

  const handleSendTelemetry = async () => {
    try {
      await trackSpeed();
      if (speed.lat === null || speed.lng === null) {
        Alert.alert('Thông báo', 'Chưa có tọa độ GPS hiện tại để gửi.');
        return;
      }
      await postWithOffline('gps/batch', {
        logs: [{
          lat: speed.lat,
          lng: speed.lng,
          speed: speed.speedKmh,
          timestamp: Date.now(),
        }],
      });
      Alert.alert('Thành công', 'Đã đồng bộ vị trí an toàn lên máy chủ.');
    } catch {
      Alert.alert('Ngoại tuyến', 'Không thể gửi ngay; dữ liệu vị trí đã được đưa vào hàng đợi đồng bộ.');
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(trackSpeed, 30_000);
    return () => clearInterval(interval);
  }, [load, trackSpeed]);

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
        <Text style={[typography.h1, { color: colors.ink }]}>An toàn tài xế</Text>
        <Text style={[typography.body1, { color: colors['ink-soft'] }]}>
          Điểm an toàn, cảnh báo tốc độ và sự kiện giám sát hành trình.
        </Text>
      </View>

      <SurfaceCard style={styles.scoreCard}>
        <View style={styles.scoreRing}>
          <Text style={[typography.h2, { color: safety.tone === 'danger' ? colors.rose[500] : colors.emerald[600] }]}>
            {score}
          </Text>
          <Text style={[typography.caption, { color: colors['ink-soft'] }]}>/ 100 điểm</Text>
        </View>
        <Text
          style={[
            typography.body1,
            {
              color: safety.tone === 'danger' ? colors.rose[500] : colors.emerald[600],
              fontWeight: '600',
            },
          ]}
        >
          {safety.lane}
        </Text>
        <Text style={[typography.body2, { color: colors['ink-soft'], marginTop: 8, textAlign: 'center' }]}>
          {safety.note}
        </Text>
      </SurfaceCard>

      <SurfaceCard style={styles.card}>
        <Text style={[typography.h3, { color: colors.ink, marginBottom: 12 }]}>Vị trí hiện tại</Text>
        <View style={styles.row}>
          <Text style={[typography.body2, { color: colors['ink-soft'] }]}>
            Kinh độ: {speed.lng === null ? '—' : speed.lng.toFixed(6)}
          </Text>
          <Text style={[typography.body2, { color: colors['ink-soft'] }]}>
            Vĩ độ: {speed.lat === null ? '—' : speed.lat.toFixed(6)}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={[typography.body2, { color: colors['ink-soft'] }]}>
            Tốc độ: {`${speed.speedKmh.toFixed(1)} km/h`}
          </Text>
          <Text style={[typography.body2, { color: colors['ink-soft'] }]}>
            Kết nối: {isOnline ? 'Trực tuyến' : 'Ngoại tuyến'}
          </Text>
        </View>
        <View style={styles.actions}>
          <ActionButton title="Gửi vị trí hiện tại" onPress={handleSendTelemetry} variant="primary" style={styles.action} />
          <ActionButton title="Làm mới điểm an toàn" onPress={onRefresh} variant="outline" style={styles.action} />
        </View>
      </SurfaceCard>

      <View style={styles.listHeader}>
        <Text style={[typography.h3, { color: colors.ink }]}>Sự kiện gần đây</Text>
        <Text style={[typography.caption, { color: colors['ink-soft'] }]}>{events.length} sự kiện</Text>
      </View>

      {events.length === 0 ? (
        <Text style={[typography.body1, { color: colors['ink-soft'], textAlign: 'center', padding: 40 }]}>
          Không có sự kiện cảnh báo nào gần đây.
        </Text>
      ) : (
        events.slice(0, 8).map((event) => (
          <SurfaceCard key={event.id} style={styles.eventCard}>
            <View style={styles.eventRow}>
              <Text style={[typography.body2, { color: colors.ink, fontWeight: '600' }]}>
                {EVENT_LABELS[event.kind]}
              </Text>
              <Text style={[typography.caption, { color: colors['ink-soft'] }]}>
                {new Date(event.at).toLocaleString('vi-VN')}
              </Text>
            </View>
            {event.lat && event.lng ? (
              <Text style={[typography.caption, { color: colors['ink-soft'] }]}>
                {event.lat.toFixed(4)}, {event.lng.toFixed(4)}
              </Text>
            ) : null}
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
  scoreCard: { margin: 16, padding: 24, alignItems: 'center' },
  scoreRing: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 },
  card: { margin: 16, padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  actions: { marginTop: 16, gap: 12 },
  action: { marginTop: 8 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 },
  eventCard: { margin: 0, marginHorizontal: 16, marginBottom: 8, padding: 12 },
  eventRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
