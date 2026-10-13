import React from 'react';
import { StyleSheet, View } from 'react-native';

import { CheckRow } from '../CheckRow';
import { CheckTile } from '../CheckTile';
import { GAP, MARGIN, OPTIONS_GAP, type Geometry } from '../metrics';
import { OptionRow } from '../OptionRow';
import { OptionTile } from '../OptionTile';

import { Shell } from './Shell';

/* ==================================================================== */
/* The questions (mode C)                                               */
/*                                                                      */
/*   SingleStep  a list, one answer (radio): the age, how you heard,    */
/*               what you usually drink, whether you make drinks at home */
/*   MultiStep   a checklist (checkbox): the spirits, the follow-up      */
/*   GridStep    two columns of keys: the flavours (no box) and the bar */
/*               (boxed tiles), one column at the two largest sizes.    */
/*               An odd count leaves the last key alone on the left at  */
/*               the same width (the seven flavours' Creamy, v4.2 1.2): */
/*               a full-width key would read as a different answer.     */
/*                                                                      */
/* Presentational: the flow holds the answers and says what a tap does. */
/* ==================================================================== */

export interface Option<K extends string> {
  key: K;
  label: string;
}

interface Common {
  geo: Geometry;
  prompt: string;
  sub?: string | null;
  focus: boolean;
}

export function SingleStep<K extends string>({
  geo,
  prompt,
  sub,
  focus,
  options,
  value,
  onPick,
}: Common & { options: readonly Option<K>[]; value: K | null; onPick: (key: K) => void }) {
  return (
    <Shell geo={geo} mode="C" prompt={prompt} sub={sub} focus={focus}>
      <View accessibilityRole="radiogroup" style={styles.list}>
        {options.map((o) => (
          <OptionRow key={o.key} label={o.label} selected={value === o.key} onPress={() => onPick(o.key)} />
        ))}
      </View>
    </Shell>
  );
}

export function MultiStep<K extends string>({
  geo,
  prompt,
  sub,
  focus,
  options,
  value,
  onToggle,
}: Common & { options: readonly Option<K>[]; value: readonly K[]; onToggle: (key: K) => void }) {
  return (
    <Shell geo={geo} mode="C" prompt={prompt} sub={sub} focus={focus}>
      <View style={styles.list}>
        {options.map((o) => (
          <CheckRow key={o.key} label={o.label} checked={value.includes(o.key)} onPress={() => onToggle(o.key)} />
        ))}
      </View>
    </Shell>
  );
}

export function GridStep<K extends string>({
  geo,
  prompt,
  sub,
  focus,
  options,
  value,
  onToggle,
  boxed,
  card,
}: Common & {
  options: readonly Option<K>[];
  value: readonly K[];
  onToggle: (key: K) => void;
  /** The bar's tiles carry a checkbox; the flavours' keys do not. */
  boxed: boolean;
  card?: React.ReactNode;
}) {
  const width = geo.oneColumn ? geo.contentW : (geo.contentW - GAP) / 2;
  return (
    <Shell geo={geo} mode="C" prompt={prompt} sub={sub} focus={focus} card={card}>
      <View style={styles.grid}>
        {options.map((o) =>
          boxed ? (
            <CheckTile key={o.key} label={o.label} checked={value.includes(o.key)} width={width} onPress={() => onToggle(o.key)} />
          ) : (
            <OptionTile key={o.key} label={o.label} selected={value.includes(o.key)} width={width} onPress={() => onToggle(o.key)} />
          ),
        )}
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: OPTIONS_GAP, paddingHorizontal: MARGIN, gap: GAP },
  grid: { marginTop: OPTIONS_GAP, paddingHorizontal: MARGIN, flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
});
