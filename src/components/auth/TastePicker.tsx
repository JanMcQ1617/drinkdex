import React, { useRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStepTitleFocus } from '@/components/auth/AuthTitleBar';
import { CatalogueFace } from '@/components/auth/CatalogueFace';
import { DexStatusTag, dexStatusTagWidth, DrinkName, Mount, MOUNT, MountWindow, NumberPlate } from '@/components/cabinet';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Grain } from '@/components/Grain';
import { Icon } from '@/components/icons';
import { ScreenTopBar, TopBarTextButton, useScrolledPast } from '@/components/ScreenTopBar';
import { announce, Button, haptic } from '@/components/ui';
import {
  colors,
  elevation,
  fonts,
  layout,
  onMedia,
  radius,
  space,
  stroke,
  textRole,
  type as typeScale,
} from '@/constants/theme';
import { formatDexNumber, getDrink } from '@/data';
import { faceOf, fitScale, type Face, textWidth } from '@/lib/textFit';
import { FIRST_TASTES, TASTES_TO_START, tasteMeta, tasteMetaSpoken } from '@/lib/tastes';
import { useSignInFlow } from '@/store/signInFlow';
import type { Drink } from '@/types';

/* ==================================================================== */
/* What do you drink?                                                   */
/*                                                                      */
/* The signed-out Home's first step (specs/v3-2-mockups/signin-tastes): */
/* a question, not a form. 24 re-lit catalogue photos lie loose in the  */
/* lining; a tap mounts one in bone card stock with its number plate    */
/* and "In your Dex", and a mini of it drops into the tray pinned above */
/* the tab bar. Three picks turn the tray's words into Continue, which  */
/* leads to the ways in under the person's own three drinks. "Sign in"  */
/* top right is every way in from the first frame, for anyone who has   */
/* an account or would rather not pick.                                 */
/*                                                                      */
/* The picks are only held (store/signInFlow) until the account exists, */
/* and are put in the Dex as it does.                                   */
/*                                                                      */
/* NOTHING ANIMATES. A pick is a state change drawn in the same frame:  */
/* the print becomes a mount and a slot becomes a mini. The photo's     */
/* Image stays mounted through it, at one size, so the swap cannot      */
/* reload or soften it (TasteCard). Each row has one height, worked out */
/* from its names at this text size, never measured, so a pick never   */
/* reflows the grid and the first frame is the final one.              */
/* The tray swaps its words for Continue inside a fixed-height row.     */
/* Press feedback is Pressable's own dim. The only thing that moves is  */
/* native scrolling, and this list does NOT report to ScrollChrome: the */
/* tab bar stays full, so the tray, placed for the full bar, never      */
/* floats over a compacted one.                                         */
/*                                                                      */
/* Memory: prints decode at about 198 x 206pt (594 x 618px from a 1024px*/
/* photo), and the list mounts about a dozen at a time. The picker only */
/* exists on Home and is unmounted while another tab is in front        */
/* (SignInScreen), so it never sits behind that tab's photos.           */
/* ==================================================================== */

/** Every card's text caps here (spec 6.5, as a Dex card), which keeps two columns at every size. */
const CAP = 1.3;
const COL_GAP = 12;
const ROW_GAP = 14;
/** The mockup's print, 198 x 206 at a 440pt width. */
const PRINT_ASPECT = 206 / 198;
/** The mount's clear mat around its window (mockup: 9pt, a step inside MOUNT.feature's 12). */
const MOUNT_PAD = 9;
/** The window is this much shorter than the print, which makes room for the plates in the same cell. */
const WINDOW_CUT = 26;
const PRINT_NAME_GAP = 10;
const META_GAP = 2;
const MOUNT_NAME_GAP = 8;
const PLATES_GAP = 5;
const PLATE_GAP = 6;
/** DexStatusTag's and NumberPlate's own minimum heights (cabinet.tsx). */
const TAG_H = 26;
const PLATE_H = 20;
const MARKER = 32;

/** The tray: its row, and the slots in it (the mockup's 42 x 56 minis). */
const TRAY_PAD = 12;
const TRAY_ROW = 56;
const SLOT = { width: 42, height: 56 } as const;
const SLOT_GAP = 8;

