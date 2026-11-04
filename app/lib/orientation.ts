/**
 * Screen rotation policy. The app is portrait-only except while a video is
 * open full-size: then the phone may rotate, and landscape is full screen.
 * Every call swallows errors so the web build and simulators stay quiet.
 */
import * as ScreenOrientation from 'expo-screen-orientation';

const quiet = (p: Promise<void>) => p.catch(() => {});

export const lockPortrait = () => quiet(ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP));
/**
 * Full screen from the button: the one landscape side whose rotation from
 * portrait turns clockwise on screen (home indicator ends up on the left),
 * as YouTube does. A plain LANDSCAPE lock lets iOS pick, and it picks the other.
 */
export const lockLandscape = () =>
  quiet(ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_LEFT));
/** Follow the phone's physical orientation (portrait or landscape). */
export const allowRotation = () => quiet(ScreenOrientation.unlockAsync());
