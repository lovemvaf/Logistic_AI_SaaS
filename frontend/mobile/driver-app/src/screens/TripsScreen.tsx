import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { GlassCard } from '../components/GlassCard';
import api from '../lib/api';

export default function TripsScreen({ navigation }: any) {
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrips();
  }, []);

  const fetchTrips = async () => {
    setLoading(true);
    try {
      const res = await api.get('/mobile/trips');
      if (res.data) {
        const data = Array.isArray(res.data) ? res.data : (res.data.data || []);
        setTrips(data);
      }
    } catch (error: any) {
      console.error('Failed to fetch trips', error);
      setTrips([]);
      Alert.alert('Error', error.response?.data?.message || 'Unable to load trip list.');
    } finally {
      setLoading(false);
    }
  };

  const renderTrip = ({ item }: { item: any }) => (
    <TouchableOpacity onPress={() => navigation.navigate('TripDetail', { tripId: item.id })}>
      <GlassCard style={styles.tripCard}>
        <View style={styles.tripHeader}>
          <Text style={[typography.h3, { color: colors.text }]}>{item.tripCode}</Text>
          <View style={styles.statusBadge}>
            <Text style={[typography.caption, { color: colors.primary }]}>{item.status}</Text>
          </View>
        </View>
        <Text style={[typography.body2, { color: colors.textMuted, marginTop: 8 }]}>
          {item.origin} {'->'} {item.destination}
        </Text>
      </GlassCard>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={[typography.h1, styles.title]}>My Trips</Text>
      
      {loading ? (
        <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={trips}
          keyExtractor={item => item.id}
          renderItem={renderTrip}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={
            <Text style={[typography.body1, { color: colors.textMuted, textAlign: 'center', marginTop: 40 }]}>
              No trips assigned.
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    color: colors.text,
    marginBottom: 20,
    marginTop: 8,
  },
  tripCard: {
    marginBottom: 16,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    backgroundColor: colors.primary + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  }
});
