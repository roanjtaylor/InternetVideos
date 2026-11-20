import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { askGemini, GEMINI_KEY, Stage, SUGGESTIONS, Turn } from '@/lib/gemini';
import { useTheme } from '@/lib/theme';

type Props = { visible: boolean; videoId: string; title: string; onClose: () => void; onSeek?: (seconds: number) => void };

const TIMESTAMP = /\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/g;

/** Split text so every m:ss / h:mm:ss becomes a tappable link that seeks the video. */
function linkTimestamps(text: string, color: string, seek: (sec: number) => void): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TIMESTAMP)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const sec = (m[1] ? +m[1] * 3600 : 0) + +m[2] * 60 + +m[3];
    out.push(
      <Text key={at} onPress={() => seek(sec)} style={{ color, fontWeight: '600' }}>
        {m[0]}
      </Text>,
    );
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Gemini about the video being watched, as a bottom sheet over the player: suggested questions, then a chat. */
export function GeminiSheet({ visible, videoId, title, onClose, onSeek }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<Stage>("transcript");
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);

  // A different video starts a fresh conversation.
  useEffect(() => {
    setTurns([]);
    setError(null);
    setBusy(false);
    setInput('');
  }, [videoId]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    return run([...turns, { role: 'user', text: q }]);
  };

  // Re-ask the last question (the failed user turn is still in the list).
  const retry = () => {
    if (busy || turns.length === 0 || turns[turns.length - 1].role !== 'user') return;
    return run(turns);
  };

  const run = async (next: Turn[]) => {
    setTurns(next);
    setError(null);
    setBusy(true);
    try {
      const a = await askGemini(videoId, next, setStage);
      setTurns((cur) => (cur === next || cur.length >= next.length ? [...next, { role: 'model', ...a }] : cur));
    } catch (e: any) {
      setError(e.message === 'NO_KEY' ? 'NO_KEY' : (e.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  };

  const bg = t.dark ? '#212121' : '#fff';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none" style={styles.wrap}>
        <View style={[styles.sheet, { backgroundColor: bg, paddingBottom: insets.bottom + 8 }]}>
          <View style={[styles.grabber, { backgroundColor: t.secondary }]} />
          <View style={styles.header}>
            <Ionicons name="sparkles" size={20} color={t.text} />
            <Text style={[styles.headerText, { color: t.text }]}>Ask</Text>
            <Text style={[styles.headerTitle, { color: t.secondary }]} numberOfLines={1}>
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={t.text} />
            </Pressable>
          </View>

          <ScrollView
            ref={scroll}
            style={styles.body}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
            {!GEMINI_KEY || error === 'NO_KEY' ? (
              <Text style={[styles.text, { color: t.secondary }]}>
                Add a Gemini API key to use this. Get a free one at aistudio.google.com/apikey, put it in app/.env as
                EXPO_PUBLIC_GEMINI_API_KEY, and rebuild.
              </Text>
            ) : (
              <>
                {turns.length === 0 && (
                  <View style={{ gap: 8 }}>
                    {SUGGESTIONS.map((s) => (
                      <Pressable
                        key={s}
                        onPress={() => send(s)}
                        style={({ pressed }) => [styles.chip, { backgroundColor: t.surface }, pressed && { opacity: 0.7 }]}>
                        <Text style={[styles.text, { color: t.text }]}>{s}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                {turns.map((m, i) =>
                  m.role === 'user' ? (
                    <View key={i} style={[styles.bubble, { backgroundColor: t.surface }]}>
                      <Text style={[styles.text, { color: t.text }]}>{m.text}</Text>
                    </View>
                  ) : (
                    <View key={i} style={{ gap: 6 }}>
                      <Text style={[styles.text, { color: t.text }]} selectable>
                        {linkTimestamps(m.text, t.link, (sec) => {
                          onSeek?.(sec);
                          onClose();
                        })}
                      </Text>
                      {!!m.note && <Text style={[styles.note, { color: t.secondary }]}>{m.note}</Text>}
                    </View>
                  ),
                )}
                {busy && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <ActivityIndicator color={t.secondary} />
                    <Text style={[styles.text, { color: t.secondary }]}>
                      {stage === "transcript" ? "Reading the transcript…" : "Watching the video (slower)…"}
                    </Text>
                  </View>
                )}
                {!!error && error !== 'NO_KEY' && (
                  <View style={{ gap: 8, alignItems: 'flex-start' }}>
                    <Text style={[styles.text, { color: t.danger }]}>{error}</Text>
                    <Pressable
                      onPress={retry}
                      style={({ pressed }) => [styles.chip, { backgroundColor: t.surface }, pressed && { opacity: 0.7 }]}>
                      <Text style={[styles.text, { color: t.text, fontWeight: '600' }]}>Retry</Text>
                    </Pressable>
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {!!GEMINI_KEY && (
            <View style={[styles.inputRow, { backgroundColor: t.surface }]}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Ask about this video"
                placeholderTextColor={t.secondary}
                style={[styles.input, { color: t.text }]}
                returnKeyType="send"
                onSubmitEditing={() => send(input)}
                editable={!busy}
              />
              <Pressable onPress={() => send(input)} disabled={busy || !input.trim()} hitSlop={8}>
                <Ionicons name="arrow-up-circle" size={30} color={input.trim() && !busy ? t.text : t.secondary} />
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  wrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { height: '75%', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 0 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginTop: 8, opacity: 0.5 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  headerText: { fontSize: 17, fontWeight: '700' },
  headerTitle: { flex: 1, fontSize: 13 },
  body: { flex: 1 },
  text: { fontSize: 15, lineHeight: 22 },
  note: { fontSize: 12, lineHeight: 16 },
  chip: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  bubble: { alignSelf: 'flex-end', maxWidth: '85%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    paddingLeft: 16,
    paddingRight: 6,
    height: 44,
    borderRadius: 22,
  },
  input: { flex: 1, fontSize: 15 },
});
