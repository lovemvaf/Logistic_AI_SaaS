import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { RootNavigator } from './src/navigation/RootNavigator';
import { NetworkBanner } from './src/components/NetworkBanner';
import { NetworkProvider } from './src/contexts/NetworkContext';
import { registerForPushNotificationsAsync } from './src/lib/notifications';

export default function App() {
  useEffect(() => {
    registerForPushNotificationsAsync().then(token => console.log('Init Token:', token));
  }, []);

  return (
    <NetworkProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <NetworkBanner />
        <RootNavigator />
      </NavigationContainer>
    </NetworkProvider>
  );
}
