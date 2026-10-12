import React, { useRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStepTitleFocus } from '@/components/auth/AuthTitleBar';
import { CatalogueFace } from '@/components/auth/CatalogueFace';
import { DrinkName, Print } from '@/components/cabinet';
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar';
import { Icon } from '@/components/icons';
import { useScrollEdges } from '@/components/log/scrollEdges';
import { ScreenTopBar, TopBarTextButton } from '@/components/ScreenTopBar';
import { announce, Button, haptic } from '@/components/ui';
import { colors, layout, onMedia, radius, space, stroke, textRole } from '@/constants/theme';
import { getDrink } from '@/data';
import { FIRST_TASTES, TASTES_TO_START, tasteMetaSpoken } from '@/lib/tastes';
import { useSignInFlow } from '@/store/signInFlow';
import type { Drink } from '@/types';

/* ==================================================================== */
/* What do you drink?                                                   */
/*                                                                      */
/* The signed-out Home's first step (specs/v3-2-mockups/signin-tastes): */
/* a question, not a form. 24 catalogue photos in the Dex's own grid    */
/* (two columns, 24 apart, a square print and the name under it); a tap */
/* picks one, and a print of it drops into the tray pinned above the    */
/* tab bar. Three picks turn the tray's words into Continue, which      */
/* leads to the ways in under the person's own three drinks. "Sign in"  */
/* top right is every way in from the first frame, for anyone who has   */
/* an account or would rather not pick.                                 */
/*                                                                      */
/* LESS STUFF (v4). The v3 card mounted a pick in card stock with its   */
/* number plate and "In your Dex", and every print carried a + marker.  */
/* Now a pick is said by one thing drawn over the print: a 2pt ink      */
/* outline and an ink check plate in its corner (shape, not colour, as  */
/* the Dex's number jump outlines a tile). The base-and-country line    */
/* is spoken, not printed.                                              */
/*                                                                      */
/* The picks are only held (store/signInFlow) until the account exists, */
/* and are put in the Dex as it does.                                   */
/*                                                                      */
/* NOTHING ANIMATES, AND NOTHING MOVES. A pick only lays the outline    */
/* and the check over the print, so it never changes a cell's size and  */
/* the grid never reflows; the photo's Image stays mounted at one size, */
/* so it never reloads. The tray swaps its words for Continue inside a  */
/* fixed-height row. Press feedback is Pressable's own dim.             */
/*                                                                      */
/* Memory: prints decode at about 184pt square (552px from a 1024px     */
/* photo), and the list mounts about a dozen at a time. The picker only */
/* exists on Home and is unmounted while another tab is in front        */
/* (SignInScreen), so it never sits behind that tab's photos.           */
/* ==================================================================== */

/** Every card's name caps here (spec 6.5, as a Dex card), which keeps two columns at every size. */
const CAP = 1.3;
/** The Dex grid's own spacing (layout spec 5.2): 24 between columns and between rows. */
const COL_GAP = layout.dexGap;
const ROW_GAP = layout.dexLedge;
const NAME_GAP = space.sm;
/** The picked check's plate, inset 8 from the print's corner. */
const CHECK = 28;
/** The outline sits just outside the print, so it covers nothing of the photo. */
const OUTLINE = stroke.ring;

/** The tray: its row, and the square prints in it (DexThumb's mini). */
const TRAY_PAD = 12;
const TRAY_ROW = 56;
const SLOT = 44;
const SLOT_GAP = 8;

/** A cell's width: two across the gutters, 24 apart, the Dex's 184 at 440. */
function cellWidth(windowWidth: number): number {
  return Math.floor((windowWidth - 2 * layout.gutter - COL_GAP) / 2);
}

/* -------------------------------------------------------------------- */
/* A drink to pick                                                       */
/* -------------------------------------------------------------------- */

/**
 * One drink: its square print and its name. Picked, an ink outline round
 * the print and an ink check plate in its corner; nothing else changes,
 * so the photo never reloads and the row never reflows.
 *
 * One VoiceOver button: "Piña Colada, White rum, Puerto Rico", selected
 * when picked.
 */
