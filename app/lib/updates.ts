/**
 * Over-the-air updates (EAS Update) for the production app.
 *
 * expo-updates on its own checks at every launch, downloads a new update in
 * the background, and runs it the next time the app is started from cold.
 * That leaves a freshly installed app on the code it was built with until its
 * second launch. So when the running code is the copy inside the build, the
 * app stays on its splash screen while it fetches the latest update and
 * restarts into it. Later launches are not held up.
 */
import * as Updates from 'expo-updates';

/** Long enough for a normal connection, short enough not to strand the app on a bad one. */
const CHECK_TIMEOUT_MS = 4000;
const DOWNLOAD_TIMEOUT_MS = 20000;

function within<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

async function bringUpToDate() {
  // Not in the dev client, and not after a bad update sent the app back to its built-in code.
  if (__DEV__ || !Updates.isEnabled || !Updates.isEmbeddedLaunch || Updates.isEmergencyLaunch) return;
  try {
    const check = await within(Updates.checkForUpdateAsync(), CHECK_TIMEOUT_MS);
    if (!check.isAvailable) return;
    const fetched = await within(Updates.fetchUpdateAsync(), DOWNLOAD_TIMEOUT_MS);
    if (fetched.isNew) await Updates.reloadAsync(); // restarts the app's code: nothing after this runs
  } catch {
    // Offline or slow: carry on with the built-in code; the update arrives in the background.
  }
}

/** Settles once the app may show itself. Started as soon as the code loads. */
export const updateReady: Promise<void> = bringUpToDate();
