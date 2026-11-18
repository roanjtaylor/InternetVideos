import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { GeminiSheet } from '@/components/GeminiSheet';
import { embed } from '@/components/PlayerEmbed';
import { chapterAt, parseChapters } from '@/lib/chapters';
import { rateVideo, useRating } from '@/lib/rating';
import { shareVideo } from '@/lib/share';
import { frameAt, Storyboard, storyboard } from '@/lib/storyboard';
import { setPlayback, togglePlaying, usePlayback, usePlayer } from '@/lib/player';

const RED = '#ff0033';
const HIDE_AFTER_MS = 3000;
const DOUBLE_TAP_MS = 300;
const SKIP = 10;
const PREVIEW_W = 150;
/** Tapping the time flips it to time left; like YouTube, the choice sticks. */
let showRemaining = false;
let captionsOn = false;
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

type Props = {
  /** Full mode: the controls are live. In the mini window only the progress line shows. */
  active: boolean;
  landscape: boolean;
  /** The video box, in points. */
  width: number;
  onMinimise: () => void;
  onFullscreen: () => void;
};

/**
 * The player's controls, drawn natively over the embed (whose own controls
 * are off and which takes no touches):
 *
 * - Tap to show or hide them; they hide themselves after a few seconds of playing.
 * - Double-tap the left or right half to skip 10 seconds; keep tapping to skip further.
 * - Hold to play at 2x until you let go.
 * - Play/pause with 10-second skips either side, a scrub bar you can tap or
 *   drag, the time, playback speed, minimise and full screen.
 * - A thin progress line along the bottom when the controls are hidden.
 */
