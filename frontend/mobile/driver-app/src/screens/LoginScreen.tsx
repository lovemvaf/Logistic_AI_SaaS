import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, Alert, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { CustomInput } from '../components/CustomInput';
import { ActionButton } from '../components/ActionButton';
import { SurfaceCard } from '../components/SurfaceCard';
import { auth } from '../lib/auth';
import { GoogleLoginButton } from '../components/GoogleLoginButton';
import api from '../lib/api';

export default function LoginScreen({ navigation }: any) {
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!slug) {
      Alert.alert('Error', 'Please enter your workspace slug.');
      return;
    }
    if (!email || !password) {
      Alert.alert('Error', 'Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post(
        '/mobile/auth/login',
        { email, password },
        { headers: { 'x-tenant-slug': slug } }
      );

      if (res.data && res.data.accessToken) {
        await auth.setToken(res.data.accessToken);
        navigation.replace('MainTabs');
      } else {
        throw new Error('Token not received');
      }
    } catch (err: any) {
      console.warn('Login Error:', err);
      Alert.alert('Login Error', err.response?.data?.message || 'Unable to login. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    Alert.alert('Reset Password', 'Please contact your administrator to reset your password.');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={[typography.h1, styles.title]}>SmartLogi Driver</Text>
        <Text style={[typography.body1, styles.subtitle]}>Welcome back. Sign in to view your trips.</Text>

        <SurfaceCard padding={20}>
          <CustomInput
            label="Workspace ID"
            placeholder="smartlogi"
            autoCapitalize="none"
            value={slug}
            onChangeText={setSlug}
          />
          <CustomInput
            label="Email"
            placeholder="john@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
          <CustomInput
            label="Password"
            placeholder="Enter password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotLink}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          <GoogleLoginButton onPress={() => navigation.replace('MainTabs')} tenantSlug={slug} />

          <ActionButton
            title="LOGIN"
            onPress={handleLogin}
            loading={loading}
            style={{ marginTop: 8 }}
          />
        </SurfaceCard>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: colors.ink,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: colors['ink-soft'],
    textAlign: 'center',
    marginBottom: 40,
  },
  forgotLink: {
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  forgotText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '500',
  },
});
