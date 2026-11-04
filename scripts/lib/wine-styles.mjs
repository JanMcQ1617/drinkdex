/**
 * How a wine of each style is treated: its Dex family, glass, strength,
 * serve and vinification, by the atlas's own `s` field.
 *
 * Shared since v4.15 by scripts/merge-wine-atlas.mjs, where it was written,
 * and scripts/merge-wine-brands.mjs, which falls back to it when a bottle
 * is not the colour of the card it is filed under (a white Côtes de
 * Provence, a sparkling Vouvray). One table, so a line reworded for App
 * Review is reworded for both.
 */

/* ------------------------------------------------------------------ */
/* Style → how you actually treat the wine                             */
/*                                                                     */
/* One line changed on the way back (v4.14): Rosé's serve said a bottle */
/* kept for an occasion is "a bottle wasted", which reads as a nudge to */
/* open one, and App Review 1.4.3 allows nothing that does. It says why */
/* rosé is drunk young instead.                                        */
/*                                                                     */
/* Keyed on the atlas's own `s` field. Everything here is true of the  */
/* STYLE, which is the same basis the authored wine cards use — a      */
/* sparkling wine is served cold in a flute whoever made it.           */
/* ------------------------------------------------------------------ */

export const STYLE = {
  Red: {
    sub: 'Regional Red', glass: 'Red wine glass', abv: '12.5–14.5%',
    temp: '60-65°F, cool room temperature',
    notes: ['red fruit', 'tannin', 'earth', 'oak'],
    pair: ['Roast meats', 'Hard cheese', 'Mushroom dishes'],
    how: 'Pour into a large bowl and give it air — most reds are built to open up rather than to be drunk the moment the cork is out. Serve cooler than the room actually is; at true room temperature the alcohol comes forward and the fruit flattens.',
    vinif: 'Fermented on the skins for colour and tannin, then aged in oak or steel depending on the house.',
  },
  White: {
    sub: 'White', glass: 'White wine glass', abv: '11.5–13.5%',
    temp: '45-50°F, well chilled',
    notes: ['citrus', 'orchard fruit', 'mineral', 'crisp acidity'],
    pair: ['White fish', 'Goat cheese', 'Salads'],
    how: 'Chill it properly but not to numbness — under about 45°F the aromatics shut down and you taste only cold. Pour small and let the glass warm in your hand between sips; a white that tastes of nothing straight from the fridge often blooms after ten minutes.',
    vinif: 'Pressed off the skins before fermentation, then fermented cool to keep the aromatics.',
  },
  Rosé: {
    sub: 'Rosé', glass: 'White wine glass', abv: '11.5–13%',
    temp: '45-50°F, well chilled',
    notes: ['strawberry', 'citrus peel', 'dry finish'],
    pair: ['Charcuterie', 'Grilled vegetables', 'Seafood'],
    how: 'Serve it cold and young. Rosé is one of the few wines where the current vintage is almost always the right one: it fades with keeping rather than improving.',
    vinif: 'Brief skin contact — hours, not days — for colour, then fermented like a white.',
  },
  Sparkling: {
    sub: 'Sparkling', glass: 'Champagne flute', abv: '11.5–12.5%',
    temp: '43-47°F, well chilled',
    notes: ['green apple', 'brioche', 'citrus', 'fine bead'],
    pair: ['Oysters', 'Fried food', 'Almonds'],
    how: 'Chill hard, open quietly — the loud pop wastes pressure that should end up in the glass. Pour against the side and let the foam settle rather than filling in one go.',
    vinif: 'A base wine taken through a second fermentation that traps its own carbon dioxide.',
  },
  'Sparkling Rosé': {
    sub: 'Sparkling', glass: 'Champagne flute', abv: '11.5–12.5%',
    temp: '43-47°F, well chilled',
    notes: ['red berry', 'brioche', 'citrus', 'fine bead'],
    pair: ['Charcuterie', 'Salmon', 'Berry desserts'],
    how: 'Treat it exactly like any other sparkling wine: hard chill, quiet opening, poured against the glass. The colour comes from brief skin contact, not from anything that changes how you serve it.',
    vinif: 'A rosé base wine taken through a second fermentation in bottle or tank.',
  },
  'Sparkling Red': {
    sub: 'Sparkling', glass: 'Red wine glass', abv: '11–13%',
    temp: '50-55°F, lightly chilled',
    notes: ['blackberry', 'plum', 'soft tannin', 'foam'],
    pair: ['Cured meats', 'Rich pasta', 'Chocolate'],
    how: 'Chill it less than a white sparkling — the tannin turns harsh when it is too cold. Pour into a proper wine glass rather than a flute so the fruit has room.',
    vinif: 'A red base wine refermented to trap carbon dioxide, often finished off-dry.',
  },
  'Sweet White': {
    sub: 'Dessert', glass: 'Small dessert wine glass', abv: '9–14%',
    temp: '43-47°F, well chilled',
    notes: ['honey', 'apricot', 'candied citrus', 'bright acidity'],
    pair: ['Blue cheese', 'Fruit tarts', 'Foie gras'],
    how: 'Pour two or three ounces, no more — this is concentrated and a full glass defeats it. Serve cold enough that the acidity stays sharp against the sugar, which is what stops a sweet wine tasting like syrup.',
    vinif: 'Sugar concentrated in the fruit — by botrytis, freezing or drying — then fermented only part way.',
  },
  'Sweet Red': {
    sub: 'Dessert', glass: 'Small dessert wine glass', abv: '10–15%',
    temp: '55-60°F, cellar cool',
    notes: ['dried fig', 'cherry', 'cocoa', 'sweet finish'],
    pair: ['Dark chocolate', 'Aged cheese', 'Nut tarts'],
    how: 'Serve cooler than a dry red but warmer than a white dessert wine, and pour small. The sweetness carries a long way and a modest glass lasts a whole course.',
    vinif: 'Fermentation halted with sugar remaining, sometimes from dried or late-picked fruit.',
  },
  'Sweet Rosé': {
    sub: 'Dessert', glass: 'White wine glass', abv: '9–12%',
    temp: '43-47°F, well chilled',
    notes: ['strawberry', 'candied citrus', 'sweet finish'],
    pair: ['Fruit desserts', 'Spicy food', 'Soft cheese'],
    how: 'Cold, small pours, and young. Its whole appeal is fresh sweet fruit, and neither age nor warmth does it any favours.',
    vinif: 'Brief skin contact for colour, with fermentation stopped while sugar remains.',
  },
  Fortified: {
    sub: 'Fortified Wine', glass: 'Copita', abv: '15–22%',
    temp: '55-60°F, cellar cool',
    notes: ['dried fruit', 'nut', 'caramel', 'spirit warmth'],
    pair: ['Aged cheese', 'Nuts', 'Dried fruit'],
    how: 'Pour a small measure into something with a narrow rim so the aromatics gather. Fortified wine keeps for weeks after opening where a table wine would not, so there is no need to finish the bottle.',
    vinif: 'Grape spirit added during or after fermentation, raising strength and often leaving sugar behind.',
  },
  'Vin Jaune': {
    sub: 'White', glass: 'White wine glass', abv: '13.5–15%',
    temp: '55-60°F, cellar cool',
    notes: ['walnut', 'curry spice', 'green apple', 'salt'],
    pair: ['Comté', 'Chicken in cream', 'Walnuts'],
    how: 'Serve it far warmer than an ordinary white — cold mutes the walnut and spice that are the entire point. Open it well ahead; this is a wine that rewards an hour in the glass.',
    vinif: 'Aged years under a film of yeast in a barrel deliberately left unfilled.',
  },
  Orange: {
    sub: 'Skin-Contact', glass: 'White wine glass', abv: '11.5–13.5%',
    temp: '50-55°F, lightly chilled',
    notes: ['dried apricot', 'tea tannin', 'nut', 'grip'],
    pair: ['Spiced dishes', 'Hard cheese', 'Roast vegetables'],
    how: 'Treat it like a light red rather than a white: barely chilled, in a glass with some bowl. It has tannin, and tannin served ice-cold turns to grit.',
    vinif: 'White grapes fermented on their skins for days or months, taking colour and tannin.',
  },
  Various: {
    sub: 'Regional Red', glass: 'Wine glass', abv: 'Varies by producer',
    temp: '50-60°F, depending on style',
    notes: ['varies by producer'],
    pair: ['Depends what is in the bottle'],
    how: 'This denomination covers more than one style, so the bottle in front of you decides. Check the label for colour and sweetness and treat it accordingly.',
    vinif: 'Varies — the denomination permits several styles.',
  },
};