export function PlayerControls({ active, landscape, width, onMinimise, onFullscreen }: Props) {
  const { video, session, playing } = usePlayer();
  const { time, duration, buffered, status, rate } = usePlayback();

  const [visible, setVisible] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [scrubSec, setScrubSec] = useState<number | null>(null);
  const [skip, setSkip] = useState<{ side: -1 | 1; total: number } | null>(null);
  const [holding, setHolding] = useState(false);
  const [bump, setBump] = useState(0); // any press restarts the hide timer
  const [remaining, setRemaining] = useState(showRemaining);
  const [sb, setSb] = useState<Storyboard | null>(null);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [cc, setCc] = useState(captionsOn);
  const [askOpen, setAskOpen] = useState(false);
  const router = useRouter();
  const { rating } = useRating(video?.id);
  const chapters = useMemo(() => parseChapters(video?.description, duration), [video?.description, duration]);

  // Frames for the scrub preview, fetched when the controls first appear for a video.
  const videoId = video?.id;
  const wantFrames = active && (visible || scrubSec !== null);
  useEffect(() => {
    setSb(null);
  }, [videoId]);
  useEffect(() => {
    if (!videoId || !wantFrames || sb) return;
    let alive = true;
    storyboard(videoId).then((b) => {
      if (!alive || !b) return;
      setSb(b);
      Image.prefetch(b.sheet(0)).catch(() => {});
    });
    return () => {
      alive = false;
    };
  }, [videoId, wantFrames, sb]);

  const busy = status === 'loading' || status === 'buffering';
  const shown = active && (visible || status === 'ended');

  // A new video starts with the controls away.
  useEffect(() => {
    setVisible(false);
    setSpeedOpen(false);
    setChaptersOpen(false);
    setScrubSec(null);
    setSkip(null);
    setHolding(false);
  }, [session]);
  useEffect(() => {
    if (!active) {
      setVisible(false);
      setSpeedOpen(false);
      setChaptersOpen(false);
    }
  }, [active]);

  useEffect(() => {
    if (!visible || status !== 'playing' || scrubSec !== null || speedOpen || chaptersOpen) return;
    const id = setTimeout(() => setVisible(false), HIDE_AFTER_MS);
    return () => clearTimeout(id);
  }, [visible, status, scrubSec, speedOpen, chaptersOpen, bump]);

  const fade = useSharedValue(0);
  useEffect(() => {
    fade.value = withTiming(shown ? 1 : 0, { duration: shown ? 120 : 200 });
  }, [shown, fade]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const lineStyle = useAnimatedStyle(() => ({ opacity: 1 - fade.value }));

  // ---- Taps: show/hide, double-tap to skip, hold for 2x ----------------------------
  const lastTap = useRef<{ at: number; side: -1 | 1; chain: boolean } | null>(null);
  const skipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (skipTimer.current) clearTimeout(skipTimer.current);
  }, []);

  const doSkip = useCallback((side: -1 | 1) => {
    Haptics.selectionAsync().catch(() => {});
    embed.seekBy(side * SKIP);
    setSkip((s) => ({ side, total: (s && s.side === side ? s.total : 0) + SKIP }));
    if (skipTimer.current) clearTimeout(skipTimer.current);
    skipTimer.current = setTimeout(() => setSkip(null), 700);
  }, []);

  const onTap = useCallback(
    (x: number) => {
      const now = Date.now();
      const side: -1 | 1 = x < width / 2 ? -1 : 1;
      const last = lastTap.current;
      if (last && last.side === side && now - last.at < (last.chain ? 600 : DOUBLE_TAP_MS)) {
        lastTap.current = { at: now, side, chain: true };
        setVisible(false);
        setSpeedOpen(false);
        setChaptersOpen(false);
        doSkip(side);
        return;
      }
      lastTap.current = { at: now, side, chain: false };
      if (speedOpen || chaptersOpen) {
        setSpeedOpen(false);
        setChaptersOpen(false);
      } else setVisible((v) => !v);
    },
    [width, speedOpen, chaptersOpen, doSkip],
  );

  const rateBeforeHold = useRef<number | null>(null);
  const holdStart = useCallback(() => {
    if (status !== 'playing') return;
    rateBeforeHold.current = rate;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    embed.setRate(2);
    setHolding(true);
    setVisible(false);
  }, [status, rate]);
  const holdEnd = useCallback(() => {
    if (rateBeforeHold.current === null) return;
    embed.setRate(rateBeforeHold.current);
    rateBeforeHold.current = null;
    setHolding(false);
  }, []);

  const tap = Gesture.Tap()
    .enabled(active)
    .maxDuration(300)
    .onEnd((e, ok) => {
      if (ok) runOnJS(onTap)(e.x);
    });
  const hold = Gesture.LongPress()
    .enabled(active)
    .minDuration(400)
    .maxDistance(30)
    .onStart(() => {
      runOnJS(holdStart)();
    })
    .onFinalize(() => {
      runOnJS(holdEnd)();
    });
  const surface = Gesture.Race(hold, tap);

  // ---- Scrub bar --------------------------------------------------------------------
  const barW = useSharedValue(1);
  const prog = useSharedValue(0); // 0..1 as drawn
  const dur = useSharedValue(0);
  const scrubbing = useSharedValue(false);
  const lastSec = useSharedValue(-1);

  useEffect(() => {
    dur.value = duration;
    if (scrubbing.value) return;
    const f = duration > 0 ? Math.min(1, time / duration) : 0;
    // The embed reports every quarter second: glide between reports rather than step.
    prog.value = status === 'playing' ? withTiming(f, { duration: 250, easing: Easing.linear }) : f;
  }, [time, duration, status, dur, prog, scrubbing]);

  const scrubEnd = useCallback((seconds: number) => {
    setScrubSec(null);
    Haptics.selectionAsync().catch(() => {});
    embed.seek(seconds);
    setBump((b) => b + 1);
  }, []);

  const scrub = Gesture.Pan()
    .enabled(active && duration > 0)
    .minDistance(0)
    .onBegin((e) => {
      scrubbing.value = true;
      const f = Math.max(0, Math.min(1, e.x / barW.value));
      prog.value = f;
      lastSec.value = Math.floor(f * dur.value);
      runOnJS(setScrubSec)(lastSec.value);
    })
    .onUpdate((e) => {
      const f = Math.max(0, Math.min(1, e.x / barW.value));
      prog.value = f;
      const s = Math.floor(f * dur.value);
      if (s !== lastSec.value) {
        lastSec.value = s;
        runOnJS(setScrubSec)(s);
      }
    })
    .onFinalize(() => {
      if (!scrubbing.value) return;
      scrubbing.value = false;
      runOnJS(scrubEnd)(prog.value * dur.value);
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: prog.value * barW.value - THUMB / 2 }, { scale: withTiming(scrubbing.value ? 1.5 : 1, { duration: 100 }) }],
  }));
  const previewStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.max(0, Math.min(barW.value - PREVIEW_W, prog.value * barW.value - PREVIEW_W / 2)) },
    ],
  }));
  const lineFillStyle = useAnimatedStyle(() => ({ width: `${prog.value * 100}%` }));

  const press = (fn: () => void) => () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setBump((b) => b + 1);
    fn();
  };

  const pad = landscape ? 20 : 12;
  // Landscape makes room under the bar for the action pill.
  const barB = landscape ? 62 : 4;
  const timeB = landscape ? 92 : 30;
  const chIdx = chapters.length ? chapterAt(chapters, scrubSec ?? time) : -1;
  const toggleCc = () => {
    captionsOn = !captionsOn;
    setCc(captionsOn);
    embed.setCaptions(captionsOn);
  };

  const shownTime = scrubSec ?? time;
  const frame = sb && scrubSec !== null ? frameAt(sb, scrubSec, duration) : null;
  const k = sb ? PREVIEW_W / sb.w : 1;

  if (status === 'error') {
    return (
      <View style={[StyleSheet.absoluteFill, styles.error]} pointerEvents={active ? 'auto' : 'none'}>
        <Text style={styles.errorText}>This video can’t be played in the app.</Text>
        {active && !!video && (
          <Pressable
            onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${video.id}`).catch(() => {})}
            style={({ pressed }) => [styles.errorBtn, pressed && { opacity: 0.7 }]}>
            <Text style={styles.errorBtnText}>Open in YouTube</Text>
          </Pressable>
        )}
        {active && (
          <Pressable onPress={onMinimise} hitSlop={10} style={[styles.corner, { left: pad, top: 8 }]}>
            <Ionicons name="chevron-down" size={26} color="#fff" />
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={active ? 'box-none' : 'none'}>
      {/* The whole video: tap, double-tap, hold. */}
      <GestureDetector gesture={surface}>
        <View style={StyleSheet.absoluteFill} />
      </GestureDetector>

      {/* Loading: shown with or without the controls. */}
      {busy && scrubSec === null && !speedOpen && (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      {/* Double-tap skip and hold-for-2x feedback. */}
      {skip && (
        <View style={[styles.skip, skip.side < 0 ? { left: '8%' } : { right: '8%' }]} pointerEvents="none">
          <MaterialIcons name={skip.side < 0 ? 'fast-rewind' : 'fast-forward'} size={26} color="#fff" />
          <Text style={styles.skipText}>{skip.total} seconds</Text>
        </View>
      )}
      {holding && (
        <View style={styles.holdPill} pointerEvents="none">
          <Text style={styles.pillText}>2x</Text>
          <MaterialIcons name="fast-forward" size={18} color="#fff" />
        </View>
      )}

      {/* Thin progress line while the controls are away. */}
      {!landscape && (
        <Animated.View style={[styles.line, lineStyle]} pointerEvents="none">
          <Animated.View style={[styles.lineFill, lineFillStyle]} />
        </Animated.View>
      )}

      {/* The controls. Each group is its own layer so that touches between them reach the tap surface. */}
      <Animated.View style={[StyleSheet.absoluteFill, fadeStyle]} pointerEvents={shown ? 'box-none' : 'none'}>
        <View style={[StyleSheet.absoluteFill, styles.scrim]} pointerEvents="none" />

        <View style={[styles.top, { paddingHorizontal: pad }]} pointerEvents="box-none">
          {landscape ? (
            <>
              <View style={styles.titleBlock} pointerEvents="none">
                <Text style={styles.title} numberOfLines={1}>
                  {video?.title}
                </Text>
                <Text style={styles.channel} numberOfLines={1}>
                  {video?.channelTitle}
                </Text>
              </View>
              <View style={styles.topRight}>
                <Pressable
                  onPress={press(toggleCc)}
                  hitSlop={8}
                  style={styles.iconBtn}
                  accessibilityLabel={cc ? 'Turn captions off' : 'Turn captions on'}>
                  <MaterialIcons name={cc ? 'closed-caption' : 'closed-caption-off'} size={28} color="#fff" />
                </Pressable>
                <Pressable
                  onPress={press(() => {
                    setChaptersOpen(false);
                    setSpeedOpen((o) => !o);
                  })}
                  hitSlop={8}
                  style={styles.iconBtn}
                  accessibilityLabel="Playback speed">
                  <Ionicons name="settings-outline" size={26} color="#fff" />
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Pressable onPress={onMinimise} hitSlop={10} style={styles.iconBtn} accessibilityLabel="Minimise">
                <Ionicons name="chevron-down" size={26} color="#fff" />
              </Pressable>
              <Pressable
                onPress={press(() => {
                  setChaptersOpen(false);
                  setSpeedOpen((o) => !o);
                })}
                hitSlop={10}
                style={styles.rateBtn}
                accessibilityLabel="Playback speed">
                <Text style={styles.pillText}>{rate}x</Text>
              </Pressable>
            </>
          )}
        </View>

        {speedOpen ? (
          <View style={styles.center} pointerEvents="box-none">
            <View style={styles.rates}>
              {RATES.map((r) => (
                <Pressable
                  key={r}
                  onPress={press(() => {
                    embed.setRate(r);
                    setPlayback({ rate: r });
                    setSpeedOpen(false);
                  })}
                  style={[styles.rateChip, r === rate && styles.rateChipOn]}>
                  <Text style={[styles.rateChipText, r === rate && { color: '#000' }]}>{r}x</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : chaptersOpen && chapters.length ? (
          <View style={styles.center} pointerEvents="box-none">
            <ScrollView style={styles.chapterList} contentContainerStyle={{ padding: 6 }}>
              {chapters.map((c, i) => (
                <Pressable
                  key={c.start}
                  onPress={press(() => {
                    embed.seek(c.start);
                    setChaptersOpen(false);
                  })}
                  style={({ pressed }) => [styles.chapterRow, (pressed || i === chIdx) && styles.pressed]}>
                  <Text style={styles.chapterTime}>{clock(c.start)}</Text>
                  <Text style={[styles.chapterTitle, i === chIdx && { fontWeight: '700' }]} numberOfLines={1}>
                    {c.title}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : scrubSec !== null && !sb ? (
          <View style={styles.center} pointerEvents="none">
            <Text style={styles.scrubTime}>{clock(scrubSec)}</Text>
          </View>
        ) : (
          <View style={styles.center} pointerEvents="box-none">
            <View style={styles.transport} pointerEvents="box-none">
              <Pressable
                onPress={press(() => embed.seekBy(-SKIP))}
                hitSlop={8}
                style={({ pressed }) => [styles.sideBtn, pressed && styles.pressed]}
                accessibilityLabel="Back 10 seconds">
                <MaterialIcons name="replay-10" size={30} color="#fff" />
              </Pressable>
              {busy ? (
                <View style={styles.playBtn} />
              ) : (
                <Pressable
                  onPress={press(togglePlaying)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.playBtn, styles.round, pressed && styles.pressed]}
                  accessibilityLabel={status === 'ended' ? 'Replay' : playing ? 'Pause' : 'Play'}>
                  <Ionicons
                    name={status === 'ended' ? 'refresh' : playing ? 'pause' : 'play'}
                    size={34}
                    color="#fff"
                    style={!playing && status !== 'ended' ? { marginLeft: 4 } : undefined}
                  />
                </Pressable>
              )}
              <Pressable
                onPress={press(() => embed.seekBy(SKIP))}
                hitSlop={8}
                style={({ pressed }) => [styles.sideBtn, pressed && styles.pressed]}
                accessibilityLabel="Forward 10 seconds">
                <MaterialIcons name="forward-10" size={30} color="#fff" />
              </Pressable>
            </View>
          </View>
        )}

        <View style={[styles.bottom, { paddingHorizontal: pad, bottom: timeB }]} pointerEvents="box-none">
          <View style={styles.timeRow} pointerEvents="box-none">
            <Pressable
              hitSlop={8}
              onPress={press(() => {
                showRemaining = !showRemaining;
                setRemaining(showRemaining);
              })}
              accessibilityLabel={remaining ? 'Show time watched' : 'Show time left'}>
              <Text style={styles.time}>
                {remaining ? `-${clock(Math.max(0, duration - shownTime))}` : clock(shownTime)}
                <Text style={styles.timeDim}> / {clock(duration)}</Text>
              </Text>
            </Pressable>
            {chIdx >= 0 && (
              <Pressable
                hitSlop={8}
                onPress={press(() => {
                  setSpeedOpen(false);
                  setChaptersOpen((o) => !o);
                })}
                style={styles.chapterBtn}
                accessibilityLabel="Chapters">
                <Text style={styles.chapterLabel} numberOfLines={1}>
                  {'· '}
                  {chapters[chIdx].title}
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#fff" />
              </Pressable>
            )}
          </View>
          <Pressable
            onPress={press(onFullscreen)}
            hitSlop={10}
            style={styles.iconBtn}
            accessibilityLabel={landscape ? 'Exit full screen' : 'Full screen'}>
            <MaterialIcons name={landscape ? 'fullscreen-exit' : 'fullscreen'} size={26} color="#fff" />
          </Pressable>
        </View>

        {frame && sb && scrubSec !== null && (
          <Animated.View
            style={[styles.preview, { left: pad, bottom: barB + TOUCH_H + (landscape ? 30 : 38) }, previewStyle]}
            pointerEvents="none">
            <View style={{ width: PREVIEW_W, height: sb.h * k, overflow: 'hidden', borderRadius: 6, backgroundColor: '#222' }}>
              <Image
                source={{ uri: sb.sheet(frame.sheet) }}
                style={{
                  position: 'absolute',
                  left: -frame.col * sb.w * k,
                  top: -frame.row * sb.h * k,
                  width: sb.cols * sb.w * k,
                  height: sb.rows * sb.h * k,
                }}
              />
            </View>
            <Text style={styles.previewTime}>{clock(scrubSec)}</Text>
          </Animated.View>
        )}

        {landscape && !!video && (
          <View style={[styles.pill, { left: pad, bottom: 12 }]} pointerEvents="box-none">
            <Pressable onPress={press(() => rateVideo(video, 'like'))} hitSlop={6} style={styles.pillBtn} accessibilityLabel="Like">
              <MaterialIcons name={rating === 'like' ? 'thumb-up' : 'thumb-up-off-alt'} size={24} color="#fff" />
            </Pressable>
            <Pressable onPress={press(() => rateVideo(video, 'dislike'))} hitSlop={6} style={styles.pillBtn} accessibilityLabel="Dislike">
              <MaterialIcons name={rating === 'dislike' ? 'thumb-down' : 'thumb-down-off-alt'} size={24} color="#fff" />
            </Pressable>
            <Pressable
              onPress={press(() => router.push({ pathname: '/save/[id]', params: { id: video.id, title: video.title } }))}
              hitSlop={6}
              style={styles.pillBtn}
              accessibilityLabel="Save">
              <Ionicons name="bookmark-outline" size={24} color="#fff" />
            </Pressable>
            <Pressable onPress={press(() => shareVideo(video))} hitSlop={6} style={styles.pillBtn} accessibilityLabel="Share">
              <Ionicons name="arrow-redo-outline" size={24} color="#fff" />
            </Pressable>
            <Pressable onPress={press(() => setAskOpen(true))} hitSlop={6} style={styles.pillBtn} accessibilityLabel="Ask Gemini">
              <Ionicons name="sparkles-outline" size={24} color="#fff" />
            </Pressable>
          </View>
        )}

        <View style={[styles.barWrap, { left: pad, right: pad, bottom: barB }]}>
          <GestureDetector gesture={scrub}>
            <View
              style={styles.barTouch}
              onLayout={(e) => {
                barW.value = Math.max(1, e.nativeEvent.layout.width);
              }}>
              <View style={styles.track}>
                {(chapters.length
                  ? chapters.map((c, i) => ({ start: c.start, end: chapters[i + 1]?.start ?? duration }))
                  : [{ start: 0, end: duration }]
                ).map((seg) => (
                  <Segment
                    key={seg.start}
                    start={seg.start}
                    len={Math.max(1, seg.end - seg.start)}
                    total={duration}
                    buffered={buffered}
                    dur={dur}
                    prog={prog}
                  />
                ))}
              </View>
              <Animated.View style={[styles.thumb, thumbStyle]} />
            </View>
          </GestureDetector>
        </View>
      </Animated.View>
      {!!video && <GeminiSheet visible={askOpen} videoId={video.id} title={video.title} onClose={() => setAskOpen(false)} />}
    </View>
  );
}

/** One chapter's stretch of the scrub bar (the whole bar when there are no chapters). */
function Segment({
  start,
  len,
  total,
  buffered,
  dur,
  prog,
}: {
  start: number;
  len: number;
  total: number;
  buffered: number;
  dur: SharedValue<number>;
  prog: SharedValue<number>;
}) {
  const fill = useAnimatedStyle(() => {
    const f = (prog.value * dur.value - start) / len;
    return { width: `${Math.max(0, Math.min(1, f)) * 100}%` };
  });
  const buf = total > 0 ? Math.max(0, Math.min(1, (buffered * total - start) / len)) : 0;
  return (
    <View style={[styles.segment, { flex: len }]}>
      <View style={[styles.buffered, { width: `${buf * 100}%` }]} />
      <Animated.View style={[styles.fill, fill]} />
    </View>
  );
}

/** 83 -> 1:23, 3723 -> 1:02:03. */
function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const THUMB = 13;
const TOUCH_H = 28;

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  rateBtn: {
    height: 30,
    minWidth: 44,
    paddingHorizontal: 10,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  transport: { flexDirection: 'row', alignItems: 'center', gap: 44 },
  playBtn: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  sideBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  round: { borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.3)' },
  pressed: { backgroundColor: 'rgba(255,255,255,0.25)' },
  time: { color: '#fff', fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  timeDim: { color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  scrubTime: { color: '#fff', fontSize: 30, fontWeight: '700', fontVariant: ['tabular-nums'] },
  preview: { position: 'absolute', width: PREVIEW_W, alignItems: 'center', gap: 4 },
  previewTime: { color: '#fff', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  barWrap: { position: 'absolute', height: TOUCH_H },
  barTouch: { height: TOUCH_H, justifyContent: 'center' },
  track: { height: 3, flexDirection: 'row', gap: 2 },
  segment: { height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  titleBlock: { flex: 1, marginRight: 16 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  channel: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '500', marginTop: 2 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  timeRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 12 },
  chapterBtn: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 2 },
  chapterLabel: { flexShrink: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  chapterList: { maxHeight: '55%', width: '60%', borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.75)' },
  chapterRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8 },
  chapterTime: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'], minWidth: 56 },
  chapterTitle: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '500' },
  pill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 8,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  pillBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  buffered: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.45)' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: RED },
  thumb: {
    position: 'absolute',
    left: 0,
    top: (TOUCH_H - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: RED,
  },
  line: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  lineFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: RED },
  skip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '34%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  skipText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  holdPill: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  rates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
  },
  rateChip: {
    height: 34,
    minWidth: 52,
    paddingHorizontal: 10,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateChipOn: { backgroundColor: '#fff' },
  rateChipText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  error: { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  errorText: { color: '#fff', fontSize: 14, textAlign: 'center' },
  errorBtn: { height: 36, paddingHorizontal: 16, borderRadius: 18, backgroundColor: '#fff', justifyContent: 'center' },
  errorBtnText: { color: '#000', fontSize: 14, fontWeight: '600' },
});
