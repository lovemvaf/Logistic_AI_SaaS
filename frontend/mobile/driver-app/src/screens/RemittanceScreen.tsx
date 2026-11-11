import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { postWithOffline } from '../lib/offline-utils';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { GlassCard } from '../components/GlassCard';
import { NeonButton } from '../components/NeonButton'; // kept for backward compat

export default function RemittanceScreen({ navigation }: any) {
  const [totalCod, setTotalCod] = useState('');
  const [expenses, setExpenses] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [remittanceData, setRemittanceData] = useState<any>(null);

  const calculateAmount = () => {
    const cod = parseFloat(totalCod) || 0;
    const exp = parseFloat(expenses) || 0;
    return cod - exp;
  };

  const handleRemit = async () => {
    const amount = calculateAmount();
    if (amount <= 0) {
      Alert.alert('Lỗi', 'Số tiền nộp phải lớn hơn 0.');
      return;
    }

    setSubmitting(true);
    try {
const response = await postWithOffline('driver-app/remittance', {
          totalCod: parseFloat(totalCod),
          expenses: parseFloat(expenses),
          amount: amount
        });
      setRemittanceData(response.data);
      setShowQR(true);
      Alert.alert('Success', 'Remittance request sent. Please present the QR code to the cashier.');
    } catch (e: any) {
      console.warn('API Error:', e);
      Alert.alert('Lỗi', e.response?.data?.message || 'Unable to generate reconciliation code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (showQR) {
    return (
      <View style={[styles.container, styles.center]}>
        <GlassCard style={styles.card}>
          <Text style={[typography.h2, { color: colors.text, textAlign: 'center' }]}>MÃ ĐỐI SOÁT</Text>
          <View style={styles.qrPlaceholder}>
             <Text style={{ color: colors.textMuted, fontSize: 12 }}>Scan this code at the counter</Text>
             <Text style={{ color: colors.primary, fontWeight: 'bold', marginTop: 10, fontSize: 16 }}>{remittanceData?.qrCodeToken || 'N/A'}</Text>
             <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 5 }}>Show this to the cashier</Text>
          </View>
          <Text style={[typography.body1, { color: colors.text, textAlign: 'center', marginTop: 20 }]}>
            Số tiền cần nộp:
          </Text>
          <Text style={[typography.h1, { color: colors.success, textAlign: 'center', marginVertical: 10 }]}>
            {calculateAmount().toLocaleString()} VND
          </Text>
          <NeonButton title="Back" onPress={() => navigation.goBack()} style={{ marginTop: 20 }} />
        </GlassCard>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <GlassCard style={styles.card}>
        <Text style={[typography.h2, { color: colors.text, marginBottom: 16 }]}>Đối soát Tiền mặt</Text>
        
        <Text style={[typography.body2, { color: colors.textMuted, marginBottom: 8 }]}>Total COD Collected:</Text>
        <TextInput 
          style={styles.input}
          keyboardType="numeric"
          placeholder="VD: 5000000"
          placeholderTextColor={colors.border}
          value={totalCod}
          onChangeText={setTotalCod}
        />

        <Text style={[typography.body2, { color: colors.textMuted, marginBottom: 8 }]}>Tổng chi phí khấu trừ (nếu có):</Text>
        <TextInput 
          style={styles.input}
          keyboardType="numeric"
          placeholder="VD: 200000"
          placeholderTextColor={colors.border}
          value={expenses}
          onChangeText={setExpenses}
        />

        <View style={styles.summaryContainer}>
           <Text style={[typography.body1, { color: colors.text }]}>Thực nộp về kho:</Text>
           <Text style={[typography.h2, { color: colors.success }]}>{calculateAmount().toLocaleString()} VND</Text>
        </View>

        <NeonButton 
          title={submitting ? "ĐANG XỬ LÝ..." : "TẠO MÃ NỘP TIỀN"}
          onPress={handleRemit}
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
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    padding: 20,
    width: '100%',
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
  },
  summaryContainer: {
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  qrPlaceholder: {
    width: 200,
    height: 200,
    backgroundColor: 'white',
    borderRadius: 12,
    alignSelf: 'center',
    marginTop: 20,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
