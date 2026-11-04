import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/lib/theme';

export type FilterOption<V extends string> = { key: V; label: string };

export type FilterGroup<V extends string = string> = {
  title: string;
  value: V;
  options: FilterOption<V>[];
  onChange: (value: V) => void;
};

type Props = {
  visible: boolean;
  title?: string;
  groups: FilterGroup<any>[];
  onClose: () => void;
};

/**
 * YouTube's sort-and-filter sheet: the page behind greys out at once (no
 * slide), then a grabber and one chip group per field.
 */
export function FilterSheet({ visible, title = 'Sort and filter', groups, onClose }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: t.dark ? '#212121' : '#fff', paddingBottom: insets.bottom + 12 }]}>
        <View style={[styles.grabber, { backgroundColor: t.secondary }]} />
        <View style={styles.header}>
          <Text style={[styles.title, { color: t.text }]}>{title}</Text>
          <Pressable hitSlop={8} onPress={onClose}>
            <Ionicons name="close" size={24} color={t.text} />
          </Pressable>
        </View>
        {groups.map((g) => (
          <View key={g.title} style={styles.group}>
            <Text style={[styles.groupTitle, { color: t.secondary }]}>{g.title}</Text>
            <View style={styles.chips}>
              {g.options.map((o) => {
                const on = g.value === o.key;
                return (
                  <Pressable
                    key={o.key}
                    onPress={() => g.onChange(o.key)}
                    style={[styles.chip, { backgroundColor: on ? t.text : t.surface }]}>
                    <Text style={[styles.chipText, { color: on ? t.background : t.text }]}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </Modal>
  );
}

/** The header button that opens a FilterSheet; a red dot marks a non-default choice. */
export function FilterButton({ active, onPress }: { active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel="Sort and filter"
      style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.5 }]}>
      <Ionicons name="options-outline" size={24} color={t.text} />
      {active && <View style={[styles.dot, { backgroundColor: t.red }]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, opacity: 0.5, marginBottom: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  title: { fontSize: 18, fontWeight: '600' },
  group: { paddingHorizontal: 20, paddingVertical: 10, gap: 10 },
  groupTitle: { fontSize: 13, fontWeight: '500' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 32, borderRadius: 8, paddingHorizontal: 12, justifyContent: 'center' },
  chipText: { fontSize: 14, fontWeight: '500' },
  headerBtn: { paddingHorizontal: 16, paddingVertical: 6 },
  dot: { position: 'absolute', top: 6, right: 14, width: 8, height: 8, borderRadius: 4 },
});
