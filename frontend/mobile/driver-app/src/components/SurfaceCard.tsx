import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';

interface SurfaceCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: number;
}

export const SurfaceCard: React.FC<SurfaceCardProps> = ({ children, style, padding = 16 }) => {
  return (
    <View
      style={[
        styles.card,
        { padding, backgroundColor: colors.white, borderColor: colors.surfaceBorder },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
});
