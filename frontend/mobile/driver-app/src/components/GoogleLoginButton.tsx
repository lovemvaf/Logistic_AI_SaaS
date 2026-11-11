import React, { useEffect, useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { colors } from '../theme/colors';
import { auth } from '../lib/auth';
import api from '../lib/api';

WebBrowser.maybeCompleteAuthSession();

interface GoogleLoginButtonProps {
  onPress?: () => void;
  tenantSlug?: string;
}

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export const GoogleLoginButton: React.FC<GoogleLoginButtonProps> = ({ onPress, tenantSlug }) => {
  const [loading, setLoading] = useState(false);

  const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'smartlogi-driver',
    path: 'oauthredirect',
  });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId,
      scopes: ['openid', 'email', 'profile'],
      redirectUri,
      usePKCE: true,
    },
    discovery,
  );

  useEffect(() => {
    if (response?.type !== 'success') return;
    const code = response.params?.code;
    if (!code) return;

    let active = true;
    (async () => {
      setLoading(true);
      try {
        const tokenData = await AuthSession.exchangeCodeAsync(
          {
            code,
            clientId,
            redirectUri,
            extraParams: request?.codeVerifier ? { code_verifier: request.codeVerifier } : undefined,
          },
          discovery,
        );

        const idToken = tokenData.idToken;
        if (!idToken) {
          throw new Error('Failed to obtain ID token from Google');
        }

        const res = await api.post(
          '/mobile/auth/google',
          { credential: idToken },
          { headers: { 'x-tenant-slug': tenantSlug ?? '' } },
        );

        if (active && res.data?.accessToken) {
          await auth.setToken(res.data.accessToken);
          onPress?.();
        }
      } catch (error: unknown) {
        console.error('Google login error:', error);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [response, clientId, redirectUri, request, tenantSlug, onPress]);

  const handleGoogleLogin = () => {
    if (!request) return;
    void promptAsync();
  };

  return (
    <TouchableOpacity
      onPress={handleGoogleLogin}
      disabled={loading || !request}
      style={[styles.button, (loading || !request) && styles.buttonDisabled]}
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
