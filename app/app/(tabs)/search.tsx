import React, { useCallback, useState } from 'react';
import { StyleSheet, TextInput, useColorScheme } from 'react-native';

import { VideoList } from '@/components/VideoList';
import { Text, View } from '@/components/Themed';
import { api } from '@/lib/api';

export default function SearchScreen() {
  const scheme = useColorScheme();
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');

  // Only fires when the user submits: each new query costs 100 quota units.
  const load = useCallback(async () => (await api.search(query)).videos, [query]);

  return (
    <View style={{ flex: 1 }}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={() => setQuery(draft.trim())}
        placeholder="Search YouTube"
        placeholderTextColor="#888"
        returnKeyType="search"
        autoCorrect={false}
        style={[
          styles.input,
          scheme === 'dark' ? { backgroundColor: '#222', color: '#fff' } : { backgroundColor: '#eee', color: '#000' },
        ]}
      />
      {query ? (
        <VideoList key={query} load={load} emptyText="No results." />
      ) : (
        <View style={styles.center}>
          <Text style={{ color: '#888' }}>Type what you came here for.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { margin: 12, padding: 12, borderRadius: 10, fontSize: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
