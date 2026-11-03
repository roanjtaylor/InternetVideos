import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import YoutubePlayer, { PLAYER_STATES } from 'react-native-youtube-iframe';

import { Text, View } from '@/components/Themed';

/**
 * Plays one video and nothing else. YouTube's embed shows "More videos"
 * whenever playback is paused or ended; the overlay below covers it so the
 * only visible options are resume or leave.
 */
export default function WatchScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const height = Math.round((width * 9) / 16);

  const [playing, setPlaying] = useState(true);
  const [covered, setCovered] = useState(false);
  const [ended, setEnded] = useState(false);

  const onStateChange = useCallback((state: string) => {
    if (state === PLAYER_STATES.PLAYING) {
      setCovered(false);
      setEnded(false);
      setPlaying(true);
    } else if (state === PLAYER_STATES.PAUSED) {
      setCovered(true);
      setPlaying(false);
    } else if (state === PLAYER_STATES.ENDED) {
      setCovered(true);
      setEnded(true);
      setPlaying(false);
    }
  }, []);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: '', headerBackTitle: 'Back' }} />
      <View style={{ width, height, backgroundColor: '#000' }}>
        <YoutubePlayer
          height={height}
          width={width}
          videoId={id}
          play={playing}
          onChangeState={onStateChange}
          initialPlayerParams={{ rel: false, modestbranding: true, controls: true, iv_load_policy: 3 }}
          webViewProps={{ allowsInlineMediaPlayback: true, mediaPlaybackRequiresUserAction: false }}
        />
        {covered && (
          <Pressable style={styles.overlay} onPress={() => setPlaying(true)}>
            <Text style={styles.overlayText}>{ended ? 'Finished' : 'Paused'}</Text>
            <Text style={styles.overlaySub}>{ended ? 'Tap to watch again' : 'Tap to resume'}</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.meta}>
        <Text style={styles.title}>{title}</Text>
        <Pressable
          onPress={() => router.push({ pathname: '/save/[id]', params: { id, title } })}
          style={({ pressed }) => [styles.save, pressed && { opacity: 0.6 }]}>
          <FontAwesome name="bookmark-o" size={16} color="#2f95dc" />
          <Text style={styles.saveText}>Save to playlist</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  overlaySub: { color: '#aaa', fontSize: 14, marginTop: 6 },
  meta: { padding: 16 },
  title: { fontSize: 18, fontWeight: '600' },
  save: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  saveText: { color: '#2f95dc', fontSize: 15, fontWeight: '600' },
});
