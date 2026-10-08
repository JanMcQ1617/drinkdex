/*
 * v3.3 Brass: the back-bar fittings (specs/v3-3-mockups/brass/spec.md).
 * Screens import from here. cabinet.tsx and media.tsx import the files
 * directly instead, so the barrel's NumberRail (which reaches ui.tsx,
 * which reaches cabinet.tsx) can never close an import cycle.
 */
export { BrassGauge, rungCounts } from '@/components/brass/BrassGauge';
export { BrassPlate, formatPlateNumber, PLATE_CAP, plateWidth, type PlateSize } from '@/components/brass/BrassPlate';
export { Dateline, datelineText, formatDateline } from '@/components/brass/Dateline';
export { DexPlaque } from '@/components/brass/DexPlaque';
export {
  BRACKET_INSET,
  BrassBezel,
  BrassHairline,
  bezelSize,
  CornerBrackets,
  MountKeyline,
  WindowBevel,
} from '@/components/brass/frames';
export { IngredientGlyph } from '@/components/brass/IngredientGlyph';
export { BottleLabel, chamferPath, LabelTag, labelTagSize, type LabelTagSize } from '@/components/brass/labels';
export { NumberRail } from '@/components/brass/NumberRail';
export { BrassGrabber, BrassRail, CountSeparator, DotLeader, RAIL, SpoonRule } from '@/components/brass/rules';
export { formatRange, SHELF_HEIGHT, WalnutFill, WalnutShelf } from '@/components/brass/walnut';
