import { Image } from 'expo-image';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  type HostInstance,
  Keyboard,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrinkName } from '@/components/cabinet';
import { DexThumb } from '@/components/DexCard';
import { Grain } from '@/components/Grain';
import { Icon } from '@/components/icons';
import { ScreenTopBar, TopBarTextButton } from '@/components/ScreenTopBar';
import {
  announce,
  Button,
  Chip,
  EmptyState,
  Field,
  haptic,
  Hold,
  SectionHeader,
  SegmentedControl,
  useAnnounce,
} from '@/components/ui';
import {
  colors,
  fonts,
  layout,
  radius,
  space,
  stroke,
  tabular,
  textRole,
  type as typeScale,
} from '@/constants/theme';
import {
  catalogueTwin,
  type CustomDraft,
  type CustomErrors,
  draftFrom,
  emptyDraft,
  type FieldKey,
  fieldsFromDraft,
  firstErrorKey,
  GLASSWARE,
  isCustomId,
  LIMITS,
  METHODS,
  nameFromQuery,
  newCustomId,
  ownTwin,
  SERVE_TEMPS,
  subcategoriesFor,
  suggestedNotes,
  validateCustom,
} from '@/lib/customDrinks';
import { styleLabel } from '@/lib/drinkLabels';
import { similarByName } from '@/lib/drinkSearch';
import {
  customPhotoUri,
  persistCustomPhoto,
  pickFromCamera,
  pickFromLibrary,
  type PickResult,
} from '@/lib/pour';
import { flushSubmissions } from '@/lib/submissions';
import { faceOf, fitScale, textWidth } from '@/lib/textFit';
import { useCustomDrink, useCustomDrinks } from '@/store/customDrinks';
import type { CustomDrink, Drink, DrinkCategory } from '@/types';
import { confirmDestructive, showNotice } from '@/utils/alerts';

/* ==================================================================== */
/* Add a drink                                                          */
/*                                                                      */
/* When a search finds nothing, the person can add the drink. It goes   */
/* into their own Dex the moment they save (store/customDrinks), so a   */
/* photo of it can be saved at once, and it goes to Sipply as a         */
/* suggestion (lib/submissions), which reaches Jan once a month already */
/* in the catalogue's entry shape.                                      */
/*                                                                      */
/* IT ASKS FOR LITTLE. Required: a name, cocktail or spirit, a style    */
/* and a description; for a cocktail two ingredients, for a spirit the  */
/* ABV on the label. Everything else is optional and says so. Someone   */
/* at a bar abandons a fifteen-field form, and a blank is better for    */
/* Jan than a guess: the monthly email lists every blank, and the merge */
/* scripts will not run until he has filled them.                       */
/*                                                                      */
/* THE BUTTON IS ALWAYS ON. A dimmed save at the foot of a long form    */
/* does not say which field it is waiting for. Pressed with something   */
/* missing, it puts each message on its field, scrolls to the first,    */
/* moves VoiceOver there and buzzes; after that, fields check           */
/* themselves as they are left.                                         */
/*                                                                      */
/* Opened from the Dex (`from=dex`, named after the search), the Dex's  */
/* shelf (`from=shelf`, blank), the log sheet (`from=log`, with the     */
/* sheet's photo), or a custom drink's Edit details (`edit=<id>`). It   */
/* leaves a handoff in the store saying where to go next, which the     */
/* screen underneath takes when it gets focus back.                     */
/*                                                                      */
/* The frame is the log sheet's: a page sheet with Cancel on the left,  */
/* the keyboard offset trick, a save bar that stays put, and the grain. */
/* ==================================================================== */

type From = 'dex' | 'log' | 'shelf';
type SectionKey = 'basics' | 'recipe' | 'details' | 'photo' | 'team';

type IngredientRow = { key: number; item: string; amount: string };
type StepRow = { key: number; text: string };

/**
 * The photo on the form: one already saved with the drink (by file name),
 * one picked here, or one handed over by the log sheet (`seeded`), which
 * is a new one as far as saving goes.
 */
type Photo = { kind: 'saved'; file: string } | { kind: 'new'; uri: string; seeded: boolean } | null;

interface FormState {
  /** The answers. Its ingredients and steps are not read: the rows below are. */
  draft: CustomDraft;
  ingredients: IngredientRow[];
  steps: StepRow[];
  /** "Other…" is chosen under Glass, so the glass is typed rather than picked. */
  glassOther: boolean;
  photo: Photo;
  /** What is typed in the two token fields and not yet added. */
  noteInput: string;
  pairInput: string;
}

/*
 * Row keys from a counter, never the list index. Removing a row must not
 * move the text or the cursor of the rows after it, which an index key
 * does: React would reuse the removed row's input for the next one.
 */
let rowKey = 0;
const nextKey = () => {
  rowKey += 1;
  return rowKey;
};
const blankIngredient = (): IngredientRow => ({ key: nextKey(), item: '', amount: '' });
const blankStep = (): StepRow => ({ key: nextKey(), text: '' });
const blankIngredients = () => [blankIngredient(), blankIngredient(), blankIngredient()];

/** The form as it opens: a saved drink to edit, or a blank one named after the search. */
function initialForm(opts: {
  editing: CustomDrink | null;
  name: string;
  category: DrinkCategory;
  seedUri: string | null;
}): FormState {
  if (opts.editing) {
    const draft = draftFrom(opts.editing);
    const ingredients = draft.ingredients.map((i) => ({ key: nextKey(), ...i }));
    const glasses: readonly string[] = GLASSWARE[draft.category];
    return {
      draft,
      ingredients: ingredients.length > 0 ? ingredients : blankIngredients(),
      steps: draft.steps.length > 0 ? draft.steps.map((text) => ({ key: nextKey(), text })) : [blankStep()],
      glassOther: draft.glassware !== '' && !glasses.includes(draft.glassware),
      photo: opts.editing.photoFile ? { kind: 'saved', file: opts.editing.photoFile } : null,
      noteInput: '',
      pairInput: '',
    };
  }
  return {
    draft: emptyDraft({ name: nameFromQuery(opts.name), category: opts.category }),
    ingredients: blankIngredients(),
    steps: [blankStep()],
    glassOther: false,
    photo: opts.seedUri ? { kind: 'new', uri: opts.seedUri, seeded: true } : null,
    noteInput: '',
    pairInput: '',
  };
}

/**
 * A token typed but not yet added counts as added. People type "mango",
 * forget the Add button, and press save; dropping the word would be the
 * form losing what they wrote.
 */
function withPending(list: string[], input: string, max: number): string[] {
  const t = input.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!t || list.includes(t) || list.length >= max) return list;
  return [...list, t];
}