/* -------------------------------------------------------------------- */
/* Cell geometry                                                         */
/* -------------------------------------------------------------------- */

/** Lines `text` takes at `size` in a `measure`-wide column, worked out word by word (textFit errs wide). */
function lineCount(text: string, face: Face, size: number, measure: number): number {
  const space = textWidth(' ', face, size);
  let lines = 1;
  let run = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = textWidth(word, face, size);
    if (run === 0) run = w;
    else if (run + space + w <= measure) run += space + w;
    else {
      lines += 1;
      run = w;
    }
  }
  return lines;
}

/** A drink name's height as DrinkName draws it: its role, fitted to the measure, at the capped text size. */
function nameHeight(name: string, role: { fontFamily: string; fontSize: number; lineHeight: number }, measure: number, s: number) {
  const face = faceOf(role.fontFamily);
  const fit = fitScale(name, face, role.fontSize * s, measure);
  return lineCount(name, face, role.fontSize * s * fit, measure) * role.lineHeight * s * fit;
}

/**
 * textFit errs wide by about a fifth on these short Inter labels (the
 * mockup, set in the real face, fits "#0147" and "In your Dex" side by
 * side in a 178pt mount at 1x, where the estimate says 183). Taken back
 * here for the plates alone, so a 440pt phone does not reserve a second
 * plates row it never draws. If a phone ever disagrees, the row wraps and
 * the cell grows (cells take a minimum height), never overflows.
 */
const PLATES_ESTIMATE = 0.85;

/** The plates row under a mounted name: one row, or two when the number and the tag do not fit side by side. */
function platesHeight(drink: Drink, measure: number, s: number, fontScale: number) {
  const number = formatDexNumber(drink.dexNumber);
  const plateW = 2 * stroke.edge + 10 + textWidth(number, 'inter', 11 * s) + 1.5 * number.length;
  const both = plateW + PLATE_GAP + dexStatusTagWidth(true, false, fontScale);
  return both * PLATES_ESTIMATE <= measure ? TAG_H : PLATE_H + PLATE_GAP + TAG_H;
}

interface CellMetrics {
  width: number;
  photoH: number;
  windowW: number;
  windowH: number;
  /**
   * Each row's one height: the taller of the print and the mount for both
   * of its drinks, so a pick never reflows a row. Per row rather than one
   * for the grid, so one long name does not pad every cell.
   */
  rowHeights: number[];
}

/** The cells' geometry at this window and text size. */
function cellMetrics(windowWidth: number, fontScale: number): CellMetrics {
  const s = Math.min(fontScale, CAP);
  const width = Math.floor((windowWidth - 2 * layout.gutter - COL_GAP) / 2);
  const photoH = Math.round(width * PRINT_ASPECT);
  const windowW = width - 2 * (stroke.edge + MOUNT_PAD);
  const windowH = photoH - WINDOW_CUT;

  const cellHeight = (drink: Drink) => {
    const meta = lineCount(tasteMeta(drink), 'inter', textRole.labelCaption.fontSize * s, width);
    const print =
      photoH +
      PRINT_NAME_GAP +
      nameHeight(drink.name, textRole.printName, width, s) +
      META_GAP +
      meta * textRole.labelCaption.lineHeight * s;
    const mount =
      2 * (stroke.edge + MOUNT_PAD) +
      windowH +
      MOUNT_NAME_GAP +
      nameHeight(drink.name, textRole.cardName, windowW, s) +
      PLATES_GAP +
      platesHeight(drink, windowW, s, fontScale);
    return Math.max(print, mount);
  };

  const rowHeights: number[] = [];
  FIRST_TASTES.forEach((drink, i) => {
    const row = Math.floor(i / 2);
    rowHeights[row] = Math.ceil(Math.max(rowHeights[row] ?? 0, cellHeight(drink)));
  });
  return { width, photoH, windowW, windowH, rowHeights };
}

/* -------------------------------------------------------------------- */
/* A drink to pick                                                       */
/* -------------------------------------------------------------------- */

/** The + in a print's corner: the media marker's fill and edge, at the mockup's 32pt. Decorative. */
function PlusMarker() {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.marker}>
      <Icon name="plus" size={18} color={onMedia.ink} />
    </View>
  );
}

