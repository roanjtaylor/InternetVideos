import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VideoList } from '@/components/VideoList';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/theme';

const RECENT_KEY = 'recent-searches';
const MAX_RECENT = 10;

export default function SearchScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [focused, setFocused] = useState(true);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((raw) => raw && setRecent((JSON.parse(raw) as string[]).slice(0, MAX_RECENT)))
      .catch(() => {});
  }, []);

  // YouTube-style autocomplete: debounce keystrokes, ignore stale answers.
  useEffect(() => {
    const q = draft.trim();
    if (!q) {
      setSuggestions([]);
      return;
    }
    let alive = true;
    const id = setTimeout(() => {
      api
        .suggestions(q)
        .then((s) => alive && setSuggestions(s))
        .catch(() => alive && setSuggestions([]));
    }, 150);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [draft]);

  const submit = useCallback(
    (text: string) => {
      const q = text.trim();
      if (!q) return;
      Keyboard.dismiss();
      setDraft(q);
      setQuery(q);
      setFocused(false);
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
  const load = useCallback((page?: string | null) => api.search(query, page), [query]);

  const typing = draft.trim().length > 0;
  const showList = focused || !query;
  const rows = typing ? suggestions : recent;

  // YouTube bolds what the suggestion adds beyond what you have typed.
  const label = (q: string) => {
    const d = draft.trim();
    if (typing && q.toLowerCase().startsWith(d.toLowerCase())) {
      return (
        <Text style={[styles.rowText, { color: t.text }]} numberOfLines={1}>
          {q.slice(0, d.length)}
          <Text style={{ fontWeight: '700' }}>{q.slice(d.length)}</Text>
        </Text>
      );
    }
    return (
      <Text style={[styles.rowText, { color: t.text }]} numberOfLines={1}>
        {q}
      </Text>
    );
  };

  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: t.background }}>
      <View style={styles.barRow}>
        <Pressable
          hitSlop={8}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.back, pressed && { backgroundColor: t.surface }]}>
          <Ionicons name="arrow-back" size={24} color={t.text} />
        </Pressable>
        <View style={[styles.pill, { backgroundColor: t.surface }]}>
          <TextInput
            ref={input}
            autoFocus
            value={draft}
            onChangeText={setDraft}
            onFocus={() => setFocused(true)}
            onSubmitEditing={() => submit(draft)}
            placeholder="Search YouTube"
            placeholderTextColor={t.secondary}
            returnKeyType="search"
            enterKeyHint="search"
            autoCorrect={false}
            autoCapitalize="none"
            selectionColor={t.text}
            cursorColor={t.text}
            style={[styles.input, { color: t.text }]}
          />
          {!!draft && (
            <Pressable
              hitSlop={10}
              onPress={() => {
                setDraft('');
                setQuery('');
                setFocused(true);
                input.current?.focus();
              }}>
              <Ionicons name="close" size={22} color={t.text} />
            </Pressable>
          )}
        </View>
      </View>
      {showList ? (
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" style={{ flex: 1 }}>
          {rows.map((q) => (
            <Pressable
              key={q}
              onPress={() => submit(q)}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.surface }]}>
              {typing && <Ionicons name="search" size={22} color={t.text} />}
              {label(q)}
              {typing ? (
                <Pressable hitSlop={12} onPress={() => setDraft(q)} style={styles.insert}>
                  <Ionicons
                    name="arrow-up-outline"
                    size={22}
                    color={t.secondary}
                    style={{ transform: [{ rotate: '-45deg' }] }}
                  />
                </Pressable>
              ) : (
                <Pressable hitSlop={12} onPress={() => forget(q)} style={styles.insert}>
                  <Ionicons name="close" size={22} color={t.secondary} />
                </Pressable>
              )}
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <VideoList key={query} load={load} layout="card" emptyText="No results." />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 12, paddingLeft: 4, paddingVertical: 6 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, borderRadius: 20, paddingLeft: 16, paddingRight: 12 },
  input: { flex: 1, fontSize: 16, paddingVertical: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingLeft: 16, paddingRight: 4, minHeight: 48 },
  rowText: { flex: 1, fontSize: 16 },
  insert: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
