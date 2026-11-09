/**
 * Screen rotation policy. The app is portrait-only except while a video is
 * open full-size: then the phone may rotate, and landscape is full screen.
 * Every call swallows errors so the web build and simulators stay quiet.
 */
import * as ScreenOrientation from 'expo-screen-orientation';

const quiet = (p: Promise<void>) => p.catch(() => {});

export const lockPortrait = () => quiet(ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP));
/** Follow the phone's physical orientation (portrait or landscape). */
export const allowRotation = () => quiet(ScreenOrientation.unlockAsync());