/** The form's answers as validateCustom and fieldsFromDraft read them. */
function buildDraft(f: FormState): CustomDraft {
  return {
    ...f.draft,
    ingredients: f.ingredients.map(({ item, amount }) => ({ item, amount })),
    steps: f.steps.map((s) => s.text),
    tastingNotes: withPending(f.draft.tastingNotes, f.noteInput, LIMITS.tastingNotesMax),
    pairings: withPending(f.draft.pairings, f.pairInput, LIMITS.pairingsMax),
  };
}

/*
 * What would be saved, as a string: the normalised fields and the photo.
 * The form is dirty when this differs from how it opened, so adding a
 * blank ingredient row, or tapping "Something else…" and typing nothing,
 * is not work to warn about losing.
 */
const fingerprint = (f: FormState) => JSON.stringify([fieldsFromDraft(buildDraft(f)), f.photo]);

/* -------------------------------------------------------------------- */
/* Small pieces                                                         */
/* -------------------------------------------------------------------- */

/** A group's name, above chips or rows: the Field label's look, at caption size. */
function GroupLabel({ children }: { children: string }) {
  return <Text style={styles.groupLabel}>{children}</Text>;
}

/** A line under a field or a group, in muted ink: what to write, or how much. */
function Hint({ children }: { children: string }) {
  return <Text style={styles.hint}>{children}</Text>;
}

/**
 * What is wrong with a group of controls (the style chips, the
 * ingredient rows), drawn the way Field draws its own: the alert glyph
 * and the message in red. Announced when it appears, since iOS has no
 * live regions; `nodeRef` is where VoiceOver is sent after a failed save.
 */
function GroupError({ message, nodeRef }: { message: string; nodeRef?: (n: unknown) => void }) {
  useAnnounce(message);
  return (
    <View
      ref={nodeRef}
      accessible
      accessibilityLabel={message}
      accessibilityLiveRegion="polite"
      style={styles.groupError}>
      <Icon name="alert" size={14} color={colors.danger} />
      <Text style={styles.groupErrorText}>{message}</Text>
    </View>
  );
}

/** Chips that wrap onto as many lines as they need, at any text size. */
function ChipWrap({ children }: { children: React.ReactNode }) {
  return <View style={styles.chipWrap}>{children}</View>;
}

/**
 * Tasting notes and pairings: a field that adds a word to a list, and the
 * words so far as chips that remove themselves when tapped. Return adds
 * and keeps the keyboard up for the next one; so does the Add button
 * beside the field. Suggestions (tasting notes only) are chips with a
 * plus, minus anything already added.
 */
function TokenField({
  label,
  hint,
  tokens,
  max,
  maxLength,
  input,
  suggestions,
  error,
  onInput,
  onAdd,
  onRemove,
  onBlur,
  inputRef,
}: {
  label: string;
  hint?: string;
  tokens: string[];
  max: number;
  maxLength: number;
  input: string;
  suggestions?: string[];
  error?: string;
  onInput: (v: string) => void;
  onAdd: (t: string) => void;
  onRemove: (t: string) => void;
  onBlur: () => void;
  inputRef: (n: unknown) => void;
}) {
  const full = tokens.length >= max;
  const offered = full ? [] : (suggestions ?? []).filter((s) => !tokens.includes(s));
  return (
    <View style={styles.tokenBlock}>
      <View style={styles.tokenRow}>
        <Field
          label={label}
          value={input}
          onChangeText={onInput}
          returnKeyType="done"
          submitBehavior="submit"
          onSubmitEditing={() => onAdd(input)}
          onBlur={onBlur}
          maxLength={maxLength}
          editable={!full}
          hint={full ? "That's the most it takes." : hint}
          error={error}
          ref={inputRef}
          style={styles.tokenField}
        />
        <Button
          label="Add"
          variant="text"
          size="sm"
          onPress={() => onAdd(input)}
          disabled={full || input.trim().length === 0}
          accessibilityLabel={`Add to ${label.replace(' (optional)', '').toLowerCase()}`}
          style={styles.tokenAdd}
        />
      </View>
      {tokens.length > 0 ? (
        <ChipWrap>
          {tokens.map((t) => (
            <Chip
              key={t}
              label={t}
              selected
              trailingIcon="close"
              onPress={() => onRemove(t)}
              accessibilityLabel={`${t}, remove`}
            />
          ))}
        </ChipWrap>
      ) : null}
      {offered.length > 0 ? (
        <ChipWrap>
          {offered.map((s) => (
            <Chip
              key={s}
              label={s}
              selected={false}
              icon="plus"
              onPress={() => onAdd(s)}
              accessibilityLabel={`Add ${s}`}
            />
          ))}
        </ChipWrap>
      ) : null}
    </View>
  );
}

/** The thumbnail's column in a similar row: DexThumb's 44pt and the row's 12pt gap. */
const SIMILAR_THUMB_COLUMN = 44 + space.md;
/** Dynamic Type cap on a row's name (specs/v3-cabinet.md 6.5). */
const SIMILAR_NAME_CAP = 1.4;

/**
 * "Already in the Dex?": up to three catalogue drinks whose names answer
 * the one being typed, so a drink the Dex has is one tap away instead of
 * being added twice. A drink with exactly this name comes first, and the
 * Name field says it is already in the Dex.
 *
 * Rows of drinks, with the log sheet's result parts: the drink mounted
 * as a lit thumbnail, its name in Playfair through DrinkName (it wraps and
 * the row grows, never cut short), and its style in sentence case under
 * it. Not a panel, as the log sheet's results are: three rows under a
 * field are part of the form, so they run edge to edge with a fill that
 * answers the press and does not stop short of the sheet. From the log
 * sheet a row picks that drink for the photo ("Use this"); from the Dex it
 * opens it ("Open").
 *
 * `width` is the sheet's: the name's measure is worked out from it, since
 * DrinkName fits a long word to its column before layout.
 */
