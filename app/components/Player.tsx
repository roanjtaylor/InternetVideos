import Ionicons from '@expo/vector-icons/Ionicons';
import { usePathname, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import YoutubePlayer, { PLAYER_STATES, YoutubeIframeRef } from 'react-native-youtube-iframe';

import { VideoRow } from '@/components/VideoList';
import { RED } from '@/constants/Colors';
import { api, formatDuration, timeAgo } from '@/lib/api';
import { closePlayer, expandPlayer, minimizePlayer, nextInQueue, playNext, usePlayer } from '@/lib/player';
import { useTheme } from '@/lib/theme';

const MINI_H = 56;
const TAB_BAR_H = 49;
const TAB_ROUTES = new Set(['/', '/search', '/subscriptions', '/profile']);
const SEEK_STEP = 10;
const HIDE_AFTER = 3000;

/**
 * The one player, mounted once in the root layout above the navigator.
 * Full mode: video on top (drag it down to minimise), details and the
 * "Up next" queue below. Mini mode: a bar above the tab bar that keeps
 * playing while you browse; tap to expand, swipe down to dismiss.
 *
 * YouTube's embed controls are switched off and replaced with our own:
 * tap to show/hide, centre play/pause, double-tap either side to seek ten
 * seconds, and a draggable red progress bar. While paused the embed would
 * show "More videos", so the thumbnail covers it.
 */
export function Player() {
  const { video } = usePlayer();
  if (!video) return null;
  return <PlayerView />;
}

function PlayerView() {
  const { video, queue, queueTitle, mode, session } = usePlayer();
  const t = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const VH = Math.round((W * 9) / 16);
  const miniW = Math.round((MINI_H * 16) / 9);
  const miniScale = miniW / W;
  const bottomOffset = (TAB_ROUTES.has(pathname) ? TAB_BAR_H : 0) + insets.bottom;
  const travel = H - MINI_H - bottomOffset;

  // 0 = full screen, 1 = mini bar.
  const p = useSharedValue(mode === 'mini' ? 1 : 0);
  const dragStart = useSharedValue(0);

  useEffect(() => {
    p.value = withTiming(mode === 'mini' ? 1 : 0, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [mode, p]);

  // ---- Playback state -------------------------------------------------------
  const ref = useRef<YoutubeIframeRef>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [ytState, setYtState] = useState<string>('unstarted');
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [controls, setControls] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null); // fraction while dragging the bar
  const [seekFlash, setSeekFlash] = useState<'back' | 'fwd' | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrubbing = useRef(false);

  useEffect(() => {
    setReady(false);
    setPlaying(true);
    setYtState('unstarted');
    setTime(0);
    setDuration(0);
    setControls(false);
  }, [session]);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControls(false), HIDE_AFTER);
  }, []);

  const showControls = useCallback(() => {
    setControls(true);
    scheduleHide();
  }, [scheduleHide]);

  const toggleControls = useCallback(() => {
    setControls((c) => {
      if (c) return false;
      scheduleHide();
      return true;
    });
  }, [scheduleHide]);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (seekTimer.current) clearTimeout(seekTimer.current);
  }, []);

  // Poll the embed for position twice a second while it is up.
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(async () => {
      if (scrubbing.current) return;
      try {
        const [cur, dur] = await Promise.all([ref.current?.getCurrentTime(), ref.current?.getDuration()]);
        if (typeof cur === 'number') setTime(cur);
        if (typeof dur === 'number' && dur > 0) setDuration(dur);
      } catch {
        // the webview is mid-reload
      }
    }, 500);
    return () => clearInterval(id);
  }, [ready, session]);

  const onStateChange = useCallback((state: string) => {
    setYtState(state);
    if (state === PLAYER_STATES.PLAYING) setPlaying(true);
    else if (state === PLAYER_STATES.PAUSED) setPlaying(false);
    else if (state === PLAYER_STATES.ENDED) {
      if (!playNext()) setPlaying(false);
    }
  }, []);

  const seekBy = useCallback(
    (delta: number) => {
      const target = Math.max(0, Math.min(duration || Infinity, time + delta));
      ref.current?.seekTo(target, true);
      setTime(target);
      setSeekFlash(delta < 0 ? 'back' : 'fwd');
      if (seekTimer.current) clearTimeout(seekTimer.current);
      seekTimer.current = setTimeout(() => setSeekFlash(null), 600);
    },
    [duration, time],
  );

  const seekToFraction = useCallback(
    (f: number) => {
      if (!duration) return;
      const target = Math.max(0, Math.min(duration, f * duration));
      ref.current?.seekTo(target, true);
      setTime(target);
    },
    [duration],
  );

  const togglePlay = useCallback(() => {
    setPlaying((v) => !v);
    showControls();
  }, [showControls]);

  // ---- Gestures ---------------------------------------------------------------
  const snap = useCallback((toMini: boolean) => {
    if (toMini) minimizePlayer();
    else expandPlayer();
  }, []);

  const dragVideo = Gesture.Pan()
    .activeOffsetY([-12, 12])
    .failOffsetX([-20, 20])
    .onBegin(() => {
      dragStart.value = p.value;
    })
    .onUpdate((e) => {
      p.value = Math.max(0, Math.min(1, dragStart.value + e.translationY / travel));
    })
    .onEnd((e) => {
      const toMini = e.velocityY > 400 || (p.value > 0.3 && e.velocityY > -400);
      p.value = withTiming(toMini ? 1 : 0, { duration: 220, easing: Easing.out(Easing.cubic) });
      runOnJS(snap)(toMini);
    });

  const singleTap = Gesture.Tap()
    .maxDuration(250)
    .onEnd(() => {
      runOnJS(toggleControls)();
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(250)
    .onEnd((e) => {
      runOnJS(seekBy)(e.x < W / 2 ? -SEEK_STEP : SEEK_STEP);
    });

  const videoGesture = Gesture.Race(dragVideo, Gesture.Exclusive(doubleTap, singleTap));

  const barWidth = W - 24;
  const beginScrub = useCallback(
    (f: number) => {
      scrubbing.current = true;
      setScrub(f);
      showControls();
    },
    [showControls],
  );
  const endScrub = useCallback(
    (f: number) => {
      seekToFraction(f);
      setScrub(null);
      scrubbing.current = false;
      showControls();
    },
    [seekToFraction, showControls],
  );
  const scrubBar = Gesture.Pan()
    .activeOffsetX([-2, 2])
    .onBegin((e) => {
      runOnJS(beginScrub)(Math.max(0, Math.min(1, e.x / barWidth)));
    })
    .onUpdate((e) => {
      runOnJS(setScrub)(Math.max(0, Math.min(1, e.x / barWidth)));
    })
    .onFinalize((e) => {
      runOnJS(endScrub)(Math.max(0, Math.min(1, e.x / barWidth)));
    });

  const miniPan = Gesture.Pan()
    .activeOffsetY([-15, 15])
    .onEnd((e) => {
      if (e.translationY < -50 || e.velocityY < -500) {
        p.value = withTiming(0, { duration: 220 });
        runOnJS(snap)(false);
      } else if (e.translationY > 50 || e.velocityY > 500) {
        runOnJS(closePlayer)();
      }
    });
  const miniTap = Gesture.Tap().onEnd(() => {
    p.value = withTiming(0, { duration: 220 });
    runOnJS(snap)(false);
  });
  const miniGesture = Gesture.Race(miniPan, miniTap);

  // ---- Animated styles --------------------------------------------------------
  const container = useAnimatedStyle(() => ({
    transform: [{ translateY: p.value * travel }],
    height: interpolate(p.value, [0, 1], [H, MINI_H]),
    paddingTop: interpolate(p.value, [0, 1], [insets.top, 0]),
    borderTopWidth: p.value > 0.98 ? StyleSheet.hairlineWidth : 0,
  }));
  const videoBox = useAnimatedStyle(() => {
    const s = interpolate(p.value, [0, 1], [1, miniScale]);
    return {
      transform: [{ translateX: (-(W * (1 - s))) / 2 }, { translateY: (-(VH * (1 - s))) / 2 }, { scale: s }],
    };
  });
  const fullOnly = useAnimatedStyle(() => ({ opacity: 1 - p.value }));
  const miniOnly = useAnimatedStyle(() => ({ opacity: p.value }));

  // ---- Derived ----------------------------------------------------------------
  const covered = !ready || ['unstarted', 'paused', 'ended', 'video cued'].includes(ytState);
  const ended = ytState === PLAYER_STATES.ENDED;
  const buffering = ytState === PLAYER_STATES.BUFFERING;
  const frac = scrub ?? (duration ? time / duration : 0);
  const shownTime = scrub !== null && duration ? scrub * duration : time;
  const next = nextInQueue();
  const isMini = mode === 'mini';

  const like = async () => {
    try {
      await api.like(video!.id);
      Alert.alert('Liked');
    } catch (e: any) {
      Alert.alert('Could not like', e.message ?? String(e));
    }
  };

  if (!video) return null;

  return (
    <Animated.View style={[styles.container, { width: W, backgroundColor: t.background, borderTopColor: t.divider }, container]}>
      {/* Video, scaled between full width and the mini thumbnail. */}
      <Animated.View style={[{ width: W, height: VH, backgroundColor: '#000' }, videoBox]}>
        <YoutubePlayer
          key={session}
          ref={ref}
          height={VH}
          width={W}
          videoId={video.id}
          play={playing}
          onReady={() => setReady(true)}
          onChangeState={onStateChange}
          initialPlayerParams={{ rel: false, controls: false, iv_load_policy: 3, preventFullScreen: true }}
          webViewProps={{
            allowsInlineMediaPlayback: true,
            mediaPlaybackRequiresUserAction: false,
            scrollEnabled: false,
          }}
        />
        {covered && (
          <View style={styles.cover} pointerEvents="none">
            {video.thumbnail ? <Image source={{ uri: video.thumbnail }} style={styles.coverImage} /> : null}
            <View style={styles.coverDim} />
          </View>
        )}
        {(buffering || !ready) && !isMini && (
          <View style={styles.centerAbs} pointerEvents="none">
            <ActivityIndicator color="#fff" size="large" />
          </View>
        )}

        {/* Gesture layer and our controls (full mode only). */}
        {!isMini && (
          <GestureDetector gesture={videoGesture}>
            <Animated.View style={StyleSheet.absoluteFill}>
              {seekFlash && (
                <View style={[styles.seekFlash, seekFlash === 'back' ? { left: 0 } : { right: 0 }]} pointerEvents="none">
                  <Ionicons name={seekFlash === 'back' ? 'play-back' : 'play-forward'} size={28} color="#fff" />
                  <Text style={styles.seekText}>{SEEK_STEP} seconds</Text>
                </View>
              )}
              {(controls || covered) && ready && (
                <View style={styles.controls} pointerEvents="box-none">
                  <View style={styles.controlsTop} pointerEvents="box-none">
                    <Pressable hitSlop={12} onPress={minimizePlayer} style={styles.iconBtn}>
                      <Ionicons name="chevron-down" size={26} color="#fff" />
                    </Pressable>
                  </View>
                  <View style={styles.controlsCenter} pointerEvents="box-none">
                    <Pressable
                      hitSlop={12}
                      onPress={() => seekBy(-SEEK_STEP)}
                      style={({ pressed }) => [styles.sideBtn, pressed && { opacity: 0.6 }]}>
                      <Ionicons name="play-back" size={26} color="#fff" />
                    </Pressable>
                    <Pressable
                      onPress={ended ? () => { ref.current?.seekTo(0, true); setPlaying(true); } : togglePlay}
                      style={({ pressed }) => [styles.playBtn, pressed && { opacity: 0.7 }]}>
                      <Ionicons
                        name={ended ? 'refresh' : playing && !covered ? 'pause' : 'play'}
                        size={38}
                        color="#fff"
                        style={!ended && !(playing && !covered) ? { marginLeft: 4 } : undefined}
                      />
                    </Pressable>
                    <Pressable
                      hitSlop={12}
                      disabled={!next}
                      onPress={() => playNext()}
                      style={({ pressed }) => [styles.sideBtn, (pressed || !next) && { opacity: next ? 0.6 : 0.3 }]}>
                      <Ionicons name="play-skip-forward" size={26} color="#fff" />
                    </Pressable>
                  </View>
                  <View style={styles.controlsBottom} pointerEvents="box-none">
                    <Text style={styles.time}>
                      {formatDuration(Math.floor(shownTime)) || '0:00'}
                      <Text style={{ color: 'rgba(255,255,255,0.7)' }}> / {formatDuration(Math.floor(duration)) || '0:00'}</Text>
                    </Text>
                  </View>
                </View>
              )}
              {/* Progress bar: always visible as a thin line, thicker with a knob while controls show. */}
              <GestureDetector gesture={scrubBar}>
                <Animated.View style={[styles.barHit, { width: barWidth }]} pointerEvents={controls || covered ? 'auto' : 'none'}>
                  <View style={[styles.barTrack, { height: controls || covered ? 3 : 2 }]}>
                    <View style={[styles.barFill, { width: `${frac * 100}%` }]} />
                  </View>
                  {(controls || covered) && (
                    <View style={[styles.knob, { left: Math.max(0, frac * barWidth - 7) }]} />
                  )}
                </Animated.View>
              </GestureDetector>
            </Animated.View>
          </GestureDetector>
        )}
      </Animated.View>

      {/* Full mode: details and up next. */}
      <Animated.View
        style={[styles.details, fullOnly]}
        pointerEvents={isMini ? 'none' : 'auto'}>
        <FlatList
          data={queue}
          keyExtractor={(v) => v.playlistItemId ?? v.id}
          ListHeaderComponent={
            <View>
              <View style={styles.meta}>
                <Text style={[styles.title, { color: t.text }]}>{video.title}</Text>
                <Text style={[styles.sub, { color: t.secondary }]}>
                  {video.channelTitle} · {timeAgo(video.publishedAt)}
                </Text>
              </View>
              <View style={styles.chips}>
                <Chip icon="thumbs-up-outline" label="Like" onPress={like} />
                <Chip
                  icon="bookmark-outline"
                  label="Save"
                  onPress={() => router.push({ pathname: '/save/[id]', params: { id: video.id, title: video.title } })}
                />
                <Chip
                  icon="person-circle-outline"
                  label="Channel"
                  onPress={() => {
                    minimizePlayer();
                    router.push({ pathname: '/channel/[id]', params: { id: video.channelId, title: video.channelTitle } });
                  }}
                />
                <Chip
                  icon="open-outline"
                  label="YouTube"
                  onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${video.id}`)}
                />
              </View>
              {queue.length > 1 && (
                <View style={[styles.upNext, { borderTopColor: t.divider }]}>
                  <Text style={[styles.upNextTitle, { color: t.text }]}>Up next</Text>
                  {!!queueTitle && (
                    <Text style={[styles.sub, { color: t.secondary, marginTop: 0 }]} numberOfLines={1}>
                      {queueTitle}
                    </Text>
                  )}
                </View>
              )}
            </View>
          }
          renderItem={({ item }) =>
            queue.length > 1 ? (
              <VideoRow video={item} queue={queue} queueTitle={queueTitle} active={item.id === video.id} />
            ) : null
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        />
      </Animated.View>

      {/* Mini bar: title and transport to the right of the shrunken video. */}
      <Animated.View
        style={[styles.miniBar, { left: miniW, height: MINI_H }, miniOnly]}
        pointerEvents={isMini ? 'auto' : 'none'}>
        <View style={styles.miniText}>
          <Text style={[styles.miniTitle, { color: t.text }]} numberOfLines={1}>
            {video.title}
          </Text>
          <Text style={[styles.miniSub, { color: t.secondary }]} numberOfLines={1}>
            {video.channelTitle}
          </Text>
        </View>
        <Pressable hitSlop={8} onPress={() => setPlaying((v) => !v)} style={styles.miniBtn}>
          <Ionicons name={playing && !covered ? 'pause' : 'play'} size={24} color={t.text} />
        </Pressable>
        <Pressable hitSlop={8} onPress={closePlayer} style={styles.miniBtn}>
          <Ionicons name="close" size={24} color={t.text} />
        </Pressable>
      </Animated.View>
      {isMini && <View style={[styles.miniProgress, { width: `${frac * 100}%` }]} pointerEvents="none" />}
      {/* One touch surface over the mini video and title; the two buttons sit to its right. */}
      {isMini && (
        <GestureDetector gesture={miniGesture}>
          <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: W - 88, height: MINI_H }} />
        </GestureDetector>
      )}
    </Animated.View>
  );
}

function Chip({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, { backgroundColor: pressed ? t.surfaceHigh : t.surface }]}>
      <Ionicons name={icon} size={18} color={t.text} />
      <Text style={[styles.chipText, { color: t.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 0, top: 0, overflow: 'hidden', zIndex: 50 },
  cover: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  coverImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  coverDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  centerAbs: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  controls: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  controlsTop: { flexDirection: 'row', padding: 8 },
  controlsCenter: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 48,
  },
  controlsBottom: { position: 'absolute', left: 12, right: 12, bottom: 14, flexDirection: 'row' },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  sideBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  time: { color: '#fff', fontSize: 12, fontWeight: '500', fontVariant: ['tabular-nums'] },
  seekFlash: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '45%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
  },
  seekText: { color: '#fff', fontSize: 12, marginTop: 4 },
  barHit: { position: 'absolute', left: 12, bottom: 0, height: 24, justifyContent: 'flex-end' },
  barTrack: { backgroundColor: 'rgba(255,255,255,0.35)', marginBottom: 4 },
  barFill: { height: '100%', backgroundColor: RED },
  knob: { position: 'absolute', bottom: -1, width: 14, height: 14, borderRadius: 7, backgroundColor: RED },
  details: { flex: 1 },
  meta: { paddingHorizontal: 12, paddingTop: 12 },
  title: { fontSize: 17, fontWeight: '600', lineHeight: 23 },
  sub: { fontSize: 12, marginTop: 4 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
  },
  chipText: { fontSize: 14, fontWeight: '500' },
  upNext: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 },
  upNextTitle: { fontSize: 15, fontWeight: '600' },
  miniBar: { position: 'absolute', top: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  miniText: { flex: 1, paddingHorizontal: 10, justifyContent: 'center', height: '100%' },
  miniTitle: { fontSize: 13, fontWeight: '500' },
  miniSub: { fontSize: 12, marginTop: 2 },
  miniBtn: { width: 44, height: '100%', alignItems: 'center', justifyContent: 'center' },
  miniProgress: { position: 'absolute', left: 0, bottom: 0, height: 2, backgroundColor: RED },
});
