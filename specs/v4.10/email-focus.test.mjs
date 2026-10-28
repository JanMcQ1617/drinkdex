#!/usr/bin/env node
/* ==================================================================== */
/* The email field that would not keep its keyboard (specs/v4.10/       */
/* email-focus.md): a pure check, no device, no React                   */
/*                                                                      */
/* Fabric keeps a native view for a React Native <View> only when its   */
/* props need one (ViewShadowNode::initialize, react-native 0.86.3:     */
/* ReactCommon/react/renderer/components/view/ViewShadowNode.cpp); any  */
/* other View is flattened away and its children are mounted straight   */
/* into the nearest ancestor that has one. When a View's props change   */
/* between the two, the Differentiator REPARENTS its children: a Remove */
/* from the old native parent, an Insert into the new one               */
/* (Differentiator.cpp, ReparentMode::Flatten / Unflatten). And a       */
/* zIndex is a native order (ConcreteViewShadowNode.h's orderIndex_,    */
/* sorted by sliceChildShadowNodeViewPairs), so a zIndex that changes   */
/* a view's place among its siblings is a Remove and an Insert too.     */
/* On iOS a Remove is removeFromSuperview (RCTViewComponentView's       */
/* unmountChildComponentView), and a UITextField that leaves the window */
/* resigns first responder: the keyboard goes down and onBlur fires.    */
/*                                                                      */
/* So the wrapper around a TextInput must have the same native shape,   */
/* focused or not. This reads Field's outer wrapper out of              */
/* src/components/ui.tsx, works out its style for each place a field    */
/* can stand (alone, or a row of a FieldGroup) focused and not, and     */
/* fails if focus would flatten, unflatten or reorder it.               */
/*                                                                      */
/* The rules it models are read back out of the installed React Native  */
/* first, so a React Native that changed them fails here, loudly, and    */
/* this file gets rewritten rather than quietly passing.                */
/*                                                                      */
/*   node specs/v4.10/email-focus.test.mjs             the working tree */
/*   git show b0816cf:src/components/ui.tsx > /tmp/ui-34.tsx            */
/*   node specs/v4.10/email-focus.test.mjs /tmp/ui-34.tsx    build 34   */
/*                                                                      */
/* The second fails on Email, Password and Phone number, as build 34    */
/* did on Jan's phone.                                                  */
/* ==================================================================== */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const uiPath = process.argv[2] ? resolve(process.argv[2]) : join(root, 'src/components/ui.tsx');
const src = readFileSync(uiPath, 'utf8');

/* ---- The React Native this models, as installed ---------------------- */

const rn = join(root, 'node_modules/react-native');
const rnFacts = [
  [
    'a positioned zIndex makes a View a native view of its own',
    'ReactCommon/react/renderer/components/view/ViewShadowNode.cpp',
    /formsStackingContext =[\s\S]*?viewProps\.zIndex\.has_value\(\) &&\s*viewProps\.yogaStyle\.positionType\(\) != yoga::PositionType::Static[\s\S]*?bool formsView = formsStackingContext/,
  ],
  [
    'a View is positioned (relative) unless it says otherwise',
    'ReactCommon/yoga/yoga/style/Style.h',
    /PositionType positionType_\s*:\s*bitCount<PositionType>\(\) = PositionType::Relative/,
  ],
  [
    'a View that turns native takes its flattened children from its parent (Unflatten)',
    'ReactCommon/react/renderer/mounting/Differentiator.cpp',
    /ReparentMode::Unflatten[\s\S]*?InsertMutation/,
  ],
  [
    'a zIndex is the native order among siblings',
    'ReactCommon/react/renderer/components/view/ConcreteViewShadowNode.h',
    /orderIndex_ = props\.zIndex\.value_or\(0\)/,
  ],
  [
    'on iOS a Remove takes the view out of its superview',
    'React/Fabric/Mounting/ComponentViews/View/RCTViewComponentView.mm',
    /unmountChildComponentView[\s\S]*?\[childComponentView removeFromSuperview\]/,
  ],
];
for (const [fact, file, pattern] of rnFacts) {
  let text;
  try {
    text = readFileSync(join(rn, file), 'utf8');
  } catch {
    console.error(`react-native's ${file} is missing: install the packages first (npm install).`);
    process.exit(2);
  }
  if (!pattern.test(text)) {
    console.error(`React Native no longer reads as this check assumes (${fact}; ${file}). Rewrite the model below.`);
    process.exit(2);
  }
}