function SimilarInDex({
  drinks,
  action,
  width,
  onPick,
}: {
  drinks: Drink[];
  action: 'Use this' | 'Open';
  width: number;
  onPick: (id: string) => void;
}) {
  const { fontScale } = useWindowDimensions();
  // The verb is uncapped body text, so it is measured at the reader's size.
  const verb = space.md + textWidth(action, 'inter', textRole.buttonSm.fontSize * fontScale);
  const below = width - 2 * layout.gutter - SIMILAR_THUMB_COLUMN;
  const beside = below - verb;
  /*
   * At large text the verb grows wide enough to shrink a name beside it
   * ("Use this" is about 200pt at the largest size). When it would shrink
   * any of the names, the verb moves under the style line on every row,
   * so the names keep their size and the verbs stay in one column.
   */
  const face = faceOf(textRole.rowName.fontFamily);
  const nameSize = textRole.rowName.fontSize * Math.min(fontScale, SIMILAR_NAME_CAP);
  const stacked = drinks.some(
    (d) => fitScale(d.name, face, nameSize, beside) < fitScale(d.name, face, nameSize, below),
  );
  const measure = stacked ? below : beside;
  return (
    <View style={styles.similar}>
      <Text style={styles.similarLabel}>Already in the Dex?</Text>
      {drinks.map((d) => {
        const style = styleLabel(d.subcategory);
        const verbText = <Text style={styles.similarAction}>{action}</Text>;
        return (
          <Pressable
            key={d.id}
            onPress={() => onPick(d.id)}
            accessibilityRole="button"
            accessibilityLabel={[d.name, style].filter(Boolean).join(', ')}
            accessibilityHint={action === 'Use this' ? 'Uses this drink instead' : 'Opens it in the Dex'}
            style={({ pressed }) => [styles.similarRow, pressed && styles.similarPressed]}>
            <DexThumb drink={d} />
            <View style={styles.similarText}>
              <DrinkName
                name={d.name}
                role={textRole.rowName}
                measure={measure}
                cap={SIMILAR_NAME_CAP}
                color={colors.text}
              />
              {style ? <Text style={styles.similarMeta}>{style}</Text> : null}
              {stacked ? <View style={styles.similarActionStacked}>{verbText}</View> : null}
            </View>
            {stacked ? null : verbText}
          </Pressable>
        );
      })}
    </View>
  );
}

/** A denied camera goes to Settings, as on the log sheet; a cancelled pick says nothing. */
function pickProblem(r: Extract<PickResult, { ok: false }>) {
  if (r.reason === 'cancelled') return;
  if (r.reason === 'denied' && Platform.OS !== 'web') {
    Alert.alert(r.title, r.body, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => void Linking.openSettings() },
    ]);
    return;
  }
  showNotice(r.title, r.body);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/*
 * Where each section and field sits, and the node VoiceOver is sent to
 * for each field's error. Written by onLayout and ref callbacks as the
 * form lays out; read only after a failed save, to scroll to the first
 * error and move focus there. Positions are measured, never assumed, so
 * this holds at every text size.
 *
 * Plain objects made once per form (a useState initialiser), not refs:
 * the form hands out one of these callbacks per section and field while
 * it renders, and React Compiler forbids touching a ref during render,
 * even to build a callback that only writes it later.
 */
function createPositions() {
  /** Each section's top in the scroll content. */
  const sectionY: Partial<Record<SectionKey, number>> = {};
  /** Each field's top inside its section. */
  const fieldY: Partial<Record<FieldKey, { section: SectionKey; y: number }>> = {};
  /** The input, or a group's message, that carries each field's error. */
  const nodes: Partial<Record<FieldKey, unknown>> = {};
  return {
    section: (k: SectionKey) => (e: LayoutChangeEvent) => {
      sectionY[k] = e.nativeEvent.layout.y;
    },
    field:
      (section: SectionKey, ...keys: FieldKey[]) =>
      (e: LayoutChangeEvent) => {
        for (const k of keys) fieldY[k] = { section, y: e.nativeEvent.layout.y };
      },
    target: (k: FieldKey) => (node: unknown) => {
      nodes[k] = node;
    },
    /** The field's top in the scroll content, once it has been laid out. */
    top: (k: FieldKey): number | null => {
      const at = fieldY[k];
      return at ? (sectionY[at.section] ?? 0) + at.y : null;
    },
    node: (k: FieldKey): unknown => nodes[k],
  };
}

/* -------------------------------------------------------------------- */
/* The sheet's frame                                                    */
/* -------------------------------------------------------------------- */

/** The page-sheet inset on iOS; Android presents a modal full screen. */
const BAR_INSET = Platform.OS === 'ios' ? 'sheet' : 'safe';

/**
 * Picks the drink to edit, once the store has it, and otherwise opens a
 * blank form. Editing waits for the store to load (a Hold, never a bare
 * page) and says so if the drink is gone; the form itself takes its
 * starting answers once, when it mounts, so it is only mounted when they
 * are known.
 */
export default function AddDrinkScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    name?: string;
    from?: string;
    edit?: string;
    category?: string;
  }>();
  const from: From = params.from === 'log' || params.from === 'shelf' ? params.from : 'dex';
  /*
   * Any `edit` at all means editing. One that is not a custom id names
   * nothing this person added, and says so, rather than quietly opening a
   * blank form that would save a new drink.
   */
  const editParam = typeof params.edit === 'string' && params.edit !== '' ? params.edit : null;
  const editId = editParam && isCustomId(editParam) ? editParam : null;
  const hydrated = useCustomDrinks((s) => s.hydrated);
  const editing = useCustomDrink(editId);
  const category: DrinkCategory = params.category === 'spirit' ? 'spirit' : 'cocktail';
  const name = typeof params.name === 'string' ? params.name : '';

  if (editParam && !(hydrated && editing)) {
    return (
      <View style={styles.screen}>
        {/* The paper grain, first and under everything (see the form). */}
        <Grain />
        <ScreenTopBar
          title="Edit drink"
          size="md"
          inset={BAR_INSET}
          showRule
          left={<TopBarTextButton label="Cancel" muted onPress={() => router.back()} />}
        />
        {hydrated || !editId ? (
          <EmptyState
            icon="search"
            title="Unknown entry"
            body="This drink isn't in your Dex."
            action={{ label: 'Close', onPress: () => router.back() }}
          />
        ) : (
          <Hold slowMessage="Still loading your drinks." />
        )}
      </View>
    );
  }

  return (
    <AddDrinkForm
      key={editId ?? 'new'}
      from={from}
      editing={editId ? (editing ?? null) : null}
      initialName={name}
      initialCategory={category}
    />
  );
}

/* -------------------------------------------------------------------- */
/* The form                                                             */
/* -------------------------------------------------------------------- */

