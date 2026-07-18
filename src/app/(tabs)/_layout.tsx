import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import { colors, fonts } from '@/constants/theme';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>{emoji}</Text>;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.cardBorder,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.bodySemiBold,
          fontSize: 11,
          letterSpacing: 0.3,
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🥂" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="bars"
        options={{
          title: 'Bars',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📍" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🪪" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="dex"
        options={{
          title: 'Dex',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🍸" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
