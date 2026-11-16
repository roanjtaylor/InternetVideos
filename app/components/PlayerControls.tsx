import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { embed } from '@/components/PlayerEmbed';
import { setPlayback, togglePlaying, usePlayback, usePlayer } from '@/lib/player';

const RED = '#ff0033';
const HIDE_AFTER_MS = 3000;
const DOUBLE_TAP_MS = 300;
const SKIP = 10;
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

  const busy = status === 'loading' || status === 'buffering';
  const shown = active && (visible || status === 'ended');

  // A new video starts with the controls away.
  useEffect(() => {
    setVisible(false);
    setSpeedOpen(false);
    setScrubSec(null);
    setSkip(null);
    setHolding(false);
  }, [session]);
  useEffect(() => {
    if (!active) {
      setVisible(false);
      setSpeedOpen(false);
    }
  }, [active]);

  useEffect(() => {
    if (!visible || status !== 'playing' || scrubSec !== null || speedOpen) return;
    const id = setTimeout(() => setVisible(false), HIDE_AFTER_MS);
    return () => clearTimeout(id);
  }, [visible, status, scrubSec, speedOpen, bump]);

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
        doSkip(side);
        return;
      }
      lastTap.current = { at: now, side, chain: false };
      if (speedOpen) setSpeedOpen(false);
      else setVisible((v) => !v);
    },
    [width, speedOpen, doSkip],
  );

  const rateBeforeHold = useRef<number | null>(null);
  const holdStart = useCallback(() => {
    if (status !== 'playing') return;
    rateBeforeHold.current = rate;
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

  const fillStyle = useAnimatedStyle(() => ({ width: prog.value * barW.value }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: prog.value * barW.value - THUMB / 2 }, { scale: withTiming(scrubbing.value ? 1.5 : 1, { duration: 100 }) }],
  }));
  const lineFillStyle = useAnimatedStyle(() => ({ width: `${prog.value * 100}%` }));

  const press = (fn: () => void) => () => {
    setBump((b) => b + 1);
    fn();
  };

  const pad = landscape ? 20 : 12;
  const shownTime = scrubSec ?? time;

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
          <Pressable onPress={onMinimise} hitSlop={10} style={styles.iconBtn} accessibilityLabel="Minimise">
            <Ionicons name="chevron-down" size={26} color="#fff" />
          </Pressable>
          <Pressable
            onPress={press(() => setSpeedOpen((o) => !o))}
            hitSlop={10}
            style={styles.rateBtn}
            accessibilityLabel="Playback speed">
            <Text style={styles.pillText}>{rate}x</Text>
          </Pressable>
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
        ) : scrubSec !== null ? (
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

        <View style={[styles.bottom, { paddingHorizontal: pad, bottom: landscape ? 44 : 30 }]} pointerEvents="box-none">
          <Text style={styles.time}>
            {clock(shownTime)}
            <Text style={styles.timeDim}> / {clock(duration)}</Text>
          </Text>
          <Pressable
            onPress={press(onFullscreen)}
            hitSlop={10}
            style={styles.iconBtn}
            accessibilityLabel={landscape ? 'Exit full screen' : 'Full screen'}>
            <MaterialIcons name={landscape ? 'fullscreen-exit' : 'fullscreen'} size={26} color="#fff" />
          </Pressable>
        </View>

        <View style={[styles.barWrap, { left: pad, right: pad, bottom: landscape ? 18 : 4 }]}>
          <GestureDetector gesture={scrub}>
            <View
              style={styles.barTouch}
              onLayout={(e) => {
                barW.value = Math.max(1, e.nativeEvent.layout.width);
              }}>
              <View style={styles.track}>
                <View style={[styles.buffered, { width: `${Math.min(1, buffered) * 100}%` }]} />
                <Animated.View style={[styles.fill, fillStyle]} />
              </View>
              <Animated.View style={[styles.thumb, thumbStyle]} />
            </View>
          </GestureDetector>
        </View>
      </Animated.View>
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
  barWrap: { position: 'absolute', height: TOUCH_H },
  barTouch: { height: TOUCH_H, justifyContent: 'center' },
  track: { height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
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
