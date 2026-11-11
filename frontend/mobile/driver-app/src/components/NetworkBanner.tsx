import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { useNetwork } from '../contexts/NetworkContext';

export const NetworkBanner = () => {
  const { isOnline } = useNetwork();

  if (isOnline) return null;

  return (
    <View style={styles.container}>
      <Text style={[typography.caption, styles.text]}>
        Offline Mode - Sync will resume when online
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.warning,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#000',
    fontWeight: '700',
  }
});
