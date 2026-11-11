import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet } from 'react-native';
import { SCREEN_NAMES } from './SCREEN_NAMES';
import { colors } from '../theme/colors';
import HomeScreen from '../screens/HomeScreen';
import TripsScreen from '../screens/TripsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SafetyScreen from '../screens/SafetyScreen';

const Tab = createBottomTabNavigator();

const TabBarIcon = ({ focused, label }: { focused: boolean; label: string }) => {
  return (
    <View style={[styles.icon, focused && styles.iconActive]}>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
    </View>
  );
};

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarIcon: ({ focused }) => {
          return <TabBarIcon focused={focused} label={route.name} />;
        },
      })}
    >
      <Tab.Screen name={SCREEN_NAMES.HOME} component={HomeScreen} />
      <Tab.Screen name={SCREEN_NAMES.TRIPS} component={TripsScreen} />
      <Tab.Screen name={SCREEN_NAMES.SAFETY} component={SafetyScreen} />
      <Tab.Screen name={SCREEN_NAMES.PROFILE} component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    borderTopColor: colors.slate[200],
    backgroundColor: colors.white,
    elevation: 2,
    height: 60,
    paddingBottom: 8,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActive: {},
  tabLabel: {
    fontSize: 12,
    color: colors['ink-soft'],
    fontWeight: '600',
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
});