/**
 * One drink. Unpicked, a loose print in the lining (cabinet.tsx
 * LoosePrint's 4pt corner and printEdge) with its name in Playfair and its
 * base and country under it; picked, the same drink mounted (Mount's mat,
 * matEdge and seat) with the photo in a window, its number plate and "In
 * your Dex".
 *
 * Built from the cabinet's tokens rather than LoosePrint and Mount
 * themselves, ON PURPOSE: those are two different components, and a swap
 * between them would remount the photo, which reloads it. Here the frame,
 * the photo box and its Image are the same views in both states; only
 * their styles change. The Image keeps one size (the print's) and the
 * window crops it at its centre, so it never decodes again.
 *
 * One VoiceOver button: "Piña Colada, White rum, Puerto Rico", selected
 * when picked.
 */
const TasteCard = React.memo(function TasteCard({
  drink,
  picked,
  m,
  height,
  onToggle,
}: {
  drink: Drink;
  picked: boolean;
  m: CellMetrics;
  /**
   * Its row's height (CellMetrics.rowHeights), as a minimum: the worked-out
   * height holds both states, and a minimum means text that ever comes out
   * wider than worked out grows the row rather than spilling out of it.
   */
  height: number;
  onToggle: (drink: Drink) => void;
}) {
  const dx = (m.width - m.windowW) / 2;
  const dy = (m.photoH - m.windowH) / 2;
  return (
    <Pressable
      onPress={() => onToggle(drink)}
      accessibilityRole="button"
      accessibilityLabel={`${drink.name}, ${tasteMetaSpoken(drink)}`}
      accessibilityState={{ selected: picked }}
      accessibilityHint={picked ? 'Takes it out of your Dex' : 'Adds it to your Dex'}
      style={({ pressed }) => [{ width: m.width, minHeight: height }, pressed && styles.pressed]}>
      <View style={[styles.frame, picked && [styles.mounted, elevation.seat]]}>
        <View
          style={[
            styles.photo,
            picked
              ? { width: m.windowW, height: m.windowH, borderRadius: MOUNT.feature.windowRadius, borderColor: colors.windowEdge }
              : { width: m.width, height: m.photoH },
          ]}>
          <CatalogueFace
            drink={drink}
            width={m.width}
            height={m.photoH}
            style={picked ? { position: 'absolute', left: -dx, top: -dy } : undefined}
          />
          {picked ? null : <PlusMarker />}
        </View>
        {picked ? (
          <>
            <DrinkName
              name={drink.name}
              role={textRole.cardName}
              measure={m.windowW}
              cap={CAP}
              color={colors.text}
              style={styles.mountName}
            />
            <View style={styles.plates}>
              <NumberPlate n={drink.dexNumber} tone="mat" />
              <DexStatusTag inDex />
            </View>
          </>
        ) : (
          <>
            <DrinkName
              name={drink.name}
              role={textRole.printName}
              measure={m.width}
              cap={CAP}
              color={colors.onLining}
              style={styles.printName}
            />
            <Text maxFontSizeMultiplier={CAP} style={[textRole.labelCaption, styles.meta]}>
              {tasteMeta(drink)}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
});

/* -------------------------------------------------------------------- */
/* The tray                                                              */
/* -------------------------------------------------------------------- */

function trayWords(n: number): string {
  if (n === 0) return 'Pick three to start it';
  return `${n} of ${TASTES_TO_START} · ${TASTES_TO_START - n === 1 ? 'one more' : 'two more'}`;
}

/** A slot in the tray: a mini of a picked drink, or the Dex's coupe pressed into the lining. */
function TraySlot({ drinkId }: { drinkId?: string }) {
  const drink = getDrink(drinkId);
  if (!drink) {
    return (
      <Mount state="slot" size="thumb" onLining style={styles.slot}>
        <Icon name="dex" size={18} color={colors.onLiningFaint} />
      </Mount>
    );
  }
  const inset = 2 * (stroke.edge + MOUNT.thumb.padding);
  return (
    <Mount state="mounted" size="thumb" onLining style={styles.slotMounted}>
      <MountWindow height={SLOT.height - inset} state="mounted">
        <CatalogueFace drink={drink} width={SLOT.width - inset} height={SLOT.height - inset} />
      </MountWindow>
    </Mount>
  );
}

/**
 * "Your Dex", pinned above the tab bar: three slots that fill as drinks are
 * picked, and the words that become Continue at three, in place, in a row
 * of one fixed height. Past three it shows the latest three and a "+2".
 * Text caps at 1.3 so the row never grows.
 */
function TasteTray({ picks, bottom, onContinue }: { picks: readonly string[]; bottom: number; onContinue: () => void }) {
  const n = picks.length;
  const ready = n >= TASTES_TO_START;
  const shown = n > TASTES_TO_START ? picks.slice(-TASTES_TO_START) : picks;
  const extra = n - TASTES_TO_START;
  const spoken =
    n === 0
      ? 'Your Dex. Pick three to start it.'
      : ready
        ? `Your Dex, ${n} picked`
        : `Your Dex, ${n} of ${TASTES_TO_START} picked`;

  return (
    <View style={[styles.tray, { paddingBottom: bottom }]}>
      <Grain tone="lining" />
      <View style={styles.trayRow}>
        <View accessible accessibilityLabel={spoken} style={styles.trayLead}>
          <View style={styles.slots}>
            {[0, 1, 2].map((k) => (
              <TraySlot key={shown[k] ?? `empty-${k}`} drinkId={shown[k]} />
            ))}
            {extra > 0 ? (
              <View style={styles.extra}>
                <Text maxFontSizeMultiplier={CAP} style={[textRole.statusWord, styles.extraText]}>
                  {`+${extra}`}
                </Text>
              </View>
            ) : null}
          </View>
          {ready ? null : (
            <View style={styles.trayWords}>
              <Text maxFontSizeMultiplier={CAP} style={[textRole.sectionTitle, styles.trayTitle]}>
                Your Dex
              </Text>
              <Text maxFontSizeMultiplier={CAP} style={[textRole.helper, styles.traySub]}>
                {trayWords(n)}
              </Text>
            </View>
          )}
        </View>
        {ready ? (
          <Button
            label="Continue"
            variant="onLining"
            onPress={onContinue}
            accessibilityHint="Choose how to join Sipply"
            maxFontSizeMultiplier={CAP}
            style={styles.continue}
          />
        ) : null}
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------- */
/* The picker                                                            */
/* -------------------------------------------------------------------- */

function RowGap() {
  return <View style={styles.rowGap} />;
}

/**
 * Said after each tap, so VoiceOver hears where the Dex stands: "Piña
 * Colada, in your Dex. 2 of 3."
 */
function pickNews(drink: Drink, added: boolean, n: number): string {
  const where = added ? `${drink.name}, in your Dex.` : `${drink.name}, taken out.`;
  if (n < TASTES_TO_START) return `${where} ${n} of ${TASTES_TO_START}.`;
  if (n === TASTES_TO_START && added) return `${where} ${n} of ${TASTES_TO_START}. Continue is ready.`;
  return `${where} ${n} picked.`;
}

/*
 * Read from the store at tap time, so this has no reactive inputs and every
 * card is handed the same function: a pick re-renders only the card it
 * changed (TasteCard is memoised).
 */
function toggle(drink: Drink) {
  const flow = useSignInFlow.getState();
  const added = !flow.picks.includes(drink.id);
  flow.togglePick(drink.id);
  haptic.select();
  announce(pickNews(drink, added, useSignInFlow.getState().picks.length));
}

export function TastePicker() {
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const picks = useSignInFlow((s) => s.picks);
  const continueTastes = useSignInFlow((s) => s.continueTastes);
  const signInFromTastes = useSignInFlow((s) => s.signInFromTastes);
  const [scrolled, onScroll] = useScrolledPast();
  const askRef = useRef<Text>(null);
  // Coming back from the ways in, VoiceOver lands on the question, not a control that has gone.
  useStepTitleFocus(askRef, 'tastes');

  const m = cellMetrics(width, fontScale);
  // The tray's words sit just above the full tab bar; the same sum pads the list's foot.
  const trayBottom = insets.bottom + TAB_BAR_CLEARANCE;
  const trayHeight = TRAY_PAD + TRAY_ROW + trayBottom;

  return (
    <View style={styles.screen}>
      <Grain tone="lining" />
      <ScreenTopBar
        title="Sipply"
        tone="lining"
        showRule={scrolled}
        titleNode={
          <Text maxFontSizeMultiplier={1.2} style={[textRole.wordmark, styles.wordmark]}>
            Sipply
          </Text>
        }
        right={<TopBarTextButton label="Sign in" onPress={signInFromTastes} />}
      />
      <FlatList
        data={FIRST_TASTES}
        keyExtractor={(d) => d.id}
        numColumns={2}
        extraData={picks}
        renderItem={({ item, index }) => (
          <TasteCard
            drink={item}
            picked={picks.includes(item.id)}
            m={m}
            height={m.rowHeights[Math.floor(index / 2)] ?? 0}
            onToggle={toggle}
          />
        )}
        columnWrapperStyle={styles.columns}
        ItemSeparatorComponent={RowGap}
        ListHeaderComponent={
          <View style={styles.question}>
            <Text ref={askRef} accessibilityRole="header" style={styles.ask}>
              What do you drink?
            </Text>
            <Text style={[textRole.prose, styles.askSub]}>
              Tap three you’d order again. They start your Dex.
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: trayHeight + space.xl }}
        initialNumToRender={6}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      />
      <TasteTray picks={picks} bottom={trayBottom} onContinue={continueTastes} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.lining },
  wordmark: { color: colors.onLining, textAlign: 'center' },

  question: { paddingHorizontal: layout.gutter, paddingTop: space.md, paddingBottom: space.lg },
  ask: {
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.headline.fontSize,
    lineHeight: typeScale.headline.lineHeight,
    letterSpacing: -0.3,
    color: colors.onLining,
  },
  askSub: { color: colors.onLiningMuted, marginTop: space.xs },

  columns: { paddingHorizontal: layout.gutter, columnGap: COL_GAP },
  rowGap: { height: ROW_GAP },
  pressed: { opacity: 0.85 },

  /* TasteCard */
  frame: { flex: 1, borderRadius: MOUNT.feature.radius },
  // The edge and mat only when mounted: unpicked, the print runs to the cell's own edge.
  mounted: {
    backgroundColor: colors.mat,
    borderWidth: stroke.edge,
    borderColor: colors.matEdge,
    padding: MOUNT_PAD,
  },
  photo: {
    overflow: 'hidden',
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
    borderColor: colors.printEdge,
    backgroundColor: colors.liningDeep,
  },
  marker: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    width: MARKER,
    height: MARKER,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
    borderColor: onMedia.markerEdge,
    backgroundColor: onMedia.markerFill,
  },
  printName: { marginTop: PRINT_NAME_GAP },
  meta: { color: colors.onLiningMuted, marginTop: META_GAP },
  mountName: { marginTop: MOUNT_NAME_GAP },
  plates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: PLATE_GAP,
    marginTop: PLATES_GAP,
  },

  /* TasteTray */
  tray: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: TRAY_PAD,
    paddingHorizontal: layout.gutter,
    backgroundColor: colors.lining,
    borderTopWidth: stroke.edge,
    borderTopColor: colors.liningLip,
    ...elevation.sheet,
  },
  trayRow: { height: TRAY_ROW, flexDirection: 'row', alignItems: 'center', columnGap: 14 },
  trayLead: { flexDirection: 'row', alignItems: 'center', columnGap: 14, flexShrink: 1 },
  slots: { flexDirection: 'row', alignItems: 'center', columnGap: SLOT_GAP },
  slot: { width: SLOT.width, height: SLOT.height, alignItems: 'center', justifyContent: 'center' },
  slotMounted: { width: SLOT.width, height: SLOT.height },
  extra: {
    minHeight: PLATE_H,
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
    borderColor: colors.plateEdgeLining,
  },
  extraText: { color: colors.onLiningMuted },
  trayWords: { flexShrink: 1 },
  trayTitle: { color: colors.onLining },
  traySub: { color: colors.onLiningMuted },
  continue: { flex: 1 },
});
