import React, { useEffect } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/lib/theme';

/** A grey placeholder block that breathes, like YouTube's skeleton screens. */
export function Skeleton({ style }: { style?: ViewStyle | ViewStyle[] }) {
  const t = useTheme();
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.45, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse]);
  const anim = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[{ backgroundColor: t.skeleton, borderRadius: 8 }, style, anim]} />;
}

export function CompactRowSkeleton() {
  return (
    <View style={styles.row}>
      <Skeleton style={styles.thumb} />
      <View style={{ flex: 1, gap: 8, paddingTop: 2 }}>
        <Skeleton style={{ height: 14, width: '95%' }} />
        <Skeleton style={{ height: 14, width: '70%' }} />
        <Skeleton style={{ height: 12, width: '45%' }} />
      </View>
    </View>
  );
}

export function CardSkeleton() {
  return (
    <View style={{ marginBottom: 20 }}>
      <Skeleton style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 0 }} />
      <View style={{ flexDirection: 'row', gap: 12, padding: 12 }}>
        <Skeleton style={{ width: 36, height: 36, borderRadius: 18 }} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton style={{ height: 14, width: '90%' }} />
          <Skeleton style={{ height: 12, width: '55%' }} />
        </View>
      </View>
    </View>
  );
}

export function ListSkeleton({ layout = 'compact', count = 7 }: { layout?: 'compact' | 'card'; count?: number }) {
  const Row = layout === 'card' ? CardSkeleton : CompactRowSkeleton;
  const n = layout === 'card' ? Math.min(count, 3) : count;
  return (
    <View style={{ paddingTop: layout === 'card' ? 0 : 4 }}>
      {Array.from({ length: n }, (_, i) => (
        <Row key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 12 },
  thumb: { width: 160, height: 90 },
});
