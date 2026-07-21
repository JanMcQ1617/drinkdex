import React from 'react';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

import { colors } from '@/constants/theme';
import type { Drink } from '@/types';

import { resolveShape, SHAPES, takesFoam } from './glasses';
import { liquidColor } from './liquid';

export { resolveShape, SHAPES } from './glasses';
export { liquidColor, LIQUID } from './liquid';
export type { GlassShape } from './glasses';

/* ==================================================================== */
/* Garnish                                                              */
/* ==================================================================== */

type GarnishKind = 'wheel' | 'wedge' | 'olive' | 'cherry' | 'sprig' | 'twist' | null;

function resolveGarnish(drink: Drink): GarnishKind {
  const g = (drink.recipe?.garnish ?? '').toLowerCase();
  const n = drink.name.toLowerCase();
  const src = `${g} ${n}`;

  if (!g && drink.category !== 'cocktail') return null;
  if (/olive|onion|gibson/.test(src)) return 'olive';
  if (/cherry|luxardo|maraschino/.test(src)) return 'cherry';
  if (/mint|basil|rosemary|thyme|sprig|herb/.test(src)) return 'sprig';
  if (/twist|peel|zest|expressed/.test(src)) return 'twist';
  if (/wedge|slice/.test(src)) return 'wedge';
  if (/wheel|round|orange|lime|lemon|grapefruit/.test(src)) return 'wheel';
  return null;
}

function Garnish({ kind, x, y, tint }: { kind: GarnishKind; x: number; y: number; tint: string }) {
  switch (kind) {
    case 'wheel':
      return (
        <G>
          <Circle cx={x} cy={y} r={7} fill={tint} stroke={colors.wineDeep} strokeWidth={1.4} />
          <Path
            d={`M${x - 7} ${y} H${x + 7} M${x} ${y - 7} V${y + 7}`}
            stroke={colors.wineDeep}
            strokeWidth={0.9}
            opacity={0.55}
          />
        </G>
      );
    case 'wedge':
      return (
        <Path
          d={`M${x - 7} ${y + 5} A8 8 0 0 1 ${x + 7} ${y + 5} Z`}
          fill={tint}
          stroke={colors.wineDeep}
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
      );
    case 'olive':
      return (
        <G>
          <Path
            d={`M${x} ${y - 9} V${y + 2}`}
            stroke={colors.wineDeep}
            strokeWidth={1.2}
            strokeLinecap="round"
          />
          <Circle cx={x} cy={y + 5} r={5} fill="#8FA83E" stroke={colors.wineDeep} strokeWidth={1.3} />
          <Circle cx={x} cy={y + 5} r={1.8} fill="#C4453A" />
        </G>
      );
    case 'cherry':
      return (
        <G>
          <Path
            d={`M${x} ${y - 9} Q${x + 3} ${y - 3} ${x + 1} ${y + 1}`}
            stroke="#6B4A22"
            strokeWidth={1.2}
            fill="none"
            strokeLinecap="round"
          />
          <Circle cx={x} cy={y + 5} r={5} fill="#B02A3A" stroke={colors.wineDeep} strokeWidth={1.3} />
        </G>
      );
    case 'sprig':
      return (
        <G stroke="#4E7A32" strokeWidth={1.5} strokeLinecap="round" fill="none">
          <Path d={`M${x} ${y + 6} V${y - 8}`} />
          <Path d={`M${x} ${y - 4} Q${x + 6} ${y - 7} ${x + 5} ${y - 12}`} />
          <Path d={`M${x} ${y - 1} Q${x - 6} ${y - 4} ${x - 5} ${y - 9}`} />
        </G>
      );
    case 'twist':
      return (
        <Path
          d={`M${x - 4} ${y - 8} Q${x + 6} ${y - 4} ${x} ${y + 2} Q${x - 6} ${y + 7} ${x + 3} ${y + 9}`}
          stroke="#E0A93A"
          strokeWidth={2.6}
          fill="none"
          strokeLinecap="round"
        />
      );
    default:
      return null;
  }
}

/* ==================================================================== */
/* DrinkArt                                                             */
/* ==================================================================== */

export interface DrinkArtProps {
  drink: Drink;
  size?: number;
  /**
   * Renders the vessel as a black-ink silhouette — form readable, color
   * withheld. The "not yet collected" state.
   */
  locked?: boolean;
  /** Hides the soft radial ground shadow. */
  flat?: boolean;
}

export const DrinkArt = React.memo(function DrinkArt({
  drink,
  size = 96,
  locked = false,
  flat = false,
}: DrinkArtProps) {
  const shape = resolveShape(drink);
  const def = SHAPES[shape];
  const gradId = `g-${shape}-${locked ? 'l' : 'u'}`;

  const pour = locked ? colors.lockInkSoft : liquidColor(drink);
  const glassStroke = locked ? colors.lockInk : 'rgba(43, 24, 32, 0.55)';
  const foamFill = locked ? '#4A2C36' : '#FBF3E4';
  const garnish = locked ? null : resolveGarnish(drink);
  const showFoam = def.foam && takesFoam(shape, drink.category);

  return (
    <Svg width={size} height={size * (112 / 100)} viewBox="0 0 100 112" fill="none">
      <Defs>
        {/* Depth in the pour — flat fill reads as clip art. */}
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={pour} stopOpacity={locked ? 0.92 : 0.82} />
          <Stop offset="1" stopColor={pour} stopOpacity={1} />
        </LinearGradient>
      </Defs>

      {!flat && <Circle cx={50} cy={103} r={20} fill={colors.wineDeep} opacity={0.06} />}

      <Path d={def.liquid} fill={`url(#${gradId})`} />
      {showFoam && <Path d={def.foam} fill={foamFill} opacity={locked ? 1 : 0.96} />}

      <Path
        d={def.vessel}
        stroke={glassStroke}
        strokeWidth={2.2}
        strokeLinejoin="round"
        fill={locked ? colors.lockInk : 'none'}
        fillOpacity={locked ? 0.18 : 0}
      />

      {def.parts?.map((d, i) => (
        <Path
          key={i}
          d={d}
          stroke={glassStroke}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={locked ? colors.lockInk : 'none'}
          fillOpacity={locked ? 0.18 : 0}
        />
      ))}

      {/* Specular highlight — the single detail that sells it as glass. */}
      {!locked && (
        <Path
          d={def.vessel}
          stroke="rgba(255,255,255,0.75)"
          strokeWidth={0.9}
          fill="none"
          opacity={0.5}
        />
      )}

      {garnish && def.garnishAt && (
        <Garnish kind={garnish} x={def.garnishAt.x} y={def.garnishAt.y} tint={pour} />
      )}
    </Svg>
  );
});
