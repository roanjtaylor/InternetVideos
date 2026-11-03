import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VideoList } from '@/components/VideoList';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/theme';

const RECENT_KEY = 'recent-searches';
const MAX_RECENT = 12;

export default function SearchScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((raw) => raw && setRecent(JSON.parse(raw)))
      .catch(() => {});
  }, []);

  const submit = useCallback(
    (text: string) => {
      const q = text.trim();
      if (!q) return;
      setDraft(q);
      setQuery(q);
      const next = [q, ...recent.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENT);
      setRecent(next);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
    },
    [recent],
  );

  const forget = (q: string) => {
    const next = recent.filter((r) => r !== q);
    setRecent(next);
    AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
  };

  // Only fires on submit: each new query costs 100 quota units.
  const load = useCallback(async () => (await api.search(query)).videos, [query]);

  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <View style={styles.barRow}>
        <View style={[styles.pill, { backgroundColor: t.surface }]}>
          <Ionicons name="search" size={18} color={t.secondary} />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => submit(draft)}
            placeholder="Search YouTube"
            placeholderTextColor={t.secondary}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            style={[styles.input, { color: t.text }]}
          />
          {!!draft && (
            <Pressable
              hitSlop={8}
              onPress={() => {
                setDraft('');
                setQuery('');
              }}>
              <Ionicons name="close-circle" size={18} color={t.secondary} />
            </Pressable>
          )}
        </View>
      </View>
      {query ? (
        <VideoList key={query} load={load} emptyText="No results." queueTitle={`Search: ${query}`} />
      ) : (
        <View style={{ flex: 1 }}>
          {recent.map((q) => (
            <Pressable
              key={q}
              onPress={() => submit(q)}
              style={({ pressed }) => [styles.recentRow, pressed && { backgroundColor: t.surface }]}>
              <Ionicons name="time-outline" size={22} color={t.secondary} />
              <Text style={[styles.recentText, { color: t.text }]} numberOfLines={1}>
                {q}
              </Text>
              <Pressable hitSlop={10} onPress={() => forget(q)}>
                <Ionicons name="close" size={20} color={t.secondary} />
              </Pressable>
            </Pressable>
          ))}
          {recent.length === 0 && (
            <View style={styles.center}>
              <Text style={{ color: t.secondary }}>Type what you came here for.</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  barRow: { paddingHorizontal: 12, paddingVertical: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, borderRadius: 20, paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 16, paddingVertical: 0 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 12 },
  recentText: { flex: 1, fontSize: 15 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
