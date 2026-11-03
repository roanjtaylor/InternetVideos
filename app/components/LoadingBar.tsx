import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RED } from '@/constants/Colors';
import { useIsLoading } from '@/lib/loading';

/**
 * YouTube's thin red progress line. It rushes to ~85% while a load is in
 * flight, then completes and fades once the load ends.
 */
export function LoadingBar() {
  const loading = useIsLoading();
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);
  const opacity = useSharedValue(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (loading) {
      setMounted(true);
      cancelAnimation(progress);
      progress.value = 0;
      opacity.value = 1;
      progress.value = withSequence(
        withTiming(0.6, { duration: 500, easing: Easing.out(Easing.cubic) }),
        withTiming(0.85, { duration: 2500, easing: Easing.out(Easing.quad) }),
        withTiming(0.95, { duration: 8000, easing: Easing.linear }),
      );
    } else if (mounted) {
      cancelAnimation(progress);
      progress.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
      opacity.value = withSequence(
        withTiming(1, { duration: 180 }),
        withTiming(0, { duration: 250 }, (done) => {
          if (done) runOnJS(setMounted)(false);
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const style = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
    opacity: opacity.value,
  }));

  if (!mounted) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.track, { top: insets.top }]}>
      <Animated.View style={[styles.bar, style]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: { position: 'absolute', left: 0, right: 0, height: 3, zIndex: 100 },
  bar: { height: 3, backgroundColor: RED, borderTopRightRadius: 2, borderBottomRightRadius: 2 },
});