function AddDrinkForm({
  from,
  editing,
  initialName,
  initialCategory,
}: {
  from: From;
  editing: CustomDrink | null;
  initialName: string;
  initialCategory: DrinkCategory;
}) {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const own = useCustomDrinks((s) => s.drinks);
  const editingId = editing?.id ?? null;

  /*
   * The starting answers, and what they would save as, made once. The log
   * sheet's photo (its "seed") is read here, from the log sheet only, and
   * cleared from the store just after (below), so a form opened later from
   * somewhere else never finds it.
   */
  const [start] = useState(() => {
    const seed = from === 'log' && !editing ? useCustomDrinks.getState().seed : null;
    const form = initialForm({
      editing,
      name: initialName,
      category: initialCategory,
      seedUri: seed?.photoUri ?? null,
    });
    return { form, print: fingerprint(form) };
  });
  useEffect(() => {
    useCustomDrinks.getState().takeSeed();
  }, []);

  const [form, setForm] = useState<FormState>(start.form);
  const [errors, setErrors] = useState<CustomErrors>({});
  /** A save has been pressed once: from then on, fields check themselves as they are left. */
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Saved, or a "Similar" row chosen: the sheet is on its way out, unguarded. */
  const [leaving, setLeaving] = useState(false);

  const d = form.draft;
  const cocktail = d.category === 'cocktail';
  const dirty = !leaving && fingerprint(form) !== start.print;

  /* ---- Where things are, for the first error ---------------------- */

  const scrollRef = useRef<ScrollView>(null);
  const [positions] = useState(createPositions);
  const sectionAt = positions.section;
  const fieldAt = positions.field;
  const target = positions.target;
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
    },
    [],
  );

  /*
   * To the first field with an error, in the order the screen shows them,
   * then VoiceOver onto it once the scroll has settled.
   */
  const showError = (key: FieldKey) => {
    const top = positions.top(key);
    if (top != null) {
      scrollRef.current?.scrollTo({ y: Math.max(0, top - space.lg), animated: true });
    }
    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => {
      const node = positions.node(key);
      if (node) AccessibilityInfo.sendAccessibilityEvent(node as HostInstance, 'focus');
    }, 400);
  };

  /* ---- Changing the answers ---------------------------------------- */

  const check = (next: FormState) => {
    if (attempted) setErrors(validateCustom(buildDraft(next), { own, editingId }));
  };
  /** Fields check themselves as they are left, once a save has been tried. */
  const onBlur = () => check(form);

  /** Typing: functional, so two keystrokes between renders cannot drop one. */
  const write = (p: Partial<CustomDraft>) =>
    setForm((f) => ({ ...f, draft: { ...f.draft, ...p } }));

  /** A tap on a chip: a finished choice, so it is checked at once. */
  const choose = (p: Partial<CustomDraft>, extra?: Partial<Omit<FormState, 'draft'>>) => {
    const next: FormState = { ...form, ...extra, draft: { ...form.draft, ...p } };
    setForm(next);
    check(next);
  };

  /*
   * Cocktail or spirit. Both answers stay in memory, and only the one
   * chosen at the end is saved (normaliseFields clears the other). A style
   * or glass picked from the old category's list that the new one does not
   * have is cleared; one typed under "Something else…" or "Other…" stays.
   */
  const setCategory = (c: DrinkCategory) => {
    if (c === d.category) return;
    const keepStyle = d.subcategoryIsNew || d.subcategory === '' || subcategoriesFor(c).includes(d.subcategory);
    const glasses: readonly string[] = GLASSWARE[c];
    const keepGlass = form.glassOther || d.glassware === '' || glasses.includes(d.glassware);
    choose({
      category: c,
      subcategory: keepStyle ? d.subcategory : '',
      glassware: keepGlass ? d.glassware : '',
    });
  };

  /* Ingredients and steps */

  const setIngredient = (key: number, p: Partial<Omit<IngredientRow, 'key'>>) =>
    setForm((f) => ({
      ...f,
      ingredients: f.ingredients.map((r) => (r.key === key ? { ...r, ...p } : r)),
    }));
  const addIngredient = () => {
    const row = blankIngredient();
    const n = form.ingredients.length + 1;
    setForm((f) => ({ ...f, ingredients: [...f.ingredients, row] }));
    announce(`Added ingredient ${n}`);
  };
  const removeIngredient = (row: IngredientRow, n: number) => {
    const next: FormState = { ...form, ingredients: form.ingredients.filter((r) => r.key !== row.key) };
    setForm(next);
    check(next);
    announce(`Removed ${row.item.trim() || `ingredient ${n}`}`);
  };

  const setStep = (key: number, text: string) =>
    setForm((f) => ({ ...f, steps: f.steps.map((r) => (r.key === key ? { ...r, text } : r)) }));
  const addStep = () => {
    const row = blankStep();
    const n = form.steps.length + 1;
    setForm((f) => ({ ...f, steps: [...f.steps, row] }));
    announce(`Added step ${n}`);
  };
  const removeStep = (row: StepRow, n: number) => {
    const next: FormState = { ...form, steps: form.steps.filter((r) => r.key !== row.key) };
    setForm(next);
    check(next);
    announce(`Removed step ${n}`);
  };

  /* Tokens: tasting notes and pairings */

  const addToken = (field: 'tastingNotes' | 'pairings', raw: string) => {
    const t = raw.trim().replace(/\s+/g, ' ').toLowerCase();
    if (!t) return;
    const max = field === 'tastingNotes' ? LIMITS.tastingNotesMax : LIMITS.pairingsMax;
    const list = form.draft[field];
    const cleared = field === 'tastingNotes' ? { noteInput: '' } : { pairInput: '' };
    if (list.includes(t)) {
      setForm({ ...form, ...cleared });
      return;
    }
    if (list.length >= max) return;
    const added = [...list, t];
    choose(field === 'tastingNotes' ? { tastingNotes: added } : { pairings: added }, cleared);
    announce(`Added ${t}`);
  };
  const removeToken = (field: 'tastingNotes' | 'pairings', t: string) => {
    const kept = form.draft[field].filter((x) => x !== t);
    choose(field === 'tastingNotes' ? { tastingNotes: kept } : { pairings: kept });
    announce(`Removed ${t}`);
  };

  /* Photo */

  const takePhoto = async () => {
    const r = await pickFromCamera();
    if (r.ok) setForm((f) => ({ ...f, photo: { kind: 'new', uri: r.uri, seeded: false } }));
    else pickProblem(r);
  };
  const choosePhoto = async () => {
    const r = await pickFromLibrary();
    if (r.ok) setForm((f) => ({ ...f, photo: { kind: 'new', uri: r.uri, seeded: false } }));
    else pickProblem(r);
  };
  const removePhoto = () => {
    setForm((f) => ({ ...f, photo: null }));
    announce('Photo removed');
  };
  const photoUri =
    form.photo == null ? null : form.photo.kind === 'saved' ? customPhotoUri(form.photo.file) : form.photo.uri;

  /* ---- The name ---------------------------------------------------- */

  /*
   * A name the Dex has, or that this person already added, is said under
   * the field as it is typed, not only on save: an exact duplicate is
   * never what anybody wants, and the drink it means is in the rows just
   * below. Quiet while leaving, when the drink just saved would otherwise
   * read as its own twin for a frame.
   */
  const nameTwin = useMemo(() => {
    const n = d.name.trim();
    if (leaving || n.length < LIMITS.nameMin) return null;
    const twin = catalogueTwin(n);
    if (twin) return `“${twin.name}” is already in the Dex.`;
    const mine = ownTwin(n, own, editingId);
    return mine ? `You already added “${mine.name}”.` : null;
  }, [d.name, own, editingId, leaving]);
  const nameError = errors.name ?? nameTwin;

  /*
   * Not while editing: the sheet was opened from the drink's own page, and
   * a row that went somewhere else would strand the edit behind it. The
   * Name field still refuses a name the Dex has.
   */
  const similar = useMemo(
    () => (editing || d.name.trim().length < 3 ? [] : similarByName(d.name, 3)),
    [d.name, editing],
  );

  const pickSimilar = (id: string) => {
    useCustomDrinks
      .getState()
      .setHandoff({ target: from === 'log' ? 'log' : 'dex', kind: 'catalogue', id });
    setLeaving(true);
  };

  /* ---- Save -------------------------------------------------------- */

  const save = async () => {
    if (saving || leaving) return;
    Keyboard.dismiss();
    const draft = buildDraft(form);
    const found = validateCustom(draft, { own, editingId });
    setAttempted(true);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      haptic.error();
      const first = firstErrorKey(found, draft.category);
      if (first) showError(first);
      return;
    }

    setSaving(true);
    const id = editing?.id ?? newCustomId();
    /*
     * The photo is copied in first, stripped of its location, under a name
     * that is the drink's: the log sheet's own file is left alone, since
     * the sheet may still save it as the pour. A disk that refuses says
     * so and the drink is saved anyway, keeping the photo it had.
     */
    let photoFile: string | null = form.photo?.kind === 'saved' ? form.photo.file : null;
    if (form.photo?.kind === 'new') {
      try {
        photoFile = await persistCustomPhoto(id, form.photo.uri);
      } catch {
        photoFile = editing?.photoFile ?? null;
        showNotice(
          "Couldn't save the photo",
          'The drink was saved without it. Try adding the photo again from Edit details.',
        );
      }
    }

    const fields = fieldsFromDraft(draft);
    const store = useCustomDrinks.getState();
    if (editing) {
      store.update(editing.id, fields, photoFile);
    } else {
      const added = store.add(fields, photoFile, id);
      store.setHandoff({ target: from === 'log' ? 'log' : 'dex', kind: 'custom', id: added.id });
    }
    haptic.success();
    setLeaving(true);
    // Sent in the background: the drink is already in the Dex, and the
    // status line on its page says whether it has reached Sipply.
    void flushSubmissions();
  };

  /* ---- Leaving ----------------------------------------------------- */

  /*
   * Leaving with answers on the form asks first, as the log sheet does.
   * This catches the swipe and Cancel alike. Saving, or choosing a
   * "Similar" row, clears the guard first and leaves from an effect, once
   * the guard has seen that render.
   */
  usePreventRemove(dirty, ({ data }) => {
    if (saving) return;
    confirmDestructive(
      editing ? 'Discard your changes?' : 'Discard this drink?',
      'Nothing here has been saved yet.',
      'Discard',
      () => navigation.dispatch(data.action),
    );
  });
  useEffect(() => {
    if (leaving) router.back();
  }, [leaving, router]);

  /*
   * See the log sheet: the page sheet's offset, for the keyboard, and its
   * width, which the "Already in the Dex?" names are fitted to.
   */
  const { width: windowW, height: windowH } = useWindowDimensions();
  const [sheet, setSheet] = useState({ w: windowW, h: windowH });

  const styleOptions = subcategoriesFor(d.category);
  const glassOptions: readonly string[] = GLASSWARE[d.category];
  const descriptionLength = Array.from(d.description).length;
  const abvRow = (section: SectionKey) => (
    <View onLayout={fieldAt(section, 'abvLow', 'abvHigh')}>
      <View style={styles.pair}>
        <Field
          label={cocktail ? 'ABV % (optional)' : 'ABV %'}
          value={d.abvLow}
          onChangeText={(v) => write({ abvLow: v })}
          onBlur={onBlur}
          inputMode="decimal"
          maxLength={4}
          placeholder="40"
          error={errors.abvLow}
          ref={target('abvLow')}
          style={styles.pairItem}
        />
        <Field
          label="to (optional)"
          value={d.abvHigh}
          onChangeText={(v) => write({ abvHigh: v })}
          onBlur={onBlur}
          inputMode="decimal"
          maxLength={4}
          placeholder="46"
          error={errors.abvHigh}
          ref={target('abvHigh')}
          style={styles.pairItem}
        />
      </View>
      {cocktail ? <Hint>Not sure? Leave it. We&apos;ll work it out.</Hint> : null}
    </View>
  );

  const glassGroup = (section: SectionKey) => (
    <View onLayout={fieldAt(section, 'glassware')} style={styles.group}>
      <GroupLabel>Glass (optional)</GroupLabel>
      <ChipWrap>
        {glassOptions.map((g) => {
          const on = !form.glassOther && d.glassware === g;
          return (
            <Chip
              key={g}
              label={g}
              selected={on}
              // Optional, with no "none" chip: tapping the chosen glass again un-picks it.
              onPress={() => choose({ glassware: on ? '' : g }, { glassOther: false })}
            />
          );
        })}
        <Chip
          label="Other…"
          selected={form.glassOther}
          onPress={() =>
            form.glassOther
              ? choose({ glassware: '' }, { glassOther: false })
              : choose({ glassware: '' }, { glassOther: true })
          }
        />
      </ChipWrap>
      {form.glassOther ? (
        <Field
          label="Glass"
          value={d.glassware}
          onChangeText={(v) => write({ glassware: v })}
          onBlur={onBlur}
          autoCapitalize="sentences"
          maxLength={LIMITS.glassware}
          error={errors.glassware}
          ref={target('glassware')}
        />
      ) : errors.glassware ? (
        <GroupError message={errors.glassware} nodeRef={target('glassware')} />
      ) : null}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? windowH - sheet.h : 0}
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        setSheet((s) => (s.w === w && s.h === h ? s : { w, h }));
      }}>
      {/*
        The paper grain, first, so everything on the page lies over it: the
        photo and the thumbnails stay clean. A page sheet is presented above
        the root layout, so no grain from anywhere else reaches it (see the
        log sheet). It takes no touches.
      */}
      <Grain />

      <ScreenTopBar
        title={editing ? 'Edit drink' : 'Add a drink'}
        size="md"
        inset={BAR_INSET}
        showRule
        left={<TopBarTextButton label="Cancel" muted onPress={() => router.back()} />}
      />

      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}>
        {editing ? null : (
          <Text style={styles.intro}>
            It goes into your Dex now. We&apos;ll look at adding it for everyone.
          </Text>
        )}

        {/* ---- The basics ---- */}
        <View onLayout={sectionAt('basics')} style={styles.section}>
          <SectionHeader title="The basics" style={styles.sectionHeader} />

          <View onLayout={fieldAt('basics', 'name')}>
            <Field
              label="Name"
              value={d.name}
              onChangeText={(v) => write({ name: v })}
              onBlur={onBlur}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={LIMITS.nameMax}
              returnKeyType="next"
              error={nameError}
              ref={target('name')}
            />
            {similar.length > 0 ? (
              <SimilarInDex
                drinks={similar}
                action={from === 'log' ? 'Use this' : 'Open'}
                width={sheet.w}
                onPick={pickSimilar}
              />
            ) : null}
          </View>

          <View onLayout={fieldAt('basics', 'category')}>
            <SegmentedControl
              items={[
                { key: 'cocktail', label: 'Cocktail' },
                { key: 'spirit', label: 'Spirit' },
              ]}
              value={d.category}
              onChange={setCategory}
            />
            <Hint>Spirits include liqueurs, amari, vermouth and sherry.</Hint>
          </View>

          <View onLayout={fieldAt('basics', 'subcategory')} style={styles.group}>
            <GroupLabel>Style</GroupLabel>
            <ChipWrap>
              {/*
                The catalogue's own strings are the values (they are what is
                saved and sent); the chips show them in sentence case.
              */}
              {styleOptions.map((s) => (
                <Chip
                  key={s}
                  label={styleLabel(s)}
                  selected={!d.subcategoryIsNew && d.subcategory === s}
                  onPress={() => choose({ subcategory: s, subcategoryIsNew: false })}
                />
              ))}
              <Chip
                label="Something else…"
                selected={d.subcategoryIsNew}
                onPress={() =>
                  d.subcategoryIsNew ? undefined : choose({ subcategory: '', subcategoryIsNew: true })
                }
              />
            </ChipWrap>
            {d.subcategoryIsNew ? (
              <Field
                label="Style name"
                value={d.subcategory}
                onChangeText={(v) => write({ subcategory: v })}
                onBlur={onBlur}
                autoCapitalize="words"
                maxLength={LIMITS.styleMax}
                error={errors.subcategory}
                ref={target('subcategory')}
              />
            ) : errors.subcategory ? (
              <GroupError message={errors.subcategory} nodeRef={target('subcategory')} />
            ) : null}
          </View>

          <View onLayout={fieldAt('basics', 'description')}>
            <Field
              label="Description"
              value={d.description}
              onChangeText={(v) => write({ description: v })}
              onBlur={onBlur}
              multiline
              autoCapitalize="sentences"
              autoCorrect
              maxLength={LIMITS.descriptionMax}
              hint={
                descriptionLength === 0
                  ? 'What it is, in a sentence or two.'
                  : `${descriptionLength} of ${LIMITS.descriptionMax}`
              }
              error={errors.description}
              ref={target('description')}
            />
          </View>
        </View>

        {/* ---- Recipe, or the bottle ---- */}
        <View onLayout={sectionAt('recipe')} style={styles.section}>
          <SectionHeader title={cocktail ? 'Recipe' : 'The bottle'} style={styles.sectionHeader} />

          {cocktail ? (
            <>
              <View onLayout={fieldAt('recipe', 'ingredients')} style={styles.group}>
                <GroupLabel>Ingredients</GroupLabel>
                <View
                  style={styles.columnHeads}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants">
                  <Text style={[styles.columnHead, styles.amountColumn]}>Amount</Text>
                  <Text style={styles.columnHead}>Ingredient</Text>
                </View>
                <View style={styles.rows}>
                  {form.ingredients.map((row, i) => (
                    <View key={row.key} style={styles.inputRow}>
                      <Field
                        labelHidden
                        accessibilityLabel={`Ingredient ${i + 1} amount`}
                        value={row.amount}
                        onChangeText={(v) => setIngredient(row.key, { amount: v })}
                        onBlur={onBlur}
                        placeholder="2 oz"
                        maxLength={LIMITS.ingredientAmount}
                        style={styles.amountColumn}
                      />
                      <Field
                        labelHidden
                        accessibilityLabel={`Ingredient ${i + 1}`}
                        value={row.item}
                        onChangeText={(v) => setIngredient(row.key, { item: v })}
                        onBlur={onBlur}
                        placeholder="Blanco tequila"
                        autoCapitalize="sentences"
                        maxLength={LIMITS.ingredientItem}
                        style={styles.grow}
                      />
                      {form.ingredients.length > LIMITS.ingredientsMin ? (
                        <Pressable
                          onPress={() => removeIngredient(row, i + 1)}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ingredient ${i + 1}, ${row.item.trim() || 'empty'}`}
                          style={({ pressed }) => [styles.remove, pressed && styles.glyphPressed]}>
                          <Icon name="close" size={16} color={colors.textMuted} />
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </View>
                {form.ingredients.length < LIMITS.ingredientsMax ? (
                  <Button
                    label="Add ingredient"
                    variant="text"
                    size="sm"
                    icon="plus"
                    onPress={addIngredient}
                    style={styles.addRow}
                  />
                ) : null}
                {errors.ingredients ? (
                  <GroupError message={errors.ingredients} nodeRef={target('ingredients')} />
                ) : null}
              </View>

              <View onLayout={fieldAt('recipe', 'method')} style={styles.group}>
                <GroupLabel>Method</GroupLabel>
                <ChipWrap>
                  {METHODS.map((m) => (
                    <Chip
                      key={m}
                      label={cap(m)}
                      selected={d.method === m}
                      onPress={() => choose({ method: m })}
                    />
                  ))}
                  {/* Not sure stores nothing, and is where the group starts. */}
                  <Chip label="Not sure" selected={d.method === ''} onPress={() => choose({ method: '' })} />
                </ChipWrap>
              </View>

              <View onLayout={fieldAt('recipe', 'steps')} style={styles.group}>
                <GroupLabel>Steps (optional)</GroupLabel>
                <View style={styles.rows}>
                  {form.steps.map((row, i) => (
                    <View key={row.key} style={styles.inputRow}>
                      <Text style={styles.stepNumber} accessibilityElementsHidden importantForAccessibility="no">
                        {i + 1}
                      </Text>
                      <Field
                        labelHidden
                        multiline
                        accessibilityLabel={`Step ${i + 1}`}
                        value={row.text}
                        onChangeText={(v) => setStep(row.key, v)}
                        onBlur={onBlur}
                        autoCapitalize="sentences"
                        autoCorrect
                        maxLength={LIMITS.step}
                        style={styles.grow}
                      />
                      {form.steps.length > 1 ? (
                        <Pressable
                          onPress={() => removeStep(row, i + 1)}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove step ${i + 1}`}
                          style={({ pressed }) => [styles.remove, pressed && styles.glyphPressed]}>
                          <Icon name="close" size={16} color={colors.textMuted} />
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </View>
                {form.steps.length < LIMITS.stepsMax ? (
                  <Button
                    label="Add step"
                    variant="text"
                    size="sm"
                    icon="plus"
                    onPress={addStep}
                    style={styles.addRow}
                  />
                ) : null}
                {errors.steps ? <GroupError message={errors.steps} nodeRef={target('steps')} /> : null}
              </View>

              {glassGroup('recipe')}

              <View onLayout={fieldAt('recipe', 'garnish')}>
                <Field
                  label="Garnish (optional)"
                  value={d.garnish}
                  onChangeText={(v) => write({ garnish: v })}
                  onBlur={onBlur}
                  autoCapitalize="sentences"
                  maxLength={LIMITS.garnish}
                  placeholder="Lime wheel"
                  error={errors.garnish}
                  ref={target('garnish')}
                />
              </View>
            </>
          ) : (
            <>
              {abvRow('recipe')}

              <View onLayout={fieldAt('recipe', 'base')}>
                <Field
                  label="Made from (optional)"
                  value={d.base}
                  onChangeText={(v) => write({ base: v })}
                  onBlur={onBlur}
                  autoCapitalize="sentences"
                  maxLength={LIMITS.base}
                  placeholder="Blue agave"
                  error={errors.base}
                  ref={target('base')}
                />
              </View>
              <View onLayout={fieldAt('recipe', 'distillation')}>
                <Field
                  label="How it's distilled (optional)"
                  value={d.distillation}
                  onChangeText={(v) => write({ distillation: v })}
                  onBlur={onBlur}
                  autoCapitalize="sentences"
                  maxLength={LIMITS.distillation}
                  placeholder="Copper pot stills"
                  error={errors.distillation}
                  ref={target('distillation')}
                />
              </View>
              <View onLayout={fieldAt('recipe', 'aging')}>
                <Field
                  label="Aging (optional)"
                  value={d.aging}
                  onChangeText={(v) => write({ aging: v })}
                  onBlur={onBlur}
                  autoCapitalize="sentences"
                  maxLength={LIMITS.aging}
                  placeholder="Unaged, or 12 years in ex-bourbon casks"
                  error={errors.aging}
                  ref={target('aging')}
                />
              </View>

              {glassGroup('recipe')}

              <View onLayout={fieldAt('recipe', 'serveTemp')} style={styles.group}>
                <GroupLabel>Serve (optional)</GroupLabel>
                <ChipWrap>
                  {SERVE_TEMPS.map((t) => {
                    const on = d.serveTemp === t.value;
                    return (
                      <Chip
                        key={t.value}
                        label={t.label}
                        selected={on}
                        // Optional, with no "none" chip: tapping the chosen one again un-picks it.
                        onPress={() => choose({ serveTemp: on ? '' : t.value })}
                      />
                    );
                  })}
                </ChipWrap>
              </View>

              <View onLayout={fieldAt('recipe', 'serveHow')}>
                <Field
                  label="How to drink it (optional)"
                  value={d.serveHow}
                  onChangeText={(v) => write({ serveHow: v })}
                  onBlur={onBlur}
                  multiline
                  autoCapitalize="sentences"
                  autoCorrect
                  maxLength={LIMITS.serveHow}
                  error={errors.serveHow}
                  ref={target('serveHow')}
                />
              </View>

              <View onLayout={fieldAt('recipe', 'pairings')}>
                <TokenField
                  label="Goes well with (optional)"
                  tokens={d.pairings}
                  max={LIMITS.pairingsMax}
                  maxLength={LIMITS.pairing}
                  input={form.pairInput}
                  error={errors.pairings}
                  onInput={(v) => setForm((f) => ({ ...f, pairInput: v }))}
                  onAdd={(t) => addToken('pairings', t)}
                  onRemove={(t) => removeToken('pairings', t)}
                  onBlur={onBlur}
                  inputRef={target('pairings')}
                />
              </View>

              <View onLayout={fieldAt('recipe', 'process')}>
                <Field
                  label="How it's made (optional)"
                  value={d.process}
                  onChangeText={(v) => write({ process: v })}
                  onBlur={onBlur}
                  multiline
                  autoCapitalize="sentences"
                  autoCorrect
                  maxLength={LIMITS.process}
                  hint="Anything unusual about how it's made."
                  error={errors.process}
                  ref={target('process')}
                />
              </View>
            </>
          )}
        </View>

        {/* ---- Details ---- */}
        <View onLayout={sectionAt('details')} style={styles.section}>
          <SectionHeader title="Details" style={styles.sectionHeader} />

          {cocktail ? abvRow('details') : null}

          <View onLayout={fieldAt('details', 'origin')}>
            <Field
              label="Where it's from (optional)"
              value={d.origin}
              onChangeText={(v) => write({ origin: v })}
              onBlur={onBlur}
              autoCapitalize="words"
              maxLength={LIMITS.origin}
              placeholder="Havana, Cuba"
              hint="City, country, or the bar that made it."
              error={errors.origin}
              ref={target('origin')}
            />
          </View>

          <View onLayout={fieldAt('details', 'tastingNotes')}>
            <TokenField
              label="Tasting notes (optional)"
              tokens={d.tastingNotes}
              max={LIMITS.tastingNotesMax}
              maxLength={LIMITS.tastingNote}
              input={form.noteInput}
              suggestions={suggestedNotes(d.category, d.subcategory)}
              error={errors.tastingNotes}
              onInput={(v) => setForm((f) => ({ ...f, noteInput: v }))}
              onAdd={(t) => addToken('tastingNotes', t)}
              onRemove={(t) => removeToken('tastingNotes', t)}
              onBlur={onBlur}
              inputRef={target('tastingNotes')}
            />
          </View>

          <View onLayout={fieldAt('details', 'funFact')}>
            <Field
              label="The story (optional)"
              value={d.funFact}
              onChangeText={(v) => write({ funFact: v })}
              onBlur={onBlur}
              multiline
              autoCapitalize="sentences"
              autoCorrect
              maxLength={LIMITS.funFact}
              hint="Who made it, where, anything worth knowing."
              error={errors.funFact}
              ref={target('funFact')}
            />
          </View>
        </View>

        {/* ---- Photo ---- */}
        <View onLayout={sectionAt('photo')} style={styles.section}>
          <SectionHeader title="Photo (optional)" style={styles.sectionHeader} />
          <View>
            {/*
              An inset photo: the panel corner and a drawn edge on the sunk
              well. It stays a 4:3 frame here (the log sheet's is a print):
              this photo goes with the suggestion for reference only, is
              never published, and is seen whole before it is sent.
            */}
            <View style={styles.photoFrame}>
              {photoUri ? (
                <Image
                  source={{ uri: photoUri }}
                  style={styles.fill}
                  contentFit="cover"
                  enforceEarlyResizing
                  accessibilityLabel="Photo of the drink"
                />
              ) : (
                <View style={styles.photoEmpty}>
                  <Icon name="camera" size={32} color={colors.text} />
                  <Text style={styles.photoEmptyTitle}>Add a photo</Text>
                  <Text style={styles.photoEmptyBody}>
                    It goes with the suggestion, for reference only.
                  </Text>
                </View>
              )}
            </View>
            {form.photo?.kind === 'new' && form.photo.seeded ? (
              <Hint>Your photo of it. Remove it if you&apos;d rather not send it.</Hint>
            ) : null}
            <View style={styles.photoActions}>
              <Button
                label="Take photo"
                variant="secondary"
                icon="camera"
                onPress={() => void takePhoto()}
                style={styles.grow}
              />
              <Button
                label="Choose photo"
                variant="secondary"
                icon="grid"
                onPress={() => void choosePhoto()}
                style={styles.grow}
              />
            </View>
            {form.photo ? (
              <Button label="Remove photo" variant="text" block onPress={removePhoto} />
            ) : null}
          </View>
        </View>

        {/* ---- For the Sipply team ---- */}
        <View onLayout={sectionAt('team')} style={styles.section}>
          <SectionHeader title="For the Sipply team (optional)" style={styles.sectionHeader} />
          <View onLayout={fieldAt('team', 'noteForTeam')}>
            <Field
              label="Note"
              value={d.noteForTeam}
              onChangeText={(v) => write({ noteForTeam: v })}
              onBlur={onBlur}
              multiline
              autoCapitalize="sentences"
              autoCorrect
              maxLength={LIMITS.noteForTeam}
              hint="Where you had it, a link to the recipe: anything that helps us add it. Only the Sipply team sees this."
              error={errors.noteForTeam}
              ref={target('noteForTeam')}
            />
          </View>
        </View>
      </ScrollView>

      {/*
        The save bar stays put under the form, as the log sheet's does: the
        consent line says, before anything is sent, who gets the suggestion
        and what is done with the photo.
      */}
      <View style={[styles.saveBar, { paddingBottom: insets.bottom + space.md }]}>
        <Text style={styles.consent}>
          Suggestions go to the Sipply team, who may add the drink to the Dex in their own words.
          Photos are only used for reference.
        </Text>
        <Button
          label={editing ? 'Save changes' : 'Add to my Dex'}
          block
          loading={saving}
          onPress={() => void save()}
        />
      </View>

    </KeyboardAvoidingView>
  );
}

/* -------------------------------------------------------------------- */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: {
    paddingHorizontal: layout.gutter,
    paddingBottom: space.xxxl,
  },
  intro: {
    ...textRole.helper,
    color: colors.textMuted,
    marginTop: space.sm,
  },

  /* Sections: a heading, then fields 16 apart */
  section: {
    marginTop: space.xl,
    gap: space.lg,
  },
  /* The section's gap is 16; a heading sits 12 above its first field. */
  sectionHeader: { marginBottom: space.md - space.lg },

  group: { gap: space.sm },
  groupLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
  },
  hint: {
    ...textRole.helper,
    color: colors.textMuted,
    marginTop: space.xs,
  },
  groupError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  groupErrorText: {
    ...textRole.helper,
    flex: 1,
    color: colors.danger,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },

  /* Two fields side by side (ABV) */
  pair: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  pairItem: { flex: 1 },
  grow: { flex: 1 },

  /* Rows of inputs: ingredients and steps */
  columnHeads: { flexDirection: 'row', gap: space.sm },
  columnHead: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
  },
  amountColumn: { width: 96 },
  rows: { gap: space.sm },
  inputRow: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
  },
  /* A bare figure in a narrow column, on the step's first line. */
  stepNumber: {
    width: 24,
    paddingTop: 14,
    fontFamily: fonts.numeral,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    ...tabular,
  },
  /* 44 × 44: the touch floor, beside a 56pt field. */
  remove: {
    width: layout.hit,
    height: layout.hit,
    marginTop: (layout.field - layout.hit) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphPressed: { opacity: 0.6 },
  /* The text button's own inset, taken back so it starts on the gutter. */
  addRow: { alignSelf: 'flex-start', marginLeft: -space.sm },

  /* Token fields */
  tokenBlock: { gap: space.sm },
  tokenRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  tokenField: { flex: 1 },
  /* Centred on the 56pt box beside it, whatever note hangs under the box. */
  tokenAdd: { marginTop: (layout.field - layout.controlSm) / 2 },

  /* Similar in the Dex */
  similar: { marginTop: space.sm },
  similarLabel: {
    fontFamily: fonts.body,
    fontSize: typeScale.caption.fontSize,
    lineHeight: typeScale.caption.lineHeight,
    color: colors.textMuted,
    marginBottom: space.xs,
  },
  /*
   * The log sheet's result metrics (min 72, the 44x56 thumbnail), bled past
   * the form's gutter so the pressed fill spans the sheet. It grows with
   * the name.
   */
  similarRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: layout.gutter,
    marginHorizontal: -layout.gutter,
  },
  similarPressed: { backgroundColor: colors.bgSunk },
  similarText: { flex: 1, gap: 2 },
  similarMeta: {
    ...textRole.rowSubtitle,
    color: colors.textMuted,
  },
  /* The row's verb, in the link ink: what a tap does here. */
  similarAction: {
    ...textRole.buttonSm,
    color: colors.wine,
  },
  similarActionStacked: { flexDirection: 'row', marginTop: space.xs },

  /* Photo: an inset 4:3 photo on the sunk well */
  photoFrame: {
    aspectRatio: 4 / 3,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.bgSunk,
    borderWidth: stroke.edge,
    borderColor: colors.line,
  },
  fill: { width: '100%', height: '100%' },
  photoEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
    gap: space.xs,
  },
  photoEmptyTitle: {
    marginTop: space.sm,
    fontFamily: fonts.bodySemiBold,
    fontSize: typeScale.bodySm.fontSize,
    lineHeight: typeScale.bodySm.lineHeight,
    color: colors.text,
  },
  photoEmptyBody: {
    ...textRole.helper,
    color: colors.textMuted,
    textAlign: 'center',
  },
  photoActions: { flexDirection: 'row', gap: space.md, marginTop: space.md },

  /* Save bar */
  saveBar: {
    paddingHorizontal: layout.gutter,
    paddingTop: space.md,
    gap: space.sm,
    borderTopWidth: stroke.edge,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  consent: {
    fontFamily: fonts.body,
    fontSize: typeScale.micro.fontSize,
    lineHeight: typeScale.micro.lineHeight,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
