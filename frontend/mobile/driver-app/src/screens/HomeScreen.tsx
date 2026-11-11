import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import api from '../lib/api';
import { postWithOffline } from '../lib/offline-utils';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { SurfaceCard } from '../components/SurfaceCard';
import { ActionButton } from '../components/ActionButton';
import { decodeJwt } from '../utils/decodeJwt';

export default function HomeScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tripData, setTripData] = useState<any>(null);
  const [codAmount, setCodAmount] = useState<number>(0);
  const [isOnline, setIsOnline] = useState(false);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);

  const fetchCurrentTrip = async () => {
    setLoading(true);
    try {
      const response = await api.get('/mobile/trips?limit=1');
      const list = Array.isArray(response.data) ? response.data : (response.data?.data || []);
      if (list.length > 0) {
        setTripData(list[0]);
      } else {
        setTripData(null);
      }

      const walletRes = await api.get('/mobile/wallet');
      const cod = Number(walletRes.data?.codAmount ?? walletRes.data?.data?.codAmount ?? 0);
      setCodAmount(cod);
    } catch (error: any) {
      if (!refreshing) {
        Alert.alert('Lỗi', error.response?.data?.message || 'Không thể tải dữ liệu chuyến xe.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCurrentTrip();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchCurrentTrip();
  };

  useEffect(() => {
    let active = true;
    const loadIdentity = async () => {
      try {
        const stored = await AsyncStorage.getItem('@SmartLogi:driver_profile');
        if (stored && active) {
          const profile = JSON.parse(stored);
          if (profile?.id) setDriverId(profile.id);
        }
        const token = await AsyncStorage.getItem('@SmartLogi:driver_token');
        if (token && active) {
          const payload = decodeJwt(token);
          if (payload?.driverId) setDriverId(payload.driverId);
        }
      } catch {
        // Identity hydration falls back cleanly when storage is empty
      }
    };
    loadIdentity();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let locationInterval: ReturnType<typeof setInterval> | undefined;
    if (isOnline && driverId) {
      locationInterval = setInterval(async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setCurrentLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          const speedKmh = Math.max(0, (loc.coords.speed ?? 0) * 3.6);
          await postWithOffline('gps/batch', {
            logs: [{
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
              speed: Math.round(speedKmh * 10) / 10,
              driverId,
              timestamp: Date.now()
            }]
          });
        } catch {
          // Offline queue captures failed uploads in postWithOffline
        }
      }, 30000);
    }
    return () => {
      if (locationInterval) clearInterval(locationInterval);
    };
  }, [isOnline, driverId]);

  const toggleOnline = async () => {
    if (!isOnline) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Từ chối quyền truy cập', 'Vui lòng cấp quyền vị trí để bật trực tuyến.');
        return;
      }
      setIsOnline(true);
      Alert.alert('Trực tuyến', 'Hệ thống đang theo dõi vị trí giao hàng của bạn.');
    } else {
      setIsOnline(false);
      Alert.alert('Ngoại tuyến', 'Đã tạm dừng gửi vị trí.');
    }
  };

  const handleSOS = async () => {
    Alert.alert(
      'XÁC NHẬN KHẨN CẤP',
      'Vị trí hiện tại của bạn sẽ được gửi tới điều phối viên. Tiếp tục?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'GỬI SOS',
          style: 'destructive',
          onPress: async () => {
            try {
              const loc = await Location.getCurrentPositionAsync({});
              await postWithOffline('driver-app/sos', {
                lat: loc.coords.latitude,
                lng: loc.coords.longitude,
                tripId: tripData?.id,
                message: 'Driver Emergency - SOS Triggered',
              });
              Alert.alert('Đã gửi cảnh báo', 'Điều phối viên đã nhận tín hiệu SOS.');
            } catch {
              Alert.alert('Lỗi', 'Không thể gửi SOS trực tiếp; yêu cầu đã được xếp hàng đợi ngoại tuyến.');
            }
          }
        }
      ]
    );
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      minimumFractionDigits: 0,
    }).format(amount);
  };

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
      <SurfaceCard style={styles.walletCard}>
        <Text style={[typography.caption, { color: colors['ink-soft'] }]}>Tiền thu hộ đang giữ (COD)</Text>
        <Text style={[typography.h1, { color: colors.ink, marginVertical: 12 }]}>{formatCurrency(codAmount)}</Text>
        <ActionButton
          title="Tạo phiếu nộp tiền"
          onPress={() => navigation.navigate('Remittance')}
          variant="secondary"
          style={styles.remitButton}
        />
      </SurfaceCard>

      <ActionButton
        title={isOnline ? 'Chuyển ngoại tuyến' : 'Bật trực tuyến'}
        onPress={toggleOnline}
        variant={isOnline ? 'secondary' : 'primary'}
        style={{ marginBottom: 20 }}
      />

      {tripData ? (
        <SurfaceCard style={styles.tripCard}>
          <View style={styles.tripHeader}>
            <Text style={[typography.h3, { color: colors.ink }]}>{tripData.tripCode}</Text>
            <View style={styles.badge}>
              <Text style={[typography.caption, { color: colors.primary }]}>{tripData.status}</Text>
            </View>
          </View>

          <Text style={[typography.body1, styles.tripInfo]}>Xe: {tripData.vehicle?.plateNumber || 'Chưa gắn xe'}</Text>
          <Text style={[typography.body1, styles.tripInfo]}>Tổng tải: {tripData.totalWeightKg} kg</Text>
          {currentLocation && (
            <Text style={[typography.caption, styles.tripInfo]}>
              GPS hiện tại: {currentLocation.lat.toFixed(4)}, {currentLocation.lng.toFixed(4)}
            </Text>
          )}

          <ActionButton
            title="Chi tiết chuyến xe"
            onPress={() => {
              if (tripData.id) {
                navigation.navigate('TripDetail', { tripId: tripData.id });
              } else {
                Alert.alert('Lỗi', 'Không tìm thấy mã chuyến xe.');
              }
            }}
            style={{ marginTop: 24 }}
          />
        </SurfaceCard>
      ) : (
        <View style={styles.emptyTrip}>
          <Text style={[typography.body1, { color: colors['ink-soft'] }]}>Hiện chưa có chuyến xe được phân công.</Text>
        </View>
      )}

      <ActionButton
        title="Gửi cảnh báo SOS"
        onPress={handleSOS}
        variant="danger"
        style={{ marginTop: 12 }}
      />

      <ActionButton
        title="Báo cáo chi phí"
        onPress={() => navigation.navigate('Expense')}
        variant="secondary"
        style={{ marginTop: 12 }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  walletCard: {
    marginBottom: 20,
    backgroundColor: colors.white,
  },
  remitButton: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  tripCard: {
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  badge: {
    backgroundColor: colors.primary + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tripInfo: {
    color: colors['ink-soft'],
    marginBottom: 8,
  },
  emptyTrip: {
    padding: 40,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: 20,
  },
});
