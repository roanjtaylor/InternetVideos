import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import React from 'react';

import { useTheme } from '@/lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** YouTube's tab bar: filled icon when selected, outline otherwise, tiny label. */
function icon(filled: IconName, outline: IconName) {
  const TabIcon = ({ color, focused }: { color: string; focused: boolean }) => (
    <Ionicons name={focused ? filled : outline} size={24} color={color} />
  );
  return TabIcon;
}

export default function TabLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.text,
        tabBarInactiveTintColor: t.text,
        tabBarStyle: { backgroundColor: t.background, borderTopColor: t.divider },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '400' },
        headerShadowVisible: false,
        headerTintColor: t.text,
        headerStyle: { backgroundColor: t.background },
        headerTitleStyle: { fontSize: 20, fontWeight: '700' },
        headerTitleAlign: 'left',
        sceneStyle: { backgroundColor: t.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Playlists', tabBarLabel: 'Home', tabBarIcon: icon('home', 'home-outline') }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: 'Search', headerShown: false, tabBarIcon: icon('search', 'search-outline') }}
      />
      <Tabs.Screen
        name="subscriptions"
        options={{ title: 'Subscriptions', tabBarIcon: icon('people', 'people-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'You', tabBarIcon: icon('person-circle', 'person-circle-outline') }}
      />
    </Tabs>
  );
}
