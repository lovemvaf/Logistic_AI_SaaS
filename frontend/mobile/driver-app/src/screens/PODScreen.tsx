import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import api from '../lib/api';
import { OfflineSyncEngine } from '../lib/offline-sync';
import { typography } from '../theme/typography';
import { colors } from '../theme/colors';
import { NeonButton } from '../components/NeonButton';
import { GlassCard } from '../components/GlassCard';

export default function PODScreen({ navigation, route }: any) {
  const deliveryId = route.params?.deliveryId ?? route.params?.stopId;
  const trackingCode = route.params?.trackingCode || 'N/A';
  const [permission, requestPermission] = useCameraPermissions();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'IDLE' | 'CAMERA_ACTIVE' | 'CAPTURED'>('IDLE');
  const cameraRef = useRef<any>(null);

  if (!deliveryId) {
    return (
      <View style={styles.container}>
        <Text style={[typography.body1, { color: colors.textMuted, textAlign: 'center', marginTop: 100 }]}>
          Không tìm thấy mã điểm giao hàng để xác nhận POD.
        </Text>
      </View>
    );
  }

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={[typography.body1, { color: colors.text, textAlign: 'center', marginTop: 100 }]}>
          Ứng dụng cần quyền truy cập camera để chụp ảnh xác nhận giao hàng.
        </Text>
        <NeonButton title="Cấp quyền camera" onPress={requestPermission} style={{ marginTop: 20 }} />
      </View>
    );
  }

  const handleCaptureAndUpload = async () => {
    if (!cameraRef.current) return;

    setLoading(true);
    let photo: any = null;
    const action = OfflineSyncEngine.createAction(`mobile/uploads/pod/${deliveryId}`, 'CREATE', {
      uri: '',
      name: `pod_${deliveryId}.jpg`,
      type: 'image/jpeg',
    });

    try {
      photo = await cameraRef.current.takePictureAsync({ quality: 0.5 });
      action.payload.uri = photo.uri;

      const formData = new FormData();
      formData.append('file', {
        uri: photo.uri,
        name: `pod_${deliveryId}.jpg`,
        type: 'image/jpeg',
      } as any);

      await api.post(`/mobile/uploads/pod/${deliveryId}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'X-Sync-Id': action.id,
        },
      });

      setStatus('CAPTURED');
      Alert.alert('Thành công', 'Đã tải ảnh bằng chứng giao hàng.');
    } catch {
      if (photo?.uri) {
        action.payload.uri = photo.uri;
        await OfflineSyncEngine.addToQueue(action);
        Alert.alert('Đã lưu ngoại tuyến', 'Ảnh POD sẽ được tự động tải lên khi có mạng.');
      } else {
        Alert.alert('Lỗi', 'Không thể chụp ảnh xác nhận giao hàng. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[typography.h1, { color: colors.text }]}>Xác nhận Giao hàng</Text>
        <Text style={[typography.body1, { color: colors.success, marginTop: 4 }]}>Mã vận đơn: {trackingCode}</Text>
      </View>

      <GlassCard style={styles.canvasContainer}>
        {status === 'CAPTURED' ? (
          <View style={styles.successView}>
            <Text style={[typography.h2, { color: colors.success }]}>Đã chụp ảnh và tải lên</Text>
          </View>
        ) : status === 'CAMERA_ACTIVE' ? (
          <CameraView style={styles.camera} ref={cameraRef} facing="back" />
        ) : (
          <View style={styles.placeholder}>
            <Text style={[typography.body1, { color: colors.textMuted }]}>Nhấn nút bên dưới để mở camera</Text>
          </View>
        )}
      </GlassCard>

      {status === 'IDLE' ? (
        <NeonButton
          title="MỞ CAMERA"
          onPress={() => setStatus('CAMERA_ACTIVE')}
        />
      ) : status === 'CAMERA_ACTIVE' ? (
        <NeonButton
          title="CHỤP ẢNH & XÁC NHẬN"
          onPress={handleCaptureAndUpload}
          loading={loading}
        />
      ) : (
        <NeonButton
          title="HOÀN TẤT CHUYẾN ĐI"
          variant="secondary"
          onPress={() => navigation.goBack()}
        />
      )}

      <Text style={[typography.caption, styles.footerNote]}>
        * Ảnh bằng chứng giao hàng được lưu trữ an toàn trên hệ thống.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20 },
  header: { marginBottom: 30 },
  canvasContainer: {
    height: 400,
    marginBottom: 30,
    padding: 0,
    overflow: 'hidden',
  },
  camera: { flex: 1, borderRadius: 16 },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  successView: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  footerNote: { color: colors.textMuted, textAlign: 'center', marginTop: 24 },
});
