import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/LoginScreen';
import TabNavigator from './TabNavigator';
import TripDetailScreen from '../screens/TripDetailScreen';
import PODScreen from '../screens/PODScreen';
import ExpenseScreen from '../screens/ExpenseScreen';
import RemittanceScreen from '../screens/RemittanceScreen';
import SafetyScreen from '../screens/SafetyScreen';
import TelematicsScreen from '../screens/TelematicsScreen';
import { SCREEN_NAMES } from './SCREEN_NAMES';
import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator();

export const RootNavigator = () => {
  return (
    <Stack.Navigator
      initialRouteName={SCREEN_NAMES.LOGIN}
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name={SCREEN_NAMES.LOGIN} component={LoginScreen} options={{ headerShown: false }} />
      <Stack.Screen name={SCREEN_NAMES.HOME} component={TabNavigator} options={{ headerShown: false }} />
      <Stack.Screen name={SCREEN_NAMES.TRIP_DETAIL} component={TripDetailScreen} options={{ title: 'Trip Details' }} />
      <Stack.Screen name={SCREEN_NAMES.POD} component={PODScreen} options={{ title: 'Proof of Delivery', presentation: 'modal' }} />
      <Stack.Screen name={SCREEN_NAMES.EXPENSE} component={ExpenseScreen} options={{ title: 'Report Expense' }} />
      <Stack.Screen name={SCREEN_NAMES.REMITTANCE} component={RemittanceScreen} options={{ title: 'COD Remittance' }} />
      <Stack.Screen name={SCREEN_NAMES.SAFETY} component={SafetyScreen} options={{ title: 'Driver Safety' }} />
      <Stack.Screen name={SCREEN_NAMES.TELEMATICS} component={TelematicsScreen} options={{ title: 'Telematics Analysis' }} />
    </Stack.Navigator>
  );
};