/** The text between an opening bracket at `open` and its match, brackets of every kind counted. */
function balanced(text, open) {
  const pairs = { '{': '}', '[': ']', '(': ')' };
  const stack = [];
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return text.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced from ${open}`);
}

/* ---- Field's outer wrapper, as written ------------------------------- */

const fieldAt = src.indexOf('export function Field(');
if (fieldAt < 0) throw new Error('Field not found in ui.tsx');
const returnAt = src.indexOf('return (', fieldAt);
const tagAt = src.indexOf('<View', returnAt);
// The opening tag ends at the first '>' outside every brace.
let depth = 0;
let tagEnd = tagAt;
for (let i = tagAt; i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') depth--;
  else if (src[i] === '>' && depth === 0) {
    tagEnd = i;
    break;
  }
}
const tag = src.slice(tagAt, tagEnd + 1);
const styleAt = tag.indexOf('style={');
if (styleAt < 0) throw new Error(`Field's wrapper has no style: ${tag}`);
const styleExpr = balanced(tag, styleAt + 'style='.length);
const collapsableAt = tag.indexOf('collapsable={');
const collapsableExpr = collapsableAt < 0 ? null : balanced(tag, collapsableAt + 'collapsable='.length);

/* ---- The style objects it can name ----------------------------------- */

const sheetAt = src.indexOf('fieldLifted:');
if (sheetAt < 0) throw new Error('styles.fieldLifted not found');
// eslint-disable-next-line no-new-func
const fieldLifted = new Function(`return ({${balanced(src, src.indexOf('{', sheetAt))}});`)();
const styles = { fieldLifted };

/* ---- Fabric's rules, the part a field's wrapper can reach ------------ */

function flatten(style) {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return style;
}

/** ViewShadowNode::initialize's FormsView, for the props a style or `collapsable` can set. */
function formsView(props) {
  const s = flatten(props.style);
  const positioned = s.position !== 'static';
  const border = Object.keys(s).some((k) => /^border(Top|Right|Bottom|Left|Start|End)?Width$/.test(k));
  return (
    props.collapsable === false ||
    (s.zIndex !== undefined && positioned) ||
    (s.opacity !== undefined && s.opacity !== 1) ||
    (Array.isArray(s.transform) && s.transform.length > 0) ||
    s.overflow === 'hidden' ||
    s.display === 'none' ||
    (s.backgroundColor !== undefined && s.backgroundColor !== 'transparent') ||
    border ||
    s.boxShadow !== undefined
  );
}

/** ConcreteViewShadowNode's orderIndex_: the native order among siblings. */
function orderIndex(props) {
  const s = flatten(props.style);
  return s.position !== 'static' ? (s.zIndex ?? 0) : 0;
}

/* ---- Every place, focused and not ----------------------------------- */

// eslint-disable-next-line no-new-func
const evalStyle = new Function('slot', 'ringColor', 'style', 'styles', `return (${styleExpr});`);
// eslint-disable-next-line no-new-func
const evalCollapsable = collapsableExpr ? new Function(`return (${collapsableExpr});`) : () => undefined;

const RING = '#000000';
const places = [
  ['alone', null],
  ['the only row of a group (Email)', { position: 'only', note: null }],
  ['the last row of a group (Phone number, Password)', { position: 'last', note: null }],
  ['a first row of a group', { position: 'first', note: null }],
  ['a middle row of a group', { position: 'middle', note: null }],
];

console.log(`Field's wrapper: ${tag.replace(/\s+/g, ' ')}\n`);
let failed = 0;
for (const [name, slot] of places) {
  const at = (ringColor) => {
    const props = { style: evalStyle(slot, ringColor, undefined, styles), collapsable: evalCollapsable() };
    return { view: formsView(props), order: orderIndex(props) };
  };
  const rest = at(null);
  const ringed = at(RING);
  const steady = rest.view === ringed.view && rest.order === ringed.order;
  if (!steady) failed++;
  console.log(
    `${steady ? 'ok  ' : 'FAIL'} ${name}: at rest ${rest.view ? 'a native view' : 'flattened'}, order ${rest.order}; ` +
      `focused ${ringed.view ? 'a native view' : 'flattened'}, order ${ringed.order}` +
      (steady ? '' : '  <- focus reparents the TextInput, which resigns first responder'),
  );
}

if (failed) {
  console.error(`\n${failed} place(s) where focusing a field moves its TextInput natively and drops the keyboard.`);
  process.exit(1);
}
console.log('\nFocus never changes the native shape around a field.');
