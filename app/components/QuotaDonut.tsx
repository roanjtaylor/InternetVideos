import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { Quota } from '@/lib/api';
import { useTheme } from '@/lib/theme';

const SIZE = 150;
const STROKE = 18;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

/**
 * Today's API quota as a donut: one slice per kind of call (search costs
 * 100 units, writes 50, reads 1) and the unused remainder in grey. Slices are
 * separated by a surface-coloured gap so adjacent colours never touch.
 */
export function QuotaDonut({ quota }: { quota: Quota & { limit: number } }) {
  const t = useTheme();
  const slices = [
    { key: 'search', label: 'Search', value: quota.search, color: t.chart.search },
    { key: 'writes', label: 'Saves & likes', value: quota.writes, color: t.chart.writes },
    { key: 'reads', label: 'Lists & lookups', value: quota.reads, color: t.chart.reads },
  ];
  const used = Math.min(quota.used, quota.limit);
  const remaining = Math.max(0, quota.limit - used);
  const pct = Math.round((used / quota.limit) * 100);

  let offset = 0;
  const arcs = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const frac = Math.min(s.value, quota.limit) / quota.limit;
      const len = Math.max(0, frac * C - 2); // 2px gap between fills
      const arc = { ...s, dasharray: `${len} ${C - len}`, dashoffset: -offset * C };
      offset += frac;
      return arc;
    });

  return (
    <View style={styles.wrap}>
      <View style={{ width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={t.chart.remaining} strokeWidth={STROKE} fill="none" />
          {arcs.map((a) => (
            <Circle
              key={a.key}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke={a.color}
              strokeWidth={STROKE}
              fill="none"
              strokeDasharray={a.dasharray}
              strokeDashoffset={a.dashoffset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          ))}
        </Svg>
        <View style={styles.centerLabel} pointerEvents="none">
          <Text style={[styles.pct, { color: t.text }]}>{pct}%</Text>
          <Text style={[styles.pctSub, { color: t.secondary }]}>used</Text>
        </View>
      </View>
      <View style={styles.legend}>
        {slices.map((s) => (
          <View key={s.key} style={styles.legendRow}>
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <Text style={[styles.legendLabel, { color: t.text }]} numberOfLines={1}>
              {s.label}
            </Text>
            <Text style={[styles.legendValue, { color: t.secondary }]}>{s.value.toLocaleString()}</Text>
          </View>
        ))}
        <View style={styles.legendRow}>
          <View style={[styles.swatch, { backgroundColor: t.chart.remaining }]} />
          <Text style={[styles.legendLabel, { color: t.text }]}>Remaining</Text>
          <Text style={[styles.legendValue, { color: t.secondary }]}>{remaining.toLocaleString()}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  centerLabel: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  pct: { fontSize: 24, fontWeight: '700' },
  pctSub: { fontSize: 12, marginTop: -2 },
  legend: { flex: 1, gap: 10 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  legendLabel: { flex: 1, fontSize: 13 },
  legendValue: { fontSize: 13, fontVariant: ['tabular-nums'] },
});
