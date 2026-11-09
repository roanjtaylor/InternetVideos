import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { VideoRow } from '@/components/VideoList';
import { QuotaDonut } from '@/components/QuotaDonut';
import { Skeleton } from '@/components/Skeleton';
import { api, Me, timeAgo } from '@/lib/api';
import { useWatchHistory } from '@/lib/history';
import { GoogleAccount, googleAccount, signOut } from '@/lib/auth';
import { useLoadingBar } from '@/lib/loading';
import { useTheme } from '@/lib/theme';

/**
 * You: the signed-in Google account and YouTube channel, today's API quota
 * as a chart, your watch history, cache and sign-out controls.
 */
export default function ProfileScreen() {
  const t = useTheme();
  const router = useRouter();
  const history = useWatchHistory();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [account, setAccount] = useState<GoogleAccount | null | undefined>(undefined);
  const [quota, setQuota] = useState(api.quota());
  const [refreshing, setRefreshing] = useState(false);
  useLoadingBar(me === undefined);

  const load = useCallback(async () => {
    const [m, a] = await Promise.all([api.me().catch(() => null), googleAccount().catch(() => null)]);
    setMe(m);
    setAccount(a);
    await api.quotaReady;
    setQuota(api.quota());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The quota moves as other tabs fetch; re-read it every time this tab shows.
  useFocusEffect(
    useCallback(() => {
      api.quotaReady.then(() => setQuota(api.quota()));
    }, []),
  );

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);

  const clearCache = async () => {
    await api.refresh();
    Alert.alert('Cache cleared', 'The next view of each tab fetches fresh data.');
  };

  const name = account?.name ?? me?.title;
  const picture = account?.picture ?? me?.thumbnail;

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 80 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={t.secondary}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }>
      <View style={styles.account}>
        {me === undefined ? (
          <>
            <Skeleton style={styles.avatar} />
            <View style={{ flex: 1, gap: 8 }}>
              <Skeleton style={{ height: 18, width: '60%' }} />
              <Skeleton style={{ height: 12, width: '45%' }} />
            </View>
          </>
        ) : (
          <>
            {picture ? (
              <Image source={{ uri: picture }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: t.surfaceHigh }]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
                {name ?? 'Signed in'}
              </Text>
              {!!me?.handle && (
                <Text style={[styles.sub, { color: t.secondary }]} numberOfLines={1}>
                  {me.handle}
                </Text>
              )}
              {account?.email ? (
                <Text style={[styles.sub, { color: t.secondary }]} numberOfLines={1}>
                  {account.email}
                </Text>
              ) : (
                account === null && (
                  <Text style={[styles.sub, { color: t.secondary }]}>
                    Sign out and in again to show your Google account email.
                  </Text>
                )
              )}
            </View>
          </>
        )}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={[styles.cardTitle, { color: t.text, flex: 1 }]}>History</Text>
        {!!history && history.length > 0 && (
          <Pressable hitSlop={8} onPress={() => router.push('/history')}>
            <Text style={{ color: t.link, fontSize: 14, fontWeight: '600' }}>View all</Text>
          </Pressable>
        )}
      </View>
      {history === null || history.length === 0 ? (
        <Text style={[styles.sub, { color: t.secondary, paddingHorizontal: 16, paddingBottom: 16 }]}>
          Videos you watch in this app appear here, newest first.
        </Text>
      ) : (
        history.slice(0, 5).map((e) => (
          <View key={e.video.id}>
            <VideoRow video={e.video} />
            <Text style={[styles.watched, { color: t.secondary }]}>Watched {timeAgo(e.watchedAt)}</Text>
          </View>
        ))
      )}

      <View style={[styles.card, { backgroundColor: t.surface }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: t.text }]}>YouTube API quota</Text>
          <Text style={[styles.sub, { color: t.secondary }]}>
            {quota.used.toLocaleString()} of {quota.limit.toLocaleString()} units today
          </Text>
        </View>
        <QuotaDonut quota={quota} />
        <Text style={[styles.note, { color: t.secondary }]}>
          Counted on this phone. Resets at midnight Pacific time. A search costs 100 units, a save or like 50,
          listing playlists and channels about 1 per page.
        </Text>
      </View>

      <Row icon="refresh-outline" label="Clear cached data" onPress={clearCache} />
      <Row icon="log-out-outline" label="Sign out" onPress={confirmSignOut} destructive />
    </ScrollView>
  );
}

function Row({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const t = useTheme();
  const color = destructive ? t.danger : t.text;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.surface }]}>
      <Ionicons name={icon} size={24} color={color} style={{ width: 32 }} />
      <Text style={[styles.rowText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  account: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  name: { fontSize: 22, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2 },
  card: { marginHorizontal: 16, marginTop: 8, marginBottom: 16, borderRadius: 12, padding: 16, gap: 16 },
  cardHeader: { gap: 2 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  note: { fontSize: 12, lineHeight: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  watched: { fontSize: 11, marginLeft: 184, marginTop: -6, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowText: { fontSize: 16 },
});
