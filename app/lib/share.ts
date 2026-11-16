/**
 * Sharing, the way the YouTube app does it: the system share sheet with the
 * short link (youtu.be/ID for a video, /playlist?list=ID for a playlist), so
 * Copy, Messages, AirDrop and every installed app are one tap away.
 */
import { Platform, Share } from 'react-native';

export const videoUrl = (videoId: string) => `https://youtu.be/${videoId}`;
export const playlistUrl = (playlistId: string) => `https://www.youtube.com/playlist?list=${playlistId}`;

async function shareLink(url: string, title?: string) {
  try {
    // iOS shares a real URL (so Copy gives just the link); Android only takes text.
    await Share.share(Platform.OS === 'ios' ? { url } : { message: url, title }, { subject: title });
  } catch {
    // Dismissed, or no share targets: nothing to do.
  }
}

export const shareVideo = (v: { id: string; title?: string }) => shareLink(videoUrl(v.id), v.title);
export const sharePlaylist = (p: { id: string; title?: string }) => shareLink(playlistUrl(p.id), p.title);

/**
 * For actions fired from a bottom sheet: iOS will not present the share sheet
 * while the sheet's modal is still sliding away, so wait for it to finish.
 */
export const afterSheet = (fn: () => void) => setTimeout(fn, 400);
