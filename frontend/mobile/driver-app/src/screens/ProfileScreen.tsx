import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { GlassCard } from '../components/GlassCard';
import { NeonButton } from '../components/NeonButton'; // kept for backward compat
import { auth } from '../lib/auth';
import api from '../lib/api';

export default function ProfileScreen({ navigation }: any) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await api.get('/driver-app/profile');
      setProfile(res.data);
    } catch (err: any) {
      console.error('Failed to fetch profile:', err);
      Alert.alert('Lỗi', err.response?.data?.message || 'Không thể tải thông tin tài xế.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await auth.removeToken();
    navigation.replace('Login');
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={[typography.h1, styles.title]}>Driver Profile</Text>
      <GlassCard style={styles.card}>
        <Text style={[typography.h3, { color: colors.text }]}>
          {profile?.fullName || 'Unknown Driver'}
        </Text>
        <Text style={[typography.body1, { color: colors.textMuted, marginTop: 4 }]}>
          Email: {profile?.email || 'N/A'}
        </Text>
        <Text style={[typography.body1, { color: colors.textMuted, marginTop: 4 }]}>
          License: {profile?.licenseClass || 'N/A'}
        </Text>
        <Text style={[typography.body2, { color: colors.success, marginTop: 12 }]}>
          Status: {profile?.status || 'Unknown'}
        </Text>
        {!profile && (
          <NeonButton title="Retry" onPress={fetchProfile} style={{ marginTop: 16 }} />
        )}
      </GlassCard>

      <NeonButton 
        title="Logout" 
        variant="danger" 
        onPress={handleLogout} 
        style={styles.logoutBtn} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: colors.text,
    marginBottom: 24,
    marginTop: 16,
  },
  card: {
    marginBottom: 32,
  },
  logoutBtn: {
    marginTop: 'auto',
    marginBottom: 20,
  }
});
