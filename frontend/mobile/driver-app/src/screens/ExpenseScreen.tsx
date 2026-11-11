import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Alert } from 'react-native';
import { postWithOffline } from '../lib/offline-utils';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { GlassCard } from '../components/GlassCard';
import { NeonButton } from '../components/NeonButton'; // kept for backward compat

export default function ExpenseScreen({ navigation }: any) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [expenseType, setExpenseType] = useState('FUEL');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!amount || !description) {
      Alert.alert('Lỗi', 'Vui lòng nhập số tiền và mô tả.');
      return;
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Lỗi', 'Số tiền chi phí phải lớn hơn 0.');
      return;
    }

    setSubmitting(true);
    try {
      await postWithOffline('driver-app/expenses', {
        category: expenseType,
        amount: parsedAmount,
        note: description
      });
      Alert.alert('Thành công', 'Đã báo cáo chi phí.');
      navigation.goBack();
    } catch (e: any) {
      console.warn('API Error:', e);
      Alert.alert('Lỗi', e.response?.data?.message || 'Không thể báo cáo chi phí. Vui lòng kiểm tra kết nối mạng.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <GlassCard style={styles.card}>
        <Text style={[typography.h2, { color: colors.text, marginBottom: 16 }]}>Expense Report</Text>
        
        <Text style={[typography.body2, { color: colors.textMuted, marginBottom: 8 }]}>Loại chi phí:</Text>
        <View style={styles.typeSelector}>
          {['FUEL', 'TOLL', 'REPAIR', 'OTHER'].map(type => (
            <NeonButton
              key={type}
              title={type}
              variant={expenseType === type ? 'primary' : 'secondary'}
              onPress={() => setExpenseType(type)}
              style={styles.typeButton}
            />
          ))}
        </View>

        <Text style={[typography.body2, { color: colors.textMuted, marginBottom: 8 }]}>Số tiền (VND):</Text>
        <TextInput 
          style={styles.input}
          keyboardType="numeric"
          placeholder="VD: 500000"
          placeholderTextColor={colors.border}
          value={amount}
          onChangeText={setAmount}
        />

        <Text style={[typography.body2, { color: colors.textMuted, marginBottom: 8 }]}>Mô tả / Ghi chú:</Text>
        <TextInput 
          style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
          multiline
          placeholder="VD: Đổ xăng tại trạm ABC"
          placeholderTextColor={colors.border}
          value={description}
          onChangeText={setDescription}
        />

        <NeonButton 
          title={submitting ? "ĐANG GỬI..." : "GỬI BÁO CÁO"}
          onPress={handleSubmit}
          loading={submitting}
          disabled={submitting}
          style={{ marginTop: 24 }}
        />
      </GlassCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  card: {
    padding: 20,
  },
  typeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  typeButton: {
    flex: 1,
    minWidth: '40%',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
    fontSize: 16,
  }
});
