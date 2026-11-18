import Constants from 'expo-constants';
import React, { useCallback, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

import { getPlayback, playbackSeek, playbackTick, resetPlayback, setPlayback, setPlaying } from '@/lib/player';

/**
 * YouTube's embed player, in one WebView that lives as long as the app.
 *
 * The page is our own HTML, loaded from a string, so nothing is fetched
 * before YouTube's player script. It is created once, with no video, when
 * the app starts; opening a video is then a single loadVideoById on a warm
 * player instead of a new WebView, page and player each time.
 *
 * The embed's own controls are off. The page reports state and time to the
 * app, and the app drives it through the `embed` commands below; the native
 * controls in PlayerControls sit on top.
 */

/** The best quality to ask for. A phone screen gains nothing above this, and higher levels stall more. */
const MAX_QUALITY = 'hd1440';

/**
 * YouTube needs embeds to say who they are with a Referer: for an app, its
 * bundle id as an https origin. Loading the page with this base URL sets it.
 */
const BASE_URL = `https://${(Constants.expoConfig?.ios?.bundleIdentifier ?? 'localhost').toLowerCase()}`;

const HTML = `<!DOCTYPE html>
<html>
<head>
<!-- A wide layout: the embed chooses its starting quality from its own size,
     and at a phone's width it starts at 360p. The WebView scales this to fit. -->
<meta name="viewport" content="width=1280, user-scalable=no">
<meta name="referrer" content="strict-origin-when-cross-origin">
<style>
  html, body { margin: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
  #player { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
</style>
</head>
<body>
<div id="player"></div>
<script>
  var ORDER = ['highres', 'hd2880', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];
  var MAX_QUALITY = '${MAX_QUALITY}';
  var player = null, ready = false;
  var cur = '';          // the video the app asked for
  var qualityFor = '';   // the video whose quality has been set
  var lastT = -1, lastD = -1, lastB = -1;

  function post(o) { try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch (e) {} }

  // YouTube remembers "captions on" in its cookies and ignores cc_load_policy for it.
  var ccOn = false;
  function killCaptions() {
    if (ccOn) return;
    try { player.unloadModule('captions'); } catch (e) {}
    try { player.unloadModule('cc'); } catch (e) {}
  }

  // Quality is set once per video, as soon as its levels are known: that is
  // while it is still buffering its first frames, so playback starts at the
  // chosen level and is never interrupted by a later switch.
  function applyQuality() {
    if (!cur || qualityFor === cur) return;
    var levels = [];
    try { levels = player.getAvailableQualityLevels() || []; } catch (e) {}
    if (!levels.length) return;
    var q = '';
    for (var i = Math.max(0, ORDER.indexOf(MAX_QUALITY)); i < ORDER.length; i++) {
      if (levels.indexOf(ORDER[i]) >= 0) { q = ORDER[i]; break; }
    }
    qualityFor = cur;
    if (!q) return;
    try { if (typeof player.setPlaybackQualityRange === 'function') player.setPlaybackQualityRange(q, q); } catch (e) {}
    try { player.setPlaybackQuality(q); } catch (e) {}
  }

  function tick(force) {
    if (!ready || !cur) return;
    var t = 0, d = 0, b = 0;
    try {
      t = player.getCurrentTime() || 0;
      d = player.getDuration() || 0;
      b = player.getVideoLoadedFraction() || 0;
    } catch (e) {}
    if (!force && t === lastT && d === lastD && Math.abs(b - lastB) < 0.01) return;
    lastT = t; lastD = d; lastB = b;
    post({ e: 'tick', v: cur, t: t, d: d, b: b });
  }

  setInterval(function () {
    if (!ready) return;
    applyQuality();
    tick(false);
  }, 250);

  window.iv = {
    load: function (id, start) {
      if (!ready) return;
      cur = id; qualityFor = ''; lastT = -1;
      player.loadVideoById({ videoId: id, startSeconds: start || 0 });
    },
    play: function () { if (ready) player.playVideo(); },
    pause: function () { if (ready) player.pauseVideo(); },
    seek: function (t) { if (ready) { player.seekTo(t, true); lastT = -1; } },
    cc: function (on) {
      ccOn = !!on;
      if (!ready) return;
      if (ccOn) {
        try { player.loadModule('captions'); } catch (e) {}
        try { player.setOption('captions', 'reload', true); } catch (e) {}
      } else killCaptions();
    },
    rate: function (r) { if (ready) player.setPlaybackRate(r); },
    stop: function () { cur = ''; if (ready) player.stopVideo(); }
  };

  function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
      width: '100%',
      height: '100%',
      playerVars: {
        playsinline: 1, controls: 0, disablekb: 1, fs: 0, rel: 0,
        iv_load_policy: 3, cc_load_policy: 0, modestbranding: 1,
        origin: location.origin
      },
      events: {
        onReady: function () { ready = true; killCaptions(); post({ e: 'ready' }); },
        onStateChange: function (ev) {
          if (ev.data === 1 || ev.data === 3) { killCaptions(); applyQuality(); }
          post({ e: 'state', v: cur, s: ev.data });
          tick(true);
        },
        onPlaybackRateChange: function (ev) { post({ e: 'rate', r: ev.data }); },
        onError: function (ev) { post({ e: 'error', v: cur, code: ev.data }); }
      }
    });
  }

  // Load YouTube's player script, trying again if the phone was offline.
  (function boot() {
    var s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = function () { s.remove(); setTimeout(boot, 2000); };
    document.head.appendChild(s);
  })();
</script>
</body>
</html>`;

/**
 * Runs in every frame, and acts only inside YouTube's: hides the parts of the
 * embed that our own controls replace and that can no longer be tapped (the
 * title bar, the logo, the "more videos" shelf on pause, the end screen).
 */
const FRAME_JS = `
(function () {
  try {
    if (window.top === window) return;
    if (!/(^|\\.)youtube(-nocookie)?\\.com$/.test(location.hostname)) return;
    var css = '.ytp-chrome-top,.ytp-gradient-top,.ytp-watermark,.ytp-pause-overlay,.ytp-pause-overlay-container,' +
      '.ytp-endscreen-content,.html5-endscreen,.ytp-ce-element,.ytp-cards-teaser,.ytp-cards-button,' +
      '.ytp-title,.ytp-title-channel,.ytp-title-beacon,.ytp-chrome-top-buttons,.ytp-share-button,.ytp-youtube-button,.ytp-impression-link,.ytp-gradient-bottom,.ytp-videowall-still,.ytp-suggestions,.ytp-related-on-error-overlay,.ytp-large-play-button,.ytp-spinner,.ytp-bezel,.ytp-doubletap-ui-legacy{display:none !important;opacity:0 !important}';
    function add() {
      var s = document.createElement('style');
      s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    }
    if (document.head || document.documentElement) add();
    else document.addEventListener('DOMContentLoaded', add);
  } catch (e) {}
})();
true;
`;

const SOURCE = { html: HTML, baseUrl: BASE_URL };
const ORIGINS = ['*'];

// ---- Commands -------------------------------------------------------------------
// There is one embed, so its handle is module state rather than a ref passed around.

let web: WebView | null = null;
let ready = false;
/** The video that should be loaded, kept so it can be (re)sent when the player becomes ready. */
let wanted: { id: string; start: number } | null = null;

function run(js: string) {
  if (ready) web?.injectJavaScript(`try{${js}}catch(e){}true;`);
}

export const embed = {
  /** Load and play a video from `start` seconds. Safe before the player is ready: it is sent when it is. */
  load(id: string, start = 0) {
    wanted = { id, start };
    run(`iv.load(${JSON.stringify(id)},${Math.max(0, Math.floor(start))})`);
  },
  play: () => run('iv.play()'),
  pause: () => run('iv.pause()'),
  seek(seconds: number) {
    const { duration } = getPlayback();
    const t = Math.max(0, duration ? Math.min(duration - 0.5, seconds) : seconds);
    playbackSeek(t);
    run(`iv.seek(${t})`);
  },
  seekBy: (delta: number) => embed.seek(getPlayback().time + delta),
  setRate: (rate: number) => run(`iv.rate(${rate})`),
  setCaptions: (on: boolean) => run(`iv.cc(${on})`),
  stop() {
    wanted = null;
    run('iv.stop()');
  },
};

export function PlayerEmbed() {
  const ref = useRef<WebView>(null);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    let m: any;
    try {
      m = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (m.e === 'ready') {
      web = ref.current;
      ready = true;
      if (wanted) embed.load(wanted.id, wanted.start);
      return;
    }
    if (m.e === 'rate') {
      setPlayback({ rate: Number(m.r) || 1 });
      return;
    }
    // Everything else is about one video: drop reports from a video since replaced or closed.
    if (!wanted || m.v !== wanted.id) return;
    if (m.e === 'tick') {
      playbackTick(m.t, m.d, m.b);
    } else if (m.e === 'error') {
      setPlayback({ status: 'error' });
      setPlaying(false);
    } else if (m.e === 'state') {
      switch (m.s) {
        case 1:
          setPlayback({ status: 'playing' });
          setPlaying(true);
          break;
        case 2:
        case 5:
          setPlayback({ status: 'paused' });
          setPlaying(false);
          break;
        case 3:
          setPlayback({ status: 'buffering' });
          break;
        case 0:
          setPlayback({ status: 'ended' });
          setPlaying(false);
          break;
        default:
          setPlayback({ status: 'loading' });
      }
    }
  }, []);

  // iOS can kill a WebView's process to reclaim memory. Start the page again
  // and carry on from where the video was.
  const onTerminate = useCallback(() => {
    ready = false;
    if (wanted) {
      wanted = { id: wanted.id, start: getPlayback().time };
      resetPlayback(wanted.start, getPlayback().duration);
    }
    ref.current?.reload();
  }, []);

  return (
    <WebView
      ref={ref}
      source={SOURCE}
      originWhitelist={ORIGINS}
      style={styles.web}
      onMessage={onMessage}
      onContentProcessDidTerminate={onTerminate}
      // Our page and the frames inside it may load; nothing may navigate the page away.
      onShouldStartLoadWithRequest={(req) =>
        req.isTopFrame === false || req.url.startsWith(BASE_URL) || req.url === 'about:blank'
      }
      injectedJavaScriptBeforeContentLoaded={FRAME_JS}
      injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      allowsFullscreenVideo={false}
      allowsBackForwardNavigationGestures={false}
      allowsAirPlayForMediaPlayback
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      androidLayerType="hardware"
      javaScriptEnabled
      domStorageEnabled
    />
  );
}

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: '#000' },
});
