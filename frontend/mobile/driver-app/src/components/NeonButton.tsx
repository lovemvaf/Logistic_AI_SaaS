import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle, ActivityIndicator } from 'react-native';
import { colors } from '../theme/colors';

interface NeonButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const NeonButton: React.FC<NeonButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
  textStyle,
}) => {
  const getVariantStyle = () => {
    switch (variant) {
      case 'secondary':
        return { container: { backgroundColor: colors.slate[100] }, text: { color: colors.ink } };
      case 'outline':
        return { container: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.slate[300] }, text: { color: colors.ink } };
      case 'danger':
        return { container: { backgroundColor: colors.rose[500] }, text: { color: colors.white } };
      default:
        return { container: { backgroundColor: colors.primary }, text: { color: colors.white } };
    }
  };

  const variantStyle = getVariantStyle();

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.button, variantStyle.container, style, disabled && { opacity: 0.5 }]}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={variantStyle.text.color} size="small" />
      ) : (
        <Text style={[styles.text, variantStyle.text, textStyle]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
  },
});
