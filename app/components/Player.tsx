import Ionicons from '@expo/vector-icons/Ionicons';
import { usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
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
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import YoutubePlayer, { YoutubeIframeRef } from 'react-native-youtube-iframe';

import { api, ChannelInfo, formatCount, formatDuration, shortDate, timeAgo, Video } from '@/lib/api';
import { saveProgress } from '@/lib/history';
import { allowRotation, lockLandscape, lockPortrait } from '@/lib/orientation';
import {
  closePlayer,
  expandPlayer,
  minimizePlayer,
  setPlaying,
  togglePlaying,
  updateVideo,
  usePlayer,
} from '@/lib/player';
import { useTheme } from '@/lib/theme';

const TAB_BAR_H = 49;
const TAB_ROUTES = new Set(['/', '/playlists', '/search', '/subscriptions', '/profile']);
const MINI_DEFAULT_W = 176;
const MINI_MIN_W = 120;
const MINI_MARGIN = 12;
const MINI_RADIUS = 12;
const SPRING = { damping: 22, stiffness: 240, mass: 0.8 };
const PROGRESS_EVERY_MS = 5000;
const CONTROLS_HIDE_MS = 3000;

/**
 * Runs inside the embed page. Three fixes to YouTube's defaults:
 *
 * - Autoplay. Start as soon as the player is ready (and when a video is
 *   merely cued), so a tap on a thumbnail is the only tap needed.
 * - Captions. YouTube remembers a "captions on" preference in its cookies
 *   and ignores cc_load_policy=0 for it, so unload the captions module as
 *   soon as the player exists and again whenever playback starts.
 * - Quality. The embed picks a quality for its CSS size, and a phone-wide
 *   player gets 360p. Ask for the best level the video offers instead, via
 *   setPlaybackQualityRange (the player's own, undocumented, call that the
 *   HD browser extensions use) with the documented setPlaybackQuality as a
 *   fallback. Re-applied on every play and whenever the player drops it.
 */
const EMBED_FIXES_JS = `
(function () {
  var ORDER = ['highres', 'hd2880', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];
  function killCaptions() {
    try { window.player.unloadModule('captions'); } catch (e) {}
    try { window.player.unloadModule('cc'); } catch (e) {}
  }
  function best() {
    var levels = [];
    try { levels = window.player.getAvailableQualityLevels() || []; } catch (e) {}
    for (var i = 0; i < ORDER.length; i++) if (levels.indexOf(ORDER[i]) >= 0) return ORDER[i];
    return levels[0] || 'hd1080';
  }
  function maxQuality() {
    var q = best();
    var p = window.player;
    try { if (typeof p.setPlaybackQualityRange === 'function') p.setPlaybackQualityRange(q, q); } catch (e) {}
    try { p.setPlaybackQuality(q); } catch (e) {}
  }
  function fix() { killCaptions(); maxQuality(); }
  function autoplay() { try { window.player.playVideo(); } catch (e) {} }
  var tries = 0;
  var t = setInterval(function () {
    tries++;
    var p = window.player;
    if (p && typeof p.addEventListener === 'function') {
      clearInterval(t);
      fix();
      try {
        p.addEventListener('onReady', function () { fix(); autoplay(); });
        p.addEventListener('onStateChange', function (e) {
          if (!e) return;
          if (e.data === 5) autoplay();
          if (e.data === 1 || e.data === 3) fix();
        });
        p.addEventListener('onPlaybackQualityChange', function (e) {
          if (e && e.data && e.data !== best()) setTimeout(maxQuality, 500);
        });
      } catch (e) {}
    } else if (tries > 150) {
      clearInterval(t);
    }
  }, 200);
})();
true;
`;

// Hoisted so the WebView never sees a new props object on re-render.
const WEBVIEW_PROPS = {
  allowsInlineMediaPlayback: true,
  mediaPlaybackRequiresUserAction: false,
  allowsBackForwardNavigationGestures: false,
  scrollEnabled: false,
  bounces: false,
  overScrollMode: 'never' as const,
  androidLayerType: 'hardware' as const,
  injectedJavaScript: EMBED_FIXES_JS,
};

/**
 * The one player, mounted once in the root layout above the navigator.
 *
 * Playback itself is YouTube's own embed with its native controls. We add
 * the YouTube-app behaviours around it:
 *
 * - Full mode. Portrait: the video on top (drag it down to minimise), then
 *   a one-line title (tap for the rest and the description), the channel
 *   with a Subscribe button, views, likes and date, and Like, Save and Ask
 *   buttons. Rotate the phone for full screen: the video alone on black.
 * - Mini mode: a small floating window of just the video that keeps playing
 *   while you browse, never over the tab bar. Play/pause top left, close
 *   top right. Drag it around, pinch to resize, drag or fling it up (or
 *   double-tap) to expand, drag or fling it down off the bottom to dismiss.
 * - Progress is saved every few seconds, so the next open resumes.
 */
export function Player() {
  const { video } = usePlayer();
  if (!video) return null;
  return <PlayerView />;
}

function PlayerView() {
  const { video, mode, session, playing, resumeAt } = usePlayer();
  const t = useTheme();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const landscape = W > H;
  const isMini = mode === 'mini';
  const playerRef = useRef<YoutubeIframeRef>(null);

  // Our fullscreen button follows the embed's own controls, which we cannot
  // see into: shown on any touch of the video and while paused, hidden a few
  // seconds into playback, the way YouTube's controls fade.
  const [controlsShown, setControlsShown] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showControls = useCallback(() => {
    setControlsShown(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsShown(false), CONTROLS_HIDE_MS);
  }, []);
  useEffect(() => {
    if (playing) showControls();
    else {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setControlsShown(true);
    }
  }, [playing, session, showControls]);
  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  // Full-size video box: full width in portrait; in landscape as large as fits, letterboxed.
  const videoW = landscape ? Math.min(W, Math.round((H * 16) / 9)) : W;
  const videoH = landscape ? Math.min(H, Math.round((W * 9) / 16)) : Math.round((W * 9) / 16);
  const videoLeft = Math.round((W - videoW) / 2);
  const videoTop = landscape ? Math.round((H - videoH) / 2) : insets.top;
  const bottomOffset = (TAB_ROUTES.has(pathname) ? TAB_BAR_H : 0) + insets.bottom;
  const minY = insets.top + MINI_MARGIN;
  const maxMiniW = W - 2 * MINI_MARGIN;

  // 0 = full, 1 = mini. The mini window's own rect lives in shared values so
  // dragging and pinching never touch React state.
  const p = useSharedValue(isMini ? 1 : 0);
  const alpha = useSharedValue(1);
  const miniW = useSharedValue(MINI_DEFAULT_W);
  const miniX = useSharedValue(W - MINI_DEFAULT_W - MINI_MARGIN);
  const miniY = useSharedValue(H - bottomOffset - (MINI_DEFAULT_W * 9) / 16 - MINI_MARGIN);
  const dragStart = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startW = useSharedValue(0);
  const bottomLimit = useSharedValue(bottomOffset);
  useEffect(() => {
    bottomLimit.value = bottomOffset;
  }, [bottomOffset, bottomLimit]);

  // Park the window bottom-right, above the tab bar, each time it minimises.
  const parkMini = useCallback(() => {
    const h = (miniW.value * 9) / 16;
    miniX.value = W - miniW.value - MINI_MARGIN;
    miniY.value = H - bottomOffset - h - MINI_MARGIN;
  }, [W, H, bottomOffset, miniW, miniX, miniY]);

  useEffect(() => {
    if (isMini) parkMini();
    p.value = withTiming(isMini ? 1 : 0, { duration: 260, easing: Easing.out(Easing.cubic) });
    // Only react to the mode flipping, not to the park position's inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMini, p]);

  // Keep the mini window above the tab bar when the route underneath changes.
  useEffect(() => {
    if (!isMini) return;
    const h = (miniW.value * 9) / 16;
    const maxY = H - bottomOffset - h - MINI_MARGIN;
    if (miniY.value > maxY) miniY.value = withSpring(maxY, SPRING);
  }, [bottomOffset, isMini, H, miniW, miniY]);

  // Full mode follows the phone; mini mode and no video are portrait only.
  useEffect(() => {
    if (mode === 'full') allowRotation();
    else lockPortrait();
  }, [mode]);
  useEffect(() => () => {
    lockPortrait();
  }, []);

  // The fullscreen button, bottom right over the embed's logo: portrait turns
  // the screen to landscape; landscape returns to portrait and, a moment later
  // (once the phone is likely upright again), lets it follow the phone.
  const relockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleFullscreen = useCallback(() => {
    if (relockTimer.current) clearTimeout(relockTimer.current);
    if (landscape) {
      lockPortrait();
      relockTimer.current = setTimeout(allowRotation, 3000);
    } else {
      lockLandscape();
    }
  }, [landscape]);
  useEffect(() => () => {
    if (relockTimer.current) clearTimeout(relockTimer.current);
  }, []);

  // ---- Progress: remembered every few seconds so the next open resumes ------
  const lastTime = useRef<{ pos: number; dur: number }>({ pos: 0, dur: 0 });
  const videoId = video?.id;
  const flushProgress = useCallback(() => {
    if (videoId && lastTime.current.pos > 0) saveProgress(videoId, lastTime.current.pos, lastTime.current.dur);
  }, [videoId]);
  useEffect(() => {
    if (!playing) return;
    const tick = async () => {
      try {
        const [pos, dur] = await Promise.all([playerRef.current!.getCurrentTime(), playerRef.current!.getDuration()]);
        lastTime.current = { pos, dur };
        flushProgress();
      } catch {
        // player not ready yet
      }
    };
    const id = setInterval(tick, PROGRESS_EVERY_MS);
    return () => clearInterval(id);
  }, [playing, session, flushProgress]);
  useEffect(() => {
    lastTime.current = { pos: 0, dur: 0 };
    return flushProgress; // the session ends: save where it got to
  }, [session, flushProgress]);

  const onStateChange = useCallback(
    (state: string) => {
      if (state === 'playing') setPlaying(true);
      else if (state === 'paused') {
        setPlaying(false);
        playerRef.current
          ?.getCurrentTime()
          .then((pos) => {
            lastTime.current.pos = pos;
            flushProgress();
          })
          .catch(() => {});
      } else if (state === 'ended' && videoId) {
        setPlaying(false);
        saveProgress(videoId, lastTime.current.dur || video?.duration || 0, lastTime.current.dur);
        lastTime.current.pos = 0;
      }
    },
    [flushProgress, videoId, video?.duration],
  );

  // Fixed for the life of this session: the WebView only reads them once.
  const playerParams = useMemo(
    () => ({
      rel: false,
      controls: true,
      iv_load_policy: 3,
      preventFullScreen: true,
      modestbranding: true,
      ...(resumeAt > 0 ? { start: resumeAt } : {}),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session],
  );

  // ---- Gestures ---------------------------------------------------------------
  const toMini = useCallback(() => {
    if (landscape) lockPortrait();
    minimizePlayer();
  }, [landscape]);
  const toFull = useCallback(() => expandPlayer(), []);
  const dismiss = useCallback(() => closePlayer(), []);

  const travel = H - MINI_DEFAULT_W; // rough drag distance for the full-to-mini gesture

  // Full mode, portrait: drag the video down to minimise. Taps pass to the embed.
  const dragDown = Gesture.Pan()
    .enabled(!isMini && !landscape)
    .activeOffsetY([-14, 14])
    .failOffsetX([-20, 20])
    .onBegin(() => {
      dragStart.value = p.value;
    })
    .onStart(() => {
      runOnJS(parkMini)();
    })
    .onUpdate((e) => {
      p.value = Math.max(0, Math.min(1, dragStart.value + e.translationY / travel));
    })
    .onEnd((e) => {
      const minimise = e.velocityY > 400 || (p.value > 0.3 && e.velocityY > -400);
      p.value = withTiming(minimise ? 1 : 0, { duration: 220, easing: Easing.out(Easing.cubic) });
      if (minimise) runOnJS(toMini)();
    });

  const clampMini = (x: number, y: number) => {
    'worklet';
    const h = (miniW.value * 9) / 16;
    const maxY = H - bottomLimit.value - h - MINI_MARGIN;
    return {
      x: Math.max(MINI_MARGIN, Math.min(W - miniW.value - MINI_MARGIN, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  };

  // Slide the window off the bottom of the screen, then close.
  const slideOut = () => {
    'worklet';
    const h = (miniW.value * 9) / 16;
    alpha.value = withTiming(0, { duration: 240 });
    miniY.value = withTiming(H + h, { duration: 240, easing: Easing.in(Easing.cubic) }, (done) => {
      if (done) runOnJS(dismiss)();
    });
  };

  // Mini mode: drag up to expand (the window grows under your finger, like
  // YouTube), drag down past the bottom to dismiss, otherwise move it.
  const moveMini = Gesture.Pan()
    .enabled(isMini)
    .minDistance(6)
    .onBegin(() => {
      startX.value = miniX.value;
      startY.value = miniY.value;
    })
    .onUpdate((e) => {
      if (e.translationY < 0 && -e.translationY > Math.abs(e.translationX)) {
        // Upward: expand progressively.
        miniX.value = startX.value;
        miniY.value = startY.value;
        p.value = 1 - Math.min(1, -e.translationY / (travel * 0.6));
      } else {
        p.value = 1;
        miniX.value = startX.value + e.translationX;
        miniY.value = startY.value + e.translationY;
      }
    })
    .onEnd((e) => {
      const h = (miniW.value * 9) / 16;
      if (p.value < 1) {
        const expand = p.value < 0.55 || e.velocityY < -800;
        p.value = withTiming(expand ? 0 : 1, { duration: 220, easing: Easing.out(Easing.cubic) });
        if (expand) runOnJS(toFull)();
        return;
      }
      const floor = H - bottomLimit.value; // top of the tab bar (or the screen bottom)
      if (e.velocityY > 1200 || miniY.value + h / 2 > floor) {
        slideOut();
        return;
      }
      // Snap to the nearer side, clamp vertically, carrying the fling's momentum.
      const projX = miniX.value + e.velocityX * 0.08;
      const projY = miniY.value + e.velocityY * 0.08;
      const left = projX + miniW.value / 2 < W / 2;
      const target = clampMini(left ? MINI_MARGIN : W - miniW.value - MINI_MARGIN, projY);
      miniX.value = withSpring(target.x, SPRING);
      miniY.value = withSpring(target.y, SPRING);
    });

  // Mini mode: pinch to resize about the window's centre.
  const zoomMini = Gesture.Pinch()
    .enabled(isMini)
    .onBegin(() => {
      startW.value = miniW.value;
      startX.value = miniX.value;
      startY.value = miniY.value;
    })
    .onUpdate((e) => {
      const w = Math.max(MINI_MIN_W, Math.min(maxMiniW, startW.value * e.scale));
      const dw = w - startW.value;
      miniW.value = w;
      miniX.value = startX.value - dw / 2;
      miniY.value = startY.value - (dw * 9) / 32;
    })
    .onEnd(() => {
      const c = clampMini(miniX.value, miniY.value);
      miniX.value = withSpring(c.x, SPRING);
      miniY.value = withSpring(c.y, SPRING);
    });

  const expandTap = Gesture.Tap()
    .enabled(isMini)
    .numberOfTaps(2)
    .maxDelay(250)
    .onEnd(() => {
      p.value = withTiming(0, { duration: 220 });
      runOnJS(toFull)();
    });

  const gesture = Gesture.Race(dragDown, Gesture.Simultaneous(moveMini, zoomMini), expandTap);

  // ---- Animated styles --------------------------------------------------------
  // The video box is always videoW x videoH; it is scaled and moved between the
  // full rect and the mini rect so the embed never has to re-lay itself out.
  const videoBox = useAnimatedStyle(() => {
    const s = interpolate(p.value, [0, 1], [1, miniW.value / videoW]);
    const left = interpolate(p.value, [0, 1], [videoLeft, miniX.value]);
    const top = interpolate(p.value, [0, 1], [videoTop, miniY.value]);
    return {
      opacity: alpha.value,
      transform: [
        { translateX: left + (videoW * s - videoW) / 2 },
        { translateY: top + (videoH * s - videoH) / 2 },
        { scale: s },
      ],
      borderRadius: interpolate(p.value, [0, 1], [0, MINI_RADIUS / s]),
    };
  });
  const shadow = useAnimatedStyle(() => ({ opacity: p.value * alpha.value }));
  const backdrop = useAnimatedStyle(() => ({ opacity: 1 - p.value }));
  // The mini controls sit on the window's rect and only show once it is small.
  const miniControls = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0.85, 1], [0, 1]) * alpha.value,
    left: miniX.value,
    top: miniY.value,
    width: miniW.value,
    height: (miniW.value * 9) / 16,
  }));

  if (!video) return null;

  const bg = landscape ? '#000' : t.background;

  return (
    <View style={[styles.container, { width: W, height: H }]} pointerEvents={isMini ? 'box-none' : 'auto'}>
      <StatusBar hidden={landscape && !isMini} />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: bg }, backdrop]} pointerEvents="none" />

      {/* Portrait, full mode: title, channel, counts, actions, description. */}
      {!landscape && (
        <Animated.View
          style={[styles.details, { top: videoTop + videoH }, backdrop]}
          pointerEvents={isMini ? 'none' : 'auto'}>
          <Details video={video} />
        </Animated.View>
      )}

      {/* Soft shadow under the floating window. */}
      <Animated.View
        style={[styles.videoBox, styles.shadow, { width: videoW, height: videoH }, videoBox, shadow]}
        pointerEvents="none"
      />

      {/* The video, scaled between full size and the mini window. */}
      <GestureDetector gesture={gesture}>
        <Animated.View
          onTouchStart={showControls}
          style={[styles.videoBox, { width: videoW, height: videoH, overflow: 'hidden' }, videoBox]}>
          <YoutubePlayer
            key={session}
            ref={playerRef}
            height={videoH}
            width={videoW}
            videoId={video.id}
            play={playing}
            onChangeState={onStateChange}
            initialPlayerParams={playerParams}
            webViewProps={WEBVIEW_PROPS}
          />
          {!isMini && controlsShown && (
            <Pressable
              onPress={toggleFullscreen}
              hitSlop={6}
              accessibilityLabel={landscape ? 'Exit full screen' : 'Full screen'}
              style={({ pressed }) => [styles.fullscreenBtn, pressed && { opacity: 0.6 }]}>
              <Ionicons name={landscape ? 'contract' : 'expand'} size={20} color="#fff" />
            </Pressable>
          )}
        </Animated.View>
      </GestureDetector>

      {/* Mini window controls: play/pause top left, close top right. */}
      <Animated.View style={[styles.miniControls, miniControls]} pointerEvents={isMini ? 'box-none' : 'none'}>
        <Pressable
          onPress={togglePlaying}
          hitSlop={6}
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          style={({ pressed }) => [styles.miniBtn, pressed && { opacity: 0.6 }]}>
          <Ionicons name={playing ? 'pause' : 'play'} size={18} color="#fff" />
        </Pressable>
        <Pressable
          onPress={() => {
            flushProgress();
            slideOut();
          }}
          hitSlop={6}
          accessibilityLabel="Close"
          style={({ pressed }) => [styles.miniBtn, pressed && { opacity: 0.6 }]}>
          <Ionicons name="close" size={20} color="#fff" />
        </Pressable>
      </Animated.View>
    </View>
  );
}

