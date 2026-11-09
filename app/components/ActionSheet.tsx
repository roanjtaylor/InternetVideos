import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/lib/theme';

export type SheetAction = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /** Replaces the icon with a picture (a channel logo). */
  image?: string | null;
  destructive?: boolean;
  selected?: boolean;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  title?: string;
  actions: SheetAction[];
  onClose: () => void;
};

/** YouTube's bottom action sheet: a grabber, then one row per action. */
export function ActionSheet({ visible, title, actions, onClose }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: t.dark ? '#212121' : '#fff', paddingBottom: insets.bottom + 8 }]}>
        <View style={[styles.grabber, { backgroundColor: t.secondary }]} />
        {!!title && (
          <Text style={[styles.title, { color: t.secondary }]} numberOfLines={2}>
            {title}
          </Text>
        )}
        {actions.map((a) => (
          <Pressable
            key={a.key}
            onPress={() => {
              onClose();
              setTimeout(a.onPress, 0);
            }}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.surface }]}>
            {a.image ? (
              <Image source={{ uri: a.image }} style={styles.image} />
            ) : (
              <Ionicons name={a.icon} size={24} color={a.destructive ? t.danger : t.text} style={{ width: 32 }} />
            )}
            <Text style={[styles.label, { color: a.destructive ? t.danger : t.text }]}>{a.label}</Text>
            {a.selected && <Ionicons name="checkmark" size={22} color={t.text} />}
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  image: { width: 32, height: 32, borderRadius: 16 },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    elevation: 16,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, opacity: 0.5, marginBottom: 8 },
  title: { fontSize: 13, paddingHorizontal: 20, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 16 },
  label: { fontSize: 16, flex: 1 },
});
