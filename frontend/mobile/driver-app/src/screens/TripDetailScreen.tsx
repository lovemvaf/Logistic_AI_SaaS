import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Alert } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import api from '../lib/api';
import { postWithOffline } from '../lib/offline-utils';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { GlassCard } from '../components/GlassCard';
import { NeonButton } from '../components/NeonButton';

export default function TripDetailScreen({ route, navigation }: any) {
  const tripId = route.params?.tripId;
  const [stops, setStops] = useState<any[]>([]);
  const [checkedInIds, setCheckedInIds] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);

  const requestLocationPermission = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return;
    }
    const loc = await Location.getCurrentPositionAsync({});
    setLocation(loc);
  }, []);

  const fetchStops = useCallback(async () => {
    if (!tripId) {
      setLoading(false);
      return;
    }
    try {
      const response = await api.get(`/mobile/trips/${tripId}/stops`);
      const list = Array.isArray(response.data) ? response.data : (response.data?.data || []);
      setStops(list);
    } catch (error: any) {
      Alert.alert('Lỗi', error.response?.data?.message || 'Không thể tải danh sách điểm dừng.');
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    fetchStops();
    requestLocationPermission();
  }, [fetchStops, requestLocationPermission]);

  if (!tripId) {
    return (
      <View style={[styles.container, styles.emptyContainer]}>
        <Text style={[typography.body1, { color: colors.textMuted, textAlign: 'center' }]}>
          Không tìm thấy thông tin chuyến xe.
        </Text>
      </View>
    );
  }

  const handleCheckIn = async (deliveryOrStopId: string) => {
    try {
      const loc = await Location.getCurrentPositionAsync({});
      await postWithOffline(`driver-app/deliveries/${deliveryOrStopId}/check-in`, {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      });
      setCheckedInIds((prev) => ({ ...prev, [deliveryOrStopId]: true }));
      Alert.alert('Thành công', 'Đã điểm danh GPS tại điểm giao hàng.');
      fetchStops();
    } catch (err: any) {
      Alert.alert('Lỗi', err.response?.data?.message || 'Không thể điểm danh. Yêu cầu đã được lưu ngoại tuyến nếu mất mạng.');
    }
  };

  const renderStop = ({ item, index }: any) => {
    const stopType = item.stopType || item.type || 'DELIVERY';
    const targetDeliveryId = item.deliveryId || item.id;
    const isCheckedIn = Boolean(item.checkedIn || checkedInIds[targetDeliveryId] || item.status === 'ARRIVED');

    return (
      <GlassCard style={styles.stopCard}>
        <View style={styles.stopHeader}>
          <View
            style={[
              styles.dot,
              { backgroundColor: item.status === 'COMPLETED' ? colors.success : colors.warning },
            ]}
          />
          <Text style={[typography.h3, { color: colors.text }]}>
            Điểm {index + 1}: {stopType}
          </Text>
        </View>
        <Text style={[typography.body2, styles.address]}>{item.address}</Text>

        {item.status === 'PENDING' && (stopType === 'DELIVERY' || stopType === 'ORDER') && (
          <View style={styles.actions}>
            {!isCheckedIn && (
              <NeonButton
                title="CHECK-IN GPS"
                onPress={() => handleCheckIn(targetDeliveryId)}
                style={styles.actionButton}
              />
            )}
            <NeonButton
              title="CHỤP POD & XÁC NHẬN GIAO"
              onPress={() =>
                navigation.navigate('POD', {
                  deliveryId: targetDeliveryId,
                  trackingCode: item.trackingCode || item.orderId || item.id,
                })
              }
              style={styles.actionButton}
              disabled={!isCheckedIn}
            />
          </View>
        )}
      </GlassCard>
    );
  };

  const mapStops = stops.filter((s) => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)));

  return (
    <View style={styles.container}>
      <View style={styles.mapArea}>
        <MapView
          provider={PROVIDER_DEFAULT}
          style={styles.map}
          initialRegion={{
            latitude: location?.coords.latitude ?? 10.762622,
            longitude: location?.coords.longitude ?? 106.660172,
            latitudeDelta: 0.0922,
            longitudeDelta: 0.0421,
          }}
          showsUserLocation={true}
        >
          {mapStops.map((stop, index) => (
            <Marker
              key={stop.id}
              coordinate={{ latitude: Number(stop.lat), longitude: Number(stop.lng) }}
              title={`Điểm ${index + 1}: ${stop.stopType || stop.type || 'DELIVERY'}`}
              description={stop.address}
              pinColor={stop.status === 'COMPLETED' ? colors.success : colors.warning}
            />
          ))}
          {mapStops.length > 1 && (
            <Polyline
              coordinates={mapStops.map((s) => ({ latitude: Number(s.lat), longitude: Number(s.lng) }))}
              strokeColor={colors.primary}
              strokeWidth={3}
            />
          )}
        </MapView>
      </View>

      {loading ? (
        <View style={[styles.list, { alignItems: 'center', paddingTop: 40 }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={stops}
          keyExtractor={(item) => item.id}
          renderItem={renderStop}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={[typography.body1, { color: colors.textMuted, textAlign: 'center' }]}>
              Chưa có điểm dừng nào cho chuyến xe này.
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  emptyContainer: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  mapArea: { height: 250, backgroundColor: colors.surface },
  map: { width: '100%', height: '100%' },
  list: { padding: 16 },
  stopCard: { marginBottom: 16 },
  stopHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  address: { color: colors.textMuted, marginLeft: 24, marginBottom: 16 },
  actions: { marginLeft: 24, gap: 12 },
  actionButton: { marginBottom: 8 },
});
