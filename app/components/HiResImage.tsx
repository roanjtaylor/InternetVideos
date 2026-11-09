import React, { useState } from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

/**
 * A video thumbnail at the best size YouTube has for it. Saved videos (watch
 * history, cached lists) carry whatever small size they were stored with, so
 * ask for the 1280px version by id and step down if the video has none.
 */
export function HiResImage({ videoId, fallback, style }: { videoId: string; fallback?: string | null; style: StyleProp<ImageStyle> }) {
  const chain = [
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
    ...(fallback ? [fallback] : []),
  ];
  const [step, setStep] = useState(0);
  return <Image source={{ uri: chain[Math.min(step, chain.length - 1)] }} style={style} onError={() => setStep((s) => s + 1)} />;
}
