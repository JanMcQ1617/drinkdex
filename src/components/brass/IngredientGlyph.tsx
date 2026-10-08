import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

import { colors, glyphTint } from '@/constants/theme';
import type { Ingredient } from '@/lib/bar';

/* ==================================================================== */
/* Ingredient glyphs (graft 3)                                          */
/*                                                                      */
/* A small picture beside each ingredient in My Bar's checklist: citrus */
/* as a cut disc in its fruit's colour, a spirit as a bottle in its     */
/* liquid's, bitters as a dasher, a syrup or juice as a drop, a mixer   */
/* as bubbles, a herb as a leaf. It lets a long checklist be scanned by */
/* shape before it is read, and it is what makes the labels feel like   */
/* a back bar rather than a form.                                       */
/*                                                                      */
/* DECORATIVE. Every glyph sits beside the ingredient's name, so it     */
/* carries nothing the words do not; it is hidden from VoiceOver and    */
/* its tints (theme.ts `glyphTint`) have no contrast pair. The outline  */
/* is brassShade, which holds 4.91:1 on label stock and 5.32 on paper,  */
/* so the shape still reads where a tint is pale (a clear spirit).      */
/*                                                                      */
/* CHEAP. One Svg in a 24-unit box, two to six elements, memoised on    */
/* the ingredient's id and the size: a checklist re-rendering on a tick */
/* never rebuilds a glyph. The kind and tint are worked out from the    */
/* index's category and id, once per id (GLYPH_CACHE).                  */
/* ==================================================================== */

type Kind = 'citrus' | 'bottle' | 'squat' | 'wine' | 'dasher' | 'drop' | 'bubbles' | 'egg' | 'leaf' | 'star' | 'dot';
type Tint = keyof typeof glyphTint;

const has = (id: string, re: RegExp) => re.test(id);

/** The glyph for an ingredient: its kind from the category, its tint from the id. */
function classify(i: Pick<Ingredient, 'id' | 'category'>): { kind: Kind; tint: Tint } {
  const id = i.id;
  switch (i.category) {
    case 'citrus':
      return {
        kind: 'citrus',
        tint: has(id, /lime/) ? 'lime' : has(id, /grapefruit/) ? 'grapefruit' : has(id, /orange|mandarin|clementine|tangerine/) ? 'orange' : 'lemon',
      };
    case 'spirit':
      return {
        kind: 'bottle',
        tint: has(id, /absinthe/)
          ? 'leaf'
          : has(id, /gin|vodka|white|blanco|silver|plata|pisco|cacha|aquavit|akvavit|grappa|sake|soju|shochu|light|^tequila$|^rum$/)
            ? 'glass'
            : 'amber',
      };
    case 'liqueur':
      return {
        kind: 'squat',
        tint: has(id, /coffee|kahl|cacao|chocolate|espresso/)
          ? 'dark'
          : has(id, /menthe|chartreuse|midori|melon|green/)
            ? 'leaf'
            : has(id, /cherry|cassis|raspberry|sloe|campari|aperol|chambord|blackberry|strawberry/)
              ? 'berry'
              : has(id, /orange|cura|triple|cointreau|grand-marnier/)
                ? 'orange'
                : has(id, /maraschino|elderflower|germain|falernum|cream/)
                  ? 'straw'
                  : 'amber',
      };
    case 'wine':
      return {
        kind: 'wine',
        tint: has(id, /dry|blanc|white|fino|manzanilla|champagne|prosecco|cava|sparkling|lillet|cocchi|bianco/)
          ? 'straw'
          : has(id, /red|port|ruby|rosso|claret|lambrusco/)
            ? 'berry'
            : 'amber',
      };
    case 'bitters':
      return { kind: 'dasher', tint: has(id, /orange/) ? 'orange' : has(id, /celery|mint/) ? 'leaf' : 'berry' };
    case 'syrup':
      return {
        kind: 'drop',
        tint: has(id, /grenadine|raspberry|berry|cherry|pomegranate|hibiscus/)
          ? 'berry'
          : has(id, /honey|agave|maple|demerara|brown|molasses|caramel/)
            ? 'amber'
            : has(id, /orgeat|almond|coconut/)
              ? 'cream'
              : 'straw',
      };
    case 'juice':
      return {
        kind: 'drop',
        tint: has(id, /cranberry|pomegranate|tomato|cherry|raspberry|blood/)
          ? 'berry'
          : has(id, /orange|passion|mango|peach/)
            ? 'orange'
            : has(id, /grapefruit/)
              ? 'grapefruit'
              : has(id, /lime|apple|cucumber/)
                ? 'lime'
                : 'lemon',
      };
    case 'mixer':
      return { kind: 'bubbles', tint: has(id, /cola|coke/) ? 'dark' : has(id, /ginger/) ? 'straw' : 'glass' };
    case 'dairy':
      return { kind: has(id, /egg/) ? 'egg' : 'drop', tint: 'cream' };
    case 'produce':
      return {
        kind: has(id, /berr|cherry|grape/) ? 'dot' : 'leaf',
        tint: has(id, /berr|cherry|grape/) ? 'berry' : 'leaf',
      };
    case 'spice':
      return { kind: 'star', tint: 'amber' };
    default:
      return { kind: 'dot', tint: has(id, /olive/) ? 'lime' : 'amber' };
  }
}

const GLYPH_CACHE = new Map<string, { kind: Kind; tint: Tint }>();
function glyphFor(i: Pick<Ingredient, 'id' | 'category'>) {
  let g = GLYPH_CACHE.get(i.id);
  if (!g) {
    g = classify(i);
    GLYPH_CACHE.set(i.id, g);
  }
  return g;
}