const TasteCard = React.memo(function TasteCard({
  drink,
  picked,
  side,
  onToggle,
}: {
  drink: Drink;
  picked: boolean;
  side: number;
  onToggle: (drink: Drink) => void;
}) {
  return (
    <Pressable
      onPress={() => onToggle(drink)}
      accessibilityRole="button"
      accessibilityLabel={`${drink.name}, ${tasteMetaSpoken(drink)}`}
      accessibilityState={{ selected: picked }}
      accessibilityHint={picked ? 'Takes it out of your Dex' : 'Adds it to your Dex'}
      style={({ pressed }) => [{ width: side }, pressed && styles.pressed]}>
      <View>
        <Print width={side} height={side}>
          <CatalogueFace drink={drink} width={side} height={side} />
        </Print>
        {picked ? (
          <>
            <View pointerEvents="none" style={styles.outline} />
            <View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.check}>
              <Icon name="check" size={18} color={onMedia.ink} />
            </View>
          </>
        ) : null}
      </View>
      <DrinkName
        name={drink.name}
        role={textRole.name}
        measure={side}
        cap={CAP}
        color={colors.text}
        style={styles.name}
      />
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

/** A slot in the tray: a print of a picked drink, or the wash square it will fill. */
function TraySlot({ drinkId }: { drinkId?: string }) {
  const drink = getDrink(drinkId);
  if (!drink) return <View style={styles.slot} />;
  return (
    <Print width={SLOT} height={SLOT}>
      <CatalogueFace drink={drink} width={SLOT} height={SLOT} />
    </Print>
  );
}

/**
 * "Your Dex", pinned above the tab bar: three slots that fill as drinks are
 * picked, and the words that become Continue at three, in place, in a row
 * of one fixed height. Past three it shows the latest three and a "+2".
 * Text caps at 1.3 so the row never grows.
 */
function TasteTray({
  picks,
  bottom,
  ruled,
  onContinue,
}: {
  picks: readonly string[];
  bottom: number;
  /** The grid runs on under the tray: its 1pt rule. */
  ruled: boolean;
  onContinue: () => void;
}) {
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
    <View style={[styles.tray, ruled && styles.trayRuled, { paddingBottom: bottom }]}>
      <View style={styles.trayRow}>
        <View accessible accessibilityLabel={spoken} style={styles.trayLead}>
          <View style={styles.slots}>
            {[0, 1, 2].map((k) => (
              <TraySlot key={shown[k] ?? `empty-${k}`} drinkId={shown[k]} />
            ))}
            {extra > 0 ? (
              <Text maxFontSizeMultiplier={CAP} style={[textRole.small, styles.muted]}>
                {`+${extra}`}
              </Text>
            ) : null}
          </View>
          {ready ? null : (
            <View style={styles.trayWords}>
              <Text maxFontSizeMultiplier={CAP} style={[textRole.bodyStrong, styles.ink]}>
                Your Dex
              </Text>
              <Text maxFontSizeMultiplier={CAP} style={[textRole.small, styles.muted]}>
                {trayWords(n)}
              </Text>
            </View>
          )}
        </View>
        {ready ? (
          <Button
            label="Continue"
            variant="primary"
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
  const { width } = useWindowDimensions();
  const picks = useSignInFlow((s) => s.picks);
  const continueTastes = useSignInFlow((s) => s.continueTastes);
  const signInFromTastes = useSignInFlow((s) => s.signInFromTastes);
  /* The tray lies over the list, whose foot pads for it: the grid's end sits 24 above the tray. */
  const edges = useScrollEdges(space.xl);
  const askRef = useRef<Text>(null);
  // Coming back from the ways in, VoiceOver lands on the question, not a control that has gone.
  useStepTitleFocus(askRef, 'tastes');

  const side = cellWidth(width);
  // The tray's words sit just above the tab bar; the same sum pads the list's foot.
  const trayBottom = insets.bottom + TAB_BAR_CLEARANCE;
  const trayHeight = TRAY_PAD + TRAY_ROW + trayBottom;

  return (
    <View style={styles.screen}>
      {/*
        Home's own bar, signed out: the wordmark set left at the gutter (as
        HomeChrome sets it) and the one control right, here "Sign in".
      */}
      <ScreenTopBar
        title="Sipply"
        size="lg"
        showRule={edges.under}
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
        renderItem={({ item }) => (
          <TasteCard drink={item} picked={picks.includes(item.id)} side={side} onToggle={toggle} />
        )}
        columnWrapperStyle={styles.columns}
        ItemSeparatorComponent={RowGap}
        ListHeaderComponent={
          <View style={styles.question}>
            <Text ref={askRef} accessibilityRole="header" style={[textRole.title, styles.ink]}>
              What do you drink?
            </Text>
            <Text style={[textRole.body, styles.muted, styles.askSub]}>
              Tap three you’d order again. They start your Dex.
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: trayHeight + space.xl }}
        initialNumToRender={6}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews
        onScroll={edges.onScroll}
        onLayout={edges.onLayout}
        onContentSizeChange={edges.onContentSizeChange}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      />
      <TasteTray picks={picks} bottom={trayBottom} ruled={edges.moreBelow} onContinue={continueTastes} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  wordmark: { color: colors.text },
  ink: { color: colors.text },
  muted: { color: colors.textMuted },

  question: { paddingHorizontal: layout.gutter, paddingTop: space.sm, paddingBottom: space.xl },
  askSub: { marginTop: space.xs },

  columns: { paddingHorizontal: layout.gutter, columnGap: COL_GAP },
  rowGap: { height: ROW_GAP },
  pressed: { opacity: 0.85 },

  /* TasteCard */
  name: { marginTop: NAME_GAP },
  /* Drawn just outside the print's own edge, so it covers none of the photo. */
  outline: {
    position: 'absolute',
    top: -OUTLINE,
    left: -OUTLINE,
    right: -OUTLINE,
    bottom: -OUTLINE,
    borderWidth: OUTLINE,
    borderColor: colors.text,
  },
  /* The solid ink plate, the one thing Daylight lays on a photo (onMedia), with its ring for a dark print. */
  check: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    width: CHECK,
    height: CHECK,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.badge,
    borderWidth: stroke.edge,
    borderColor: onMedia.ring,
    backgroundColor: onMedia.fill,
  },

  /* TasteTray: a bar at the foot, ruled only while the grid runs on under it. */
  tray: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: TRAY_PAD,
    paddingHorizontal: layout.gutter,
    backgroundColor: colors.bg,
    borderTopWidth: stroke.edge,
    borderTopColor: 'transparent',
  },
  trayRuled: { borderTopColor: colors.line },
  trayRow: { height: TRAY_ROW, flexDirection: 'row', alignItems: 'center', columnGap: space.lg },
  trayLead: { flexDirection: 'row', alignItems: 'center', columnGap: space.lg, flexShrink: 1 },
  slots: { flexDirection: 'row', alignItems: 'center', columnGap: SLOT_GAP },
  slot: { width: SLOT, height: SLOT, backgroundColor: colors.bgSunk },
  trayWords: { flexShrink: 1 },
  continue: { flex: 1 },
});
