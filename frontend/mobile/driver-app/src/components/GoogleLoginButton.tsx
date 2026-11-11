import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { colors } from '../theme/colors';
import { auth } from '../lib/auth';
import api from '../lib/api';

WebBrowser.maybeCompleteAsync();

interface GoogleLoginButtonProps {
  onPress?: () => void;
  tenantSlug?: string;
}

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export const GoogleLoginButton: React.FC<GoogleLoginButtonProps> = ({ onPress }) => {
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const clientId = process.env.GOOGLE_CLIENT_ID || '';
      const redirectUri = AuthSession.makeRedirectUri({
        useProxy: true,
      });

      // Generate PKCE code verifier and challenge
      const codeVerifier = Crypto.getRandomBytesAsync(32).then(bytes =>
        Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
      );
      const verifier = await codeVerifier;

      const codeChallenge = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        verifier,
        Crypto.CryptoDigestOptions.DIGEST_HEX
      );

      const codeChallengeMethod = AuthSession.CodeChallengeMethod.S256;

      const authUrl =
        `${discovery.authorizationEndpoint}` +
        `?client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&code_challenge=${codeChallenge}` +
        `&code_challenge_method=${codeChallengeMethod}` +
        `&scope=openid email profile` +
        `&access_type=offline`;

      const result = await AuthSession.startAsync({
        authUrl: authUrl,
        returnUrl: redirectUri,
      });

      if (result.type === 'success' && result.params.code) {
        // Exchange code for tokens
        const tokenResponse = await fetch(discovery.tokenEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: '',
            code: result.params.code,
            code_verifier: verifier,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
          }).toString(),
        });

        const tokenData = await tokenResponse.json();
        const idToken = tokenData.id_token;

        if (!idToken) {
          throw new Error('Failed to obtain ID token from Google');
        }

        // Send ID token to backend for verification
        const res = await api.post('/mobile/auth/google', {
          credential: idToken,
        }, {
          headers: { 'x-tenant-slug': '' },
        });

        if (res.data?.accessToken) {
          await auth.setToken(res.data.accessToken);
          onPress?.();
        }
      }
    } catch (error: any) {
      console.error('Google login error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={handleGoogleLogin}
      disabled={loading}
      style={[styles.button, loading && styles.buttonDisabled]}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={colors.ink} size="small" />
      ) : (
        <>
          <View style={styles.googleIcon}>
            <Text style={styles.googleText}>G</Text>
          </View>
          <Text style={styles.buttonText}>Sign in with Google</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.slate[300],
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: colors.white,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  googleIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '500',
  },
});
