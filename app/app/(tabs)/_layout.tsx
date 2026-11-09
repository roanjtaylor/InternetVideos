import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '@/lib/api';
import { googleAccount, useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type MciName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** YouTube's tab bar: filled icon when selected, outline otherwise, tiny label. */
function icon(filled: IconName, outline: IconName) {
  const TabIcon = ({ color, focused }: { color: string; focused: boolean }) => (
    <Ionicons name={focused ? filled : outline} size={24} color={color} />
  );
  return TabIcon;
}

/** Subscriptions uses YouTube's stack-of-videos-with-a-play-triangle mark. */
function mciIcon(filled: MciName, outline: MciName) {
  const TabIcon = ({ color, focused }: { color: string; focused: boolean }) => (
    <MaterialCommunityIcons name={focused ? filled : outline} size={25} color={color} />
  );
  return TabIcon;
}

/**
 * The label, drawn by us so it always fits: the stock one truncates
 * "Subscriptions" on a 375pt-wide phone. Shrinks the font slightly if needed.
 */
function label(text: string) {
  const TabLabel = ({ color }: { color: string }) => (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.75}
      allowFontScaling={false}
      style={[styles.label, { color }]}>
      {text}
    </Text>
  );
  return TabLabel;
}

/** Top-left brand mark: the app icon and "InternetVideos" in YouTube's heavy, tightly-tracked wordmark style. */
function HomeTitle() {
  const t = useTheme();
  return (
    <View style={styles.brand}>
      <Image source={require('../../assets/images/icon.png')} style={styles.logo} />
      <Text style={[styles.brandText, { color: t.text }]}>InternetVideos</Text>
    </View>
  );
}

function HomeSearchButton() {
  const t = useTheme();
  const router = useRouter();
  return (
    <Pressable
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Search"
      onPress={() => router.push('/search')}
      style={({ pressed }) => [styles.searchButton, pressed && { opacity: 0.6 }]}>
      <Ionicons name="search" size={24} color={t.text} />
    </Pressable>
  );
}

/** The You tab shows your Google avatar, ringed when selected, like YouTube. */
function AvatarIcon({ color, focused, uri }: { color: string; focused: boolean; uri: string | null }) {
  if (!uri) return <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={24} color={color} />;
  return (
    <View
      style={{
        width: 26,
        height: 26,
        borderRadius: 13,
        borderWidth: focused ? 2 : 0,
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Image source={{ uri }} style={{ width: focused ? 20 : 24, height: focused ? 20 : 24, borderRadius: 12 }} />
    </View>
  );
}

export default function TabLayout() {
  const t = useTheme();
  const { signedIn } = useAuth();
  const [avatar, setAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    (async () => {
      const [account, me] = await Promise.all([googleAccount().catch(() => null), api.me().catch(() => null)]);
      if (alive) setAvatar(account?.picture ?? me?.thumbnail ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [signedIn]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.text,
        tabBarInactiveTintColor: t.text,
        tabBarStyle: { backgroundColor: t.background, borderTopColor: t.divider },
        // No side padding on items so "Subscriptions" fits in one line on a small phone.
        tabBarItemStyle: { paddingHorizontal: 0 },
        headerShadowVisible: false,
        headerTintColor: t.text,
        headerStyle: { backgroundColor: t.background },
        headerTitleStyle: { fontSize: 20, fontWeight: '700' },
        headerTitleAlign: 'left',
        sceneStyle: { backgroundColor: t.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerTitle: () => <HomeTitle />,
          headerRight: () => <HomeSearchButton />,
          tabBarLabel: label('Home'), tabBarIcon: icon('home', 'home-outline'),
        }}
      />
      <Tabs.Screen
        name="subscriptions"
        options={{
          title: 'Subscriptions',
          tabBarLabel: label('Subscriptions'),
          tabBarIcon: mciIcon('play-box-multiple', 'play-box-multiple-outline'),
        }}
      />
      <Tabs.Screen
        name="playlists"
        options={{ title: 'Playlists', tabBarLabel: label('Playlists'), tabBarIcon: icon('albums', 'albums-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'You',
          tabBarLabel: label('You'),
          tabBarIcon: ({ color, focused }) => <AvatarIcon color={color} focused={focused} uri={avatar} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 10, fontWeight: '400', textAlign: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logo: { width: 28, height: 28, borderRadius: 6 },
  brandText: { fontSize: 22, fontWeight: '800', letterSpacing: -1.2 },
  searchButton: { marginRight: 16 },
});