/**
 * Under the video in portrait: a one-line title (tap to show all of it and
 * the description), the channel row with Subscribe, counts, and the Like,
 * Save and Ask buttons. Details missing from the list row (views, likes,
 * description) are fetched once per video.
 */
function Details({ video }: { video: Video }) {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null | undefined>(undefined);
  const [liked, setLiked] = useState<boolean | undefined>(undefined);
  const [busy, setBusy] = useState<'sub' | 'like' | null>(null);

  useEffect(() => {
    setExpanded(false);
    setChannel(null);
    setSubscriptionId(undefined);
    setLiked(undefined);
    let alive = true;
    if (video.viewCount === undefined || video.likeCount === undefined || !video.description) {
      api
        .video(video.id)
        .then((d) => alive && updateVideo(d))
        .catch(() => {});
    }
    api
      .channelInfo(video.channelId)
      .then((c) => alive && setChannel(c))
      .catch(() => {});
    api
      .subscription(video.channelId)
      .then((id) => alive && setSubscriptionId(id))
      .catch(() => alive && setSubscriptionId(null));
    api
      .rating(video.id)
      .then((r) => alive && setLiked(r === 'like'))
      .catch(() => alive && setLiked(false));
    return () => {
      alive = false;
    };
  }, [video.id, video.channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSubscribe = async () => {
    if (busy || subscriptionId === undefined) return;
    setBusy('sub');
    try {
      if (subscriptionId) {
        await api.unsubscribe(subscriptionId);
        setSubscriptionId(null);
      } else {
        setSubscriptionId(await api.subscribe(video.channelId));
      }
    } catch (e: any) {
      Alert.alert('Could not update subscription', e.message ?? String(e));
    } finally {
      setBusy(null);
    }
  };

  const toggleLike = async () => {
    if (busy || liked === undefined) return;
    setBusy('like');
    const next = !liked;
    setLiked(next);
    try {
      if (next) await api.like(video.id);
      else await api.unlike(video.id);
      if (video.likeCount !== undefined) updateVideo({ likeCount: Math.max(0, video.likeCount + (next ? 1 : -1)) });
    } catch (e: any) {
      setLiked(!next);
      Alert.alert('Could not update like', e.message ?? String(e));
    } finally {
      setBusy(null);
    }
  };

  // YouTube's in-app Gemini is not open to other apps; Google's AI Mode is the
  // nearest thing, and it reads the video from its link.
  const ask = () => {
    const q = `Tell me about this YouTube video and summarise it: https://www.youtube.com/watch?v=${video.id}`;
    Linking.openURL(`https://www.google.com/search?udm=50&q=${encodeURIComponent(q)}`);
  };

  const openChannel = () => {
    minimizePlayer();
    router.push({ pathname: '/channel/[id]', params: { id: video.channelId, title: video.channelTitle } });
  };

  const counts = [
    video.viewCount !== undefined ? `${formatCount(video.viewCount)} views` : null,
    video.likeCount !== undefined ? `${formatCount(video.likeCount)} likes` : null,
    video.publishedAt ? (expanded ? shortDate(video.publishedAt) : timeAgo(video.publishedAt)) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      <Pressable onPress={() => setExpanded((v) => !v)} style={styles.titleRow}>
        <Text style={[styles.title, { color: t.text }]} numberOfLines={expanded ? undefined : 1}>
          {video.title}
        </Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={t.secondary} />
      </Pressable>

      <View style={styles.channelRow}>
        <Pressable onPress={openChannel} style={styles.channelInfo}>
          {channel?.thumbnail ? (
            <Image source={{ uri: channel.thumbnail }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: t.surfaceHigh }]} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.channelName, { color: t.text }]} numberOfLines={1}>
              {video.channelTitle}
              {channel?.subscriberCount != null && (
                <Text style={{ color: t.secondary, fontWeight: '400' }}>
                  {'  '}
                  {formatCount(channel.subscriberCount)}
                </Text>
              )}
            </Text>
            {!!counts && (
              <Text style={[styles.counts, { color: t.secondary }]} numberOfLines={1}>
                {counts}
              </Text>
            )}
          </View>
        </Pressable>
        <Pressable
          onPress={toggleSubscribe}
          disabled={subscriptionId === undefined || busy === 'sub'}
          style={({ pressed }) => [
            styles.subscribe,
            { backgroundColor: subscriptionId ? t.surface : t.text, opacity: pressed || busy === 'sub' ? 0.7 : 1 },
          ]}>
          {subscriptionId ? (
            <>
              <Ionicons name="notifications-outline" size={16} color={t.text} />
              <Text style={[styles.subscribeText, { color: t.text }]}>Subscribed</Text>
            </>
          ) : (
            <Text style={[styles.subscribeText, { color: t.background }]}>
              {subscriptionId === undefined ? '…' : 'Subscribe'}
            </Text>
          )}
        </Pressable>
      </View>

      <View style={styles.actions}>
        <ActionButton
          icon={liked ? 'thumbs-up' : 'thumbs-up-outline'}
          label={video.likeCount !== undefined ? formatCount(video.likeCount) : 'Like'}
          active={!!liked}
          onPress={toggleLike}
        />
        <ActionButton
          icon="bookmark-outline"
          label="Save"
          onPress={() => router.push({ pathname: '/save/[id]', params: { id: video.id, title: video.title } })}
        />
        <ActionButton icon="sparkles-outline" label="Ask" onPress={ask} />
      </View>

      {expanded && (
        <View style={[styles.description, { backgroundColor: t.surface }]}>
          <Text style={[styles.descMeta, { color: t.text }]}>
            {[
              video.viewCount !== undefined ? `${formatCount(video.viewCount)} views` : null,
              video.publishedAt ? shortDate(video.publishedAt) : null,
              video.duration ? formatDuration(video.duration) : null,
            ]
              .filter(Boolean)
              .join('  ')}
          </Text>
          {!!video.description && (
            <Text style={[styles.descriptionText, { color: t.text }]} selectable>
              {video.description.trim()}
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function ActionButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const fg = active ? t.background : t.text;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: active ? t.text : t.surface },
        pressed && { opacity: 0.75 },
      ]}>
      <Ionicons name={icon} size={18} color={fg} />
      <Text style={[styles.actionText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 0, top: 0, zIndex: 50 },
  videoBox: { position: 'absolute', left: 0, top: 0, backgroundColor: '#000' },
  shadow: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  details: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  title: { flex: 1, fontSize: 17, fontWeight: '600', lineHeight: 23 },
  channelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12 },
  channelInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  channelName: { fontSize: 14, fontWeight: '600' },
  counts: { fontSize: 12, marginTop: 2 },
  subscribe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
  },
  subscribeText: { fontSize: 14, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 12,
  },
  actionText: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  description: { marginHorizontal: 16, padding: 12, borderRadius: 12, gap: 10 },
  descMeta: { fontSize: 13, fontWeight: '600' },
  descriptionText: { fontSize: 14, lineHeight: 20 },
  // Sized to sit over the YouTube logo at the right end of the embed's control bar.
  fullscreenBtn: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 36,
    height: 34,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniControls: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 4,
  },
  miniBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