/* Shapes, in a 24 x 24 box, outlined in brassShade. */
const EDGE = colors.brassShade;
const W = 1;

function Shape({ kind, fill }: { kind: Kind; fill: string }) {
  switch (kind) {
    case 'citrus':
      // A cut wheel: rind, pith, six segments.
      return (
        <G>
          <Circle cx={12} cy={12} r={9.5} fill={fill} stroke={EDGE} strokeWidth={W} />
          <Circle cx={12} cy={12} r={7} fill={colors.label} fillOpacity={0.55} />
          <Circle cx={12} cy={12} r={6.2} fill={fill} fillOpacity={0.85} />
          {[0, 60, 120].map((a) => (
            <Line
              key={a}
              x1={12 + 6.2 * Math.cos((a * Math.PI) / 180)}
              y1={12 + 6.2 * Math.sin((a * Math.PI) / 180)}
              x2={12 - 6.2 * Math.cos((a * Math.PI) / 180)}
              y2={12 - 6.2 * Math.sin((a * Math.PI) / 180)}
              stroke={colors.label}
              strokeOpacity={0.8}
              strokeWidth={0.8}
            />
          ))}
        </G>
      );
    case 'bottle':
      // A spirit bottle: cork, neck, shoulders, body.
      return (
        <G>
          <Rect x={10.3} y={1.5} width={3.4} height={2.5} fill={EDGE} />
          <Path
            d="M10.5 4h3v4.2c0 .9 3.7 1.8 3.7 4.6V21a1.5 1.5 0 0 1-1.5 1.5H8.3A1.5 1.5 0 0 1 6.8 21v-8.2c0-2.8 3.7-3.7 3.7-4.6Z"
            fill={fill}
            stroke={EDGE}
            strokeWidth={W}
          />
          <Rect x={8.3} y={14} width={7.4} height={4.5} fill={colors.label} fillOpacity={0.8} />
        </G>
      );
    case 'squat':
      // A liqueur's round bottle.
      return (
        <G>
          <Rect x={10.5} y={2} width={3} height={2.5} fill={EDGE} />
          <Path
            d="M10.7 4.5h2.6v3.2c3.3 1 5.7 4 5.7 7.6a7 7 0 0 1-14 0c0-3.6 2.4-6.6 5.7-7.6Z"
            fill={fill}
            stroke={EDGE}
            strokeWidth={W}
          />
        </G>
      );
    case 'wine':
      // A wine or vermouth bottle: long neck, high shoulder.
      return (
        <G>
          <Rect x={10.6} y={1} width={2.8} height={3} fill={EDGE} />
          <Path
            d="M10.8 4h2.4v5c0 1.2 3.3 1.6 3.3 4.6v8a1.4 1.4 0 0 1-1.4 1.4H8.9a1.4 1.4 0 0 1-1.4-1.4v-8c0-3 3.3-3.4 3.3-4.6Z"
            fill={fill}
            stroke={EDGE}
            strokeWidth={W}
          />
        </G>
      );
    case 'dasher':
      // A bitters bottle with its dasher top and oversized label.
      return (
        <G>
          <Path d="M10 2.5h4l-.6 3h-2.8Z" fill={EDGE} />
          <Path
            d="M10.4 5.5h3.2v2c2.4.6 3.4 2 3.4 4V20a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-8.5c0-2 1-3.4 3.4-4Z"
            fill={fill}
            stroke={EDGE}
            strokeWidth={W}
          />
          <Rect x={7.5} y={12} width={9} height={7} fill={colors.label} fillOpacity={0.9} />
        </G>
      );
    case 'drop':
      return <Path d="M12 2.5c3.6 5 6.5 8.4 6.5 12a6.5 6.5 0 0 1-13 0c0-3.6 2.9-7 6.5-12Z" fill={fill} stroke={EDGE} strokeWidth={W} />;
    case 'bubbles':
      return (
        <G>
          <Circle cx={9} cy={15} r={5} fill={fill} stroke={EDGE} strokeWidth={W} />
          <Circle cx={16.5} cy={9.5} r={3.5} fill={fill} stroke={EDGE} strokeWidth={W} />
          <Circle cx={11.5} cy={5} r={2} fill={fill} stroke={EDGE} strokeWidth={W} />
        </G>
      );
    case 'egg':
      return <Ellipse cx={12} cy={13} rx={6.5} ry={8.5} fill={fill} stroke={EDGE} strokeWidth={W} />;
    case 'leaf':
      return (
        <G>
          <Path d="M5 19C5 10 10 4.5 20 4c-.5 10-6 15-15 15Z" fill={fill} stroke={EDGE} strokeWidth={W} />
          <Path d="M5 19 15 9" stroke={colors.label} strokeOpacity={0.7} strokeWidth={0.8} />
        </G>
      );
    case 'star':
      return <Path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2Z" fill={fill} stroke={EDGE} strokeWidth={W} />;
    case 'dot':
      return <Circle cx={12} cy={12} r={6} fill={fill} stroke={EDGE} strokeWidth={W} />;
  }
}

/**
 * An ingredient's glyph, `size` points square (18 in the checklist).
 * Hidden from VoiceOver: the label beside it names the ingredient.
 */
export const IngredientGlyph = React.memo(
  function IngredientGlyph({
    ingredient,
    size = 18,
  }: {
    ingredient: Pick<Ingredient, 'id' | 'category'>;
    size?: number;
  }) {
    const g = glyphFor(ingredient);
    return (
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: size, height: size }}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Shape kind={g.kind} fill={glyphTint[g.tint]} />
        </Svg>
      </View>
    );
  },
  // By id, not by object: a caller that rebuilds its ingredient rows on a tick still keeps every glyph.
  (a, b) => a.ingredient.id === b.ingredient.id && a.size === b.size,
);
