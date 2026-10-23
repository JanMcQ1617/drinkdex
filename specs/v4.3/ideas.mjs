/*
 * Daily ideas: the reference catalogue (specs/v4.3/spec.md §3.6).
 *
 * Jan, 13 Oct 2026: "every single day send users different messages like
 * post your first drinks, or create a new drink, create around 200
 * different sayings to put in notifications for users."
 *
 * 200 messages in ten categories. On landing, this file is ported as
 * src/data/dailyIdeas.ts (the same array, typed: DailyIdea[]) and
 * tools/schedule.mjs's checks become scripts/check-ideas.mjs, which fails
 * the build when a message breaks a rule below. The copy moves verbatim;
 * an edit here or there is re-checked by the same script.
 *
 * THE RULE THAT DECIDES EVERY LINE (App Store 1.4.3). An alcohol app may
 * never encourage drinking, or drinking more. So a message only ever asks
 * for one of these: logging what the person ALREADY had, making a recipe,
 * reading about a drink, browsing or filtering the Dex, saving, sorting
 * saves into collections, friends, and plain knowledge. Never "have one",
 * "time for", a time of day or a day of the week, rounds, streaks, a count
 * to raise, or a reward for more. The verbs are log, post, add, create,
 * read, look up, browse, save, share, follow, tag. Past tense for drinking
 * ("one you've had"). tools/schedule.mjs holds the banned list it enforces;
 * a person reviewed every line as well, because a list cannot judge tone.
 *
 * HOUSE STYLE. Plain English, sentence case, British spelling (colour,
 * favourite, flavour), no em or en dashes, no exclamation marks, no emoji,
 * no capitals beyond a sentence's first letter and proper names. Body only:
 * iOS shows "Sipply" as the bold first line of a notification with no
 * title, so a title would say the app's name twice. At most 120 characters
 * after the tokens are filled with their longest real values.
 *
 * TOKENS, filled on the phone when the day is scheduled:
 *   {caught}      drinks in your Dex, formatCount ("1,204")
 *   {total}       drinks in the catalogue, formatCount ("2,089")
 *   {left}        total minus caught, formatCount
 *   {suggestion}  the name of the day's suggested COCKTAIL (spec §3.5)
 * A message with {caught} needs `caught2` (so it never reads "1 drinks"), one
 * with {left} needs `caught`, and one with {suggestion} opens `drink`.
 *
 * NEEDS, every one must hold on the day it is scheduled (spec §3.4):
 *   empty        nothing in the Dex yet
 *   caught       at least one drink in the Dex
 *   caught2      at least two
 *   account      signed in
 *   noPosts      signed in, and no post yet
 *   posted       at least one post
 *   noCustom     no drink of your own yet
 *   custom       at least one drink of your own
 *   noFollows    signed in, following nobody
 *   follows      following at least one person
 *   tastes       the first run's answers are there (a flavour or a spirit)
 *   noTastes     they are not
 *   saved        something in All saved (a drink or a post)
 *   collections  signed in and 023's collections live
 *   tags         signed in, following someone, and 024's tags live
 *
 * OPENS, what a tap does (spec §3.7): log · addDrink · dex · drink ·
 * progress · saved · findFriends · home · activity · profile · tastes.
 * `drink` opens the day's {suggestion}, or the message's own `drink` id.
 */

/** Category, in the order a tie between weights is broken. */
export const CATEGORIES = {
  first:   { label: 'First steps',         count: 16, needs: ['empty'] },
  post:    { label: 'Post your first',     count: 14, needs: ['caught', 'noPosts'] },
  log:     { label: 'Log what you had',    count: 28, needs: ['caught'] },
  create:  { label: 'Create a drink',      count: 22, needs: [] },
  explore: { label: 'A drink to read',     count: 34, needs: [] },
  dex:     { label: 'Browse the Dex',      count: 22, needs: [] },
  saved:   { label: 'Saved, collections',  count: 18, needs: [] },
  friends: { label: 'Friends',             count: 20, needs: ['account'] },
  know:    { label: 'Knowledge',           count: 20, needs: [] },
  tastes:  { label: 'Your tastes',         count: 6,  needs: ['noTastes'] },
};

export const IDEAS = [
  /* ---- first: nothing in the Dex yet. Start with something already had, or just look around. ---- */
  { id: 'first-01', cat: 'first', opens: 'log', body: "Post your first drink. Pick one you've had before, add a photo, and it lands in your Dex." },
  { id: 'first-02', cat: 'first', opens: 'log', body: "Your Dex is empty so far. Think of a drink you've had and add it from your camera roll." },
  { id: 'first-03', cat: 'first', opens: 'log', body: "Every drink in the Dex starts as a grey proof. Log one you've had and watch it turn to colour." },
  { id: 'first-04', cat: 'first', opens: 'log', body: 'Got a drink photo in your camera roll? It could be the first print in your Dex.' },
  { id: 'first-05', cat: 'first', opens: 'log', body: 'Start with a classic you already know. Search its name, add the photo, and that is it.' },
  { id: 'first-06', cat: 'first', opens: 'log', body: "{total} drinks in the Dex, none of them yours yet. Which one have you had before?" },
  { id: 'first-07', cat: 'first', opens: 'dex', body: 'Not sure where to begin? Browse the Dex and tap any drink to read its story.' },
  { id: 'first-08', cat: 'first', opens: 'dex', body: 'Search the Dex by country. Type mexico or italy and see what comes from there.' },
  { id: 'first-09', cat: 'first', opens: 'log', body: 'Your first entry can be an old favourite. Find it in the Dex and add a photo.' },
  { id: 'first-10', cat: 'first', opens: 'log', body: "Type a drink you remember. That's all it takes to start your Dex." },
  { id: 'first-11', cat: 'first', opens: 'log', body: "Log a drink you've had to see your first colour print in the Dex." },
  { id: 'first-12', cat: 'first', opens: 'dex', body: 'Search by style as well as by name: tiki, sour and spritz all work.' },
  { id: 'first-13', cat: 'first', opens: 'log', body: 'Spirits count too. A bottle you know well can be the first thing in your Dex.' },
  { id: 'first-14', cat: 'first', opens: 'dex', body: "Look up a drink you've always wondered about. Every page has its glass, garnish and story." },
  { id: 'first-15', cat: 'first', opens: 'log', body: "Your Dex fills up as you log what you've had, at your own pace. Start with one." },
  { id: 'first-16', cat: 'first', opens: 'log', body: 'Know a drink by its look but not its name? Search by country or style to find it.' },

  /* ---- post: drinks in the Dex, signed in, nothing posted. Jan's "post your first drinks". ---- */
  { id: 'post-01', cat: 'post', opens: 'log', body: 'Post your first drink. Your friends see it on Home, and it stays on your profile.' },
  { id: 'post-02', cat: 'post', opens: 'log', needs: ['caught2'], body: 'You have {caught} drinks in your Dex and nothing posted yet. Share one with the people you follow.' },
  { id: 'post-03', cat: 'post', opens: 'dex', body: 'Posting starts from your Dex. Open a drink you have had and choose Post this drink.' },
  { id: 'post-04', cat: 'post', opens: 'log', body: 'A post is a photo and a line about it. Share your favourite drink from your Dex.' },
  { id: 'post-05', cat: 'post', opens: 'log', body: 'Your Dex is private until you post. Share one drink and see who likes it.' },
  { id: 'post-06', cat: 'post', opens: 'log', body: 'Post your first drink and it shows up on your profile for friends to see.' },
  { id: 'post-07', cat: 'post', opens: 'log', body: 'Write one line about a drink you logged, then post it. The caption is up to you.' },
  { id: 'post-08', cat: 'post', opens: 'log', body: 'Made a drink at home and logged it? A homemade one makes a good first post.' },
  { id: 'post-09', cat: 'post', opens: 'log', body: "Your friends post what they've had. Add yours to the feed." },
  { id: 'post-10', cat: 'post', opens: 'log', body: 'Pick the best photo in your Dex and post it, with a caption or without.' },
  { id: 'post-11', cat: 'post', opens: 'log', needs: ['tags'], body: 'A post can tag the friends you were with. Post one and tag them.' },
  { id: 'post-12', cat: 'post', opens: 'log', body: 'Liked a drink you logged? Posting it lets friends save it for themselves.' },
  { id: 'post-13', cat: 'post', opens: 'profile', body: 'Nothing on your profile yet. One post is enough to make it yours.' },
  { id: 'post-14', cat: 'post', opens: 'dex', body: 'Your first post can be any drink already in your Dex. Open it and tap Post this drink.' },

  /* ---- log: what they ALREADY had. Never "go and have", never "next". ---- */
  { id: 'log-01', cat: 'log', opens: 'log', body: 'Had something new lately? Add it to your Dex while you still remember it.' },
  { id: 'log-02', cat: 'log', opens: 'log', body: "Anything you've had recently that isn't in your Dex yet? Log it before you forget." },
  { id: 'log-03', cat: 'log', opens: 'log', body: 'Your camera roll might hold a drink or two you never logged. Worth a look.' },
  { id: 'log-04', cat: 'log', opens: 'log', needs: ['caught2'], body: "{caught} drinks in your Dex. Any you've had that still need logging?" },
  { id: 'log-05', cat: 'log', opens: 'log', body: 'Log a drink with a photo and a note, so you remember what made it good.' },
  { id: 'log-06', cat: 'log', opens: 'log', body: "Your Dex is a diary of what you've had. Add the last one you remember." },
  { id: 'log-07', cat: 'log', opens: 'log', body: "Found a photo of a drink from a trip? Search where it's from and log it." },
  { id: 'log-08', cat: 'log', opens: 'log', body: 'A note on a log helps later: where it was, who made it, what was in it.' },
  { id: 'log-09', cat: 'log', opens: 'dex', body: 'Got a better photo of a drink you already logged? Swap it in from its page in the Dex.' },
  { id: 'log-10', cat: 'log', opens: 'log', body: 'Remember a drink but not its name? Search by its country or its style.' },
  { id: 'log-11', cat: 'log', opens: 'log', body: "Logging takes a search, a photo and one tap. Add something you've had." },
  { id: 'log-12', cat: 'log', opens: 'log', body: "Drinks you've had at a friend's place count. Add them to your Dex." },
  { id: 'log-13', cat: 'log', opens: 'log', body: 'A drink from a holiday belongs in your Dex too. Search the place it comes from.' },
  { id: 'log-14', cat: 'log', opens: 'log', body: 'Did someone make you a drink you liked? Log it and note who made it.' },
  { id: 'log-15', cat: 'log', opens: 'log', body: "Spirits count. Log a bottle you've tasted and see where it sits in the Dex." },
  { id: 'log-16', cat: 'log', opens: 'log', body: "Every log turns a grey proof into a colour print. Any you've had still grey?" },
  { id: 'log-17', cat: 'log', opens: 'log', body: "Add a drink you've had and keep its photo safe in your Dex." },
  { id: 'log-18', cat: 'log', opens: 'log', body: "Your Dex remembers what you've had so you don't have to. Add the latest one." },
  { id: 'log-19', cat: 'log', opens: 'log', body: 'Going through old photos? Any drinks you find there can go straight into your Dex.' },
  { id: 'log-20', cat: 'log', opens: 'log', body: "Search the Dex for the last drink you had. If it's there, add your photo to it." },
  { id: 'log-21', cat: 'log', opens: 'log', needs: ['account'], body: "Post a drink you've had and your friends can save it for later." },
  { id: 'log-22', cat: 'log', opens: 'log', needs: ['caught2'], body: "Your Dex holds {caught} drinks. Is anything you've had missing from it?" },
  { id: 'log-23', cat: 'log', opens: 'log', body: "Your Dex is only as full as your memory. Add one you'd forgotten." },
  { id: 'log-24', cat: 'log', opens: 'log', body: 'A log stays private until you post it. Add one just for you.' },
  { id: 'log-25', cat: 'log', opens: 'log', body: 'Some drinks share a name. When you log one, pick the one from the right country.' },
  { id: 'log-26', cat: 'log', opens: 'log', body: 'Log a drink and its page is yours: the glass, the garnish, where it comes from.' },
  { id: 'log-27', cat: 'log', opens: 'log', body: 'When you log a drink, a short note about who made it is worth keeping.' },
  { id: 'log-28', cat: 'log', opens: 'log', body: 'A blurry photo still counts. Log it and swap in a better one whenever you like.' },

  /* ---- create: a recipe of your own (add-drink). Jan's "create a new drink". ---- */
  { id: 'create-01', cat: 'create', opens: 'addDrink', body: 'Create a new drink. Give it a name, a recipe and a photo, and it joins your Dex.' },
  { id: 'create-02', cat: 'create', opens: 'addDrink', body: 'Got a recipe of your own? Add it to your Dex with its ingredients and measures.' },
  { id: 'create-03', cat: 'create', opens: 'addDrink', body: "Can't find a drink in the Dex? Add it yourself and it's kept with your Dex." },
  { id: 'create-04', cat: 'create', opens: 'addDrink', body: 'Name your own drink. A twist on a classic counts as a new one.' },
  { id: 'create-05', cat: 'create', opens: 'addDrink', body: 'Write down the recipe you make at home before you forget the measures.' },
  { id: 'create-06', cat: 'create', opens: 'addDrink', body: 'A drink you add gets its own page in your Dex, with its photo and recipe.' },
  { id: 'create-07', cat: 'create', opens: 'addDrink', body: 'Invent something. Pick a spirit, add what goes with it, and give it a name.' },
  { id: 'create-08', cat: 'create', opens: 'addDrink', body: 'A drink named after a friend? Add it to Sipply, recipe and all.' },
  { id: 'create-09', cat: 'create', opens: 'addDrink', body: 'Recipes you add keep their measures, so you never lose a good one.' },
  { id: 'create-10', cat: 'create', opens: 'addDrink', body: 'The best recipes are the ones written down. Add yours to Sipply.' },
  { id: 'create-11', cat: 'create', opens: 'addDrink', body: "Saw a drink on a menu that isn't in the Dex? Add it so you don't forget it." },
  { id: 'create-12', cat: 'create', opens: 'addDrink', body: 'Made a classic your own way? Add your version as a new drink.' },
  { id: 'create-13', cat: 'create', opens: 'addDrink', body: 'Your own drinks get pages just like the {total} in the Dex. Create one.' },
  { id: 'create-14', cat: 'create', opens: 'addDrink', body: 'A family recipe is worth keeping. Add it to your Dex as a new drink.' },
  { id: 'create-15', cat: 'create', opens: 'addDrink', body: "Add a drink from your travels that the Dex doesn't have yet." },
  { id: 'create-16', cat: 'create', opens: 'addDrink', body: "Write up a drink you'd like to make one day: its name, ingredients and method." },
  { id: 'create-17', cat: 'create', opens: 'addDrink', needs: ['custom'], body: "You've created a drink before. Got more recipes worth keeping?" },
  { id: 'create-18', cat: 'create', opens: 'addDrink', needs: ['custom'], body: 'Your own drinks sit in your Dex beside the classics. Room for one more recipe.' },
  { id: 'create-19', cat: 'create', opens: 'addDrink', body: 'Give a drink you create a photo. A picture makes the page.' },
  { id: 'create-20', cat: 'create', opens: 'addDrink', body: 'Recipes without alcohol are welcome too. Add one to your Dex.' },
  { id: 'create-21', cat: 'create', opens: 'addDrink', body: 'Could you list every ingredient in your favourite recipe? Write it down in Sipply.' },
  { id: 'create-22', cat: 'create', opens: 'addDrink', needs: ['noCustom'], body: 'Add the recipe a friend taught you, and note who it came from.' },

  /* ---- explore: the day's {suggestion}, to read about and save. Never "try it". ---- */
  { id: 'explore-01', cat: 'explore', opens: 'drink', body: 'Meet {suggestion}. Its page has the recipe, the glass and where it comes from.' },
  { id: 'explore-02', cat: 'explore', opens: 'drink', body: '{suggestion} is in the Dex. Tap to read its story.' },
  { id: 'explore-03', cat: 'explore', opens: 'drink', needs: ['tastes'], body: 'Picked for your tastes: {suggestion}. See what goes into it.' },
  { id: 'explore-04', cat: 'explore', opens: 'drink', body: 'Ever read about {suggestion}? It is sitting in the Dex as a grey proof.' },
  { id: 'explore-05', cat: 'explore', opens: 'drink', body: "Today's pick from the Dex: {suggestion}. Save it if it sounds good." },
  { id: 'explore-06', cat: 'explore', opens: 'drink', body: "Here's one for your list: {suggestion}. Save it to look at later." },
  { id: 'explore-07', cat: 'explore', opens: 'drink', body: '{suggestion} has a story worth two minutes. Open its page.' },
  { id: 'explore-08', cat: 'explore', opens: 'drink', body: 'Curious about {suggestion}? The recipe and its history are one tap away.' },
  { id: 'explore-09', cat: 'explore', opens: 'drink', body: "From the Dex: {suggestion}. Read how it's made." },
  { id: 'explore-10', cat: 'explore', opens: 'drink', needs: ['tastes'], body: 'Going by what you like, {suggestion} is a good one to know.' },
  { id: 'explore-11', cat: 'explore', opens: 'drink', body: "{suggestion}: know it? If you've had it, log it. If not, read about it." },
  { id: 'explore-12', cat: 'explore', opens: 'drink', body: 'One drink, one story: {suggestion}.' },
  { id: 'explore-13', cat: 'explore', opens: 'drink', body: 'Add {suggestion} to your saved drinks and keep it for later.' },
  { id: 'explore-14', cat: 'explore', opens: 'drink', body: "{suggestion}: what's in it? Open its page and find out." },
  { id: 'explore-15', cat: 'explore', opens: 'drink', body: "A drink to look up: {suggestion}. Its page shows the glass it's served in." },
  { id: 'explore-16', cat: 'explore', opens: 'drink', needs: ['caught'], body: '{suggestion} is a good page to read if you like the drinks in your Dex.' },
  { id: 'explore-17', cat: 'explore', opens: 'drink', body: 'Learn one drink: {suggestion}. Its recipe, its origin and a fact worth sharing.' },
  { id: 'explore-18', cat: 'explore', opens: 'drink', needs: ['collections'], body: "Save {suggestion} to a collection, so it's there when you want it." },
  { id: 'explore-19', cat: 'explore', opens: 'drink', body: 'Seen {suggestion} in the Dex yet? Its page is worth a read.' },
  { id: 'explore-20', cat: 'explore', opens: 'drink', needs: ['tastes'], body: 'A match for your tastes: {suggestion}. Open its page.' },
  { id: 'explore-21', cat: 'explore', opens: 'drink', body: "{suggestion}: where it's from, what's in it, and how it got its name." },
  { id: 'explore-22', cat: 'explore', opens: 'drink', body: 'Pick of the day from the Dex: {suggestion}.' },
  { id: 'explore-23', cat: 'explore', opens: 'drink', body: 'A grey proof in your Dex: {suggestion}. Read up on it.' },
  { id: 'explore-24', cat: 'explore', opens: 'drink', body: '{suggestion} might be new to you. Its page has everything worth knowing.' },
  { id: 'explore-25', cat: 'explore', opens: 'drink', body: 'Wondering what {suggestion} is like? Its page has the tasting notes.' },
  { id: 'explore-26', cat: 'explore', opens: 'drink', body: 'Today in the Dex: {suggestion}.' },
  { id: 'explore-27', cat: 'explore', opens: 'drink', body: "Read {suggestion}'s page and save it if it's your kind of drink." },
  { id: 'explore-28', cat: 'explore', opens: 'drink', body: "Here's a drink with a story behind it: {suggestion}." },
  { id: 'explore-29', cat: 'explore', opens: 'drink', body: 'Is {suggestion} on your list? Save it with one tap.' },
  { id: 'explore-30', cat: 'explore', opens: 'drink', body: '{suggestion} is waiting in the Dex. Take a look.' },
  { id: 'explore-31', cat: 'explore', opens: 'drink', needs: ['tastes'], body: 'From your answers: {suggestion}. See why it made the list.' },
  { id: 'explore-32', cat: 'explore', opens: 'drink', body: 'Found in the Dex for you: {suggestion}. See its recipe.' },
  { id: 'explore-33', cat: 'explore', opens: 'drink', body: 'Read how {suggestion} is put together, step by step.' },
  { id: 'explore-34', cat: 'explore', opens: 'drink', body: '{suggestion}, on one page: the recipe, the glass, the garnish.' },

  /* ---- dex: browsing, filters, search, progress as a fact (never a target). ---- */
  { id: 'dex-01', cat: 'dex', opens: 'dex', needs: ['caught2'], body: '{caught} of {total} in your Dex. Browse the rest by flavour.' },
  { id: 'dex-02', cat: 'dex', opens: 'dex', body: 'Filter the Dex by flavour: fruity, sour, bitter and more.' },
  { id: 'dex-03', cat: 'dex', opens: 'dex', needs: ['tastes'], body: 'Your Dex opens with the drinks that fit your tastes first.' },
  { id: 'dex-04', cat: 'dex', opens: 'dex', body: 'Type a number in the Dex search to jump straight to that drink.' },
  { id: 'dex-05', cat: 'dex', opens: 'dex', body: 'Drag the number rail at the side of the Dex to jump anywhere in it.' },
  { id: 'dex-23', cat: 'dex', opens: 'dex', needs: ['caught'], body: 'Open a grey proof in the Dex and read where that drink comes from.' },
  { id: 'dex-07', cat: 'dex', opens: 'progress', needs: ['caught'], body: "Dex progress shows everything you've logged, with your latest at the top." },
  { id: 'dex-08', cat: 'dex', opens: 'dex', body: 'Search the Dex by country: cuba, japan or peru.' },
  { id: 'dex-09', cat: 'dex', opens: 'dex', body: 'The Dex has spirits as well as cocktails. Filter to spirits and browse the bottles.' },
  { id: 'dex-10', cat: 'dex', opens: 'dex', body: 'Only want cocktails? Use the filter on the Dex and see them on their own.' },
  { id: 'dex-11', cat: 'dex', opens: 'dex', needs: ['tastes'], body: 'Sort the Dex by number or by your tastes. Both are one tap away.' },
  { id: 'dex-12', cat: 'dex', opens: 'progress', needs: ['caught'], body: 'Your latest entry and your whole collection are together on Dex progress.' },
  { id: 'dex-13', cat: 'dex', opens: 'dex', body: "Every proof in the Dex has a full page, even before it's yours. Open any of them." },
  { id: 'dex-14', cat: 'dex', opens: 'dex', body: 'Search the Dex by style: tiki, sour, highball or spritz.' },
  { id: 'dex-15', cat: 'dex', opens: 'progress', needs: ['caught2'], body: '{caught} drinks in your Dex so far. See them all on Dex progress.' },
  { id: 'dex-16', cat: 'dex', opens: 'dex', body: 'Gin, rum, tequila, whiskey: filter the Dex by spirit and compare.' },
  { id: 'dex-17', cat: 'dex', opens: 'dex', body: 'The Dex has {total} drinks from all over the world. Pick a country and look.' },
  { id: 'dex-18', cat: 'dex', opens: 'dex', body: 'Bitter, creamy, fruity or sour: the Dex filters by flavour as well as by spirit.' },
  { id: 'dex-19', cat: 'dex', opens: 'dex', body: 'Filter the Dex to Not yet and read about the drinks still in grey.' },
  { id: 'dex-20', cat: 'dex', opens: 'dex', needs: ['caught2'], body: "Turn on the Logged filter to see only the drinks you've had, in one grid." },
  { id: 'dex-21', cat: 'dex', opens: 'dex', body: 'Every drink page shows its number in the Dex. Search that number any time.' },
  { id: 'dex-22', cat: 'dex', opens: 'dex', body: 'Scroll down the Dex and the search tucks away. Scroll up a little and it comes back.' },

  /* ---- saved: bookmarks and collections (023). ---- */
  { id: 'saved-01', cat: 'saved', opens: 'dex', body: 'Save drinks you want to remember with the bookmark on their page.' },
  { id: 'saved-02', cat: 'saved', opens: 'saved', needs: ['saved'], body: 'Your saved drinks and posts are all in the Saved tab.' },
  { id: 'saved-03', cat: 'saved', opens: 'saved', needs: ['collections', 'saved'], body: 'Make a collection: group saved drinks by flavour, by trip, by anything.' },
  { id: 'saved-04', cat: 'saved', opens: 'home', needs: ['collections', 'follows'], body: 'Hold the bookmark on any post to save it straight into a collection.' },
  { id: 'saved-05', cat: 'saved', opens: 'saved', needs: ['collections', 'saved'], body: 'Share a collection with a friend. They get a link with every drink in it.' },
  { id: 'saved-06', cat: 'saved', opens: 'saved', needs: ['collections'], body: 'Your collections are private until you share one.' },
  { id: 'saved-07', cat: 'saved', opens: 'saved', needs: ['collections', 'saved'], body: "Saved a friend's post? Put it in a collection so it's easy to find." },
  { id: 'saved-08', cat: 'saved', opens: 'saved', needs: ['collections'], body: 'A collection of recipes to make at home could be a good one to start.' },
  { id: 'saved-09', cat: 'saved', opens: 'saved', needs: ['collections', 'saved'], body: 'Sort your saved drinks into collections, and name them however you like.' },
  { id: 'saved-10', cat: 'saved', opens: 'home', needs: ['follows'], body: 'Saw a drink you liked in the feed? Tap the bookmark and it is saved.' },
  { id: 'saved-11', cat: 'saved', opens: 'saved', needs: ['account', 'saved'], body: 'Your saved drinks come with your account to a new phone.' },
  { id: 'saved-12', cat: 'saved', opens: 'saved', needs: ['collections', 'saved'], body: "A shared collection opens on the web too, for friends who don't have Sipply." },
  { id: 'saved-13', cat: 'saved', opens: 'saved', needs: ['collections'], body: 'Start a collection of drinks from one country.' },
  { id: 'saved-14', cat: 'saved', opens: 'dex', body: 'Keep a list of drinks to read about later. Save them as you browse the Dex.' },
  { id: 'saved-15', cat: 'saved', opens: 'home', needs: ['follows'], body: 'Save the drinks your friends post, and come back to their recipes.' },
  { id: 'saved-16', cat: 'saved', opens: 'saved', needs: ['collections', 'saved'], body: 'A collection of favourites makes a good link to share.' },
  { id: 'saved-17', cat: 'saved', opens: 'saved', needs: ['account'], body: 'Bookmarks on posts and on drinks both end up in Saved.' },
  { id: 'saved-18', cat: 'saved', opens: 'saved', needs: ['saved'], body: 'What you save is only for you. Nobody else sees it.' },

  /* ---- friends: following, invites, tags, likes. Signed in. ---- */
  { id: 'friends-01', cat: 'friends', opens: 'findFriends', needs: ['noFollows'], body: 'Find friends from your contacts. Numbers are scrambled on your phone first.' },
  { id: 'friends-02', cat: 'friends', opens: 'home', needs: ['follows'], body: 'See what the people you follow have posted lately.' },
  { id: 'friends-03', cat: 'friends', opens: 'findFriends', body: "Invite a friend with a link. You'll follow each other when they join." },
  { id: 'friends-04', cat: 'friends', opens: 'log', needs: ['tags', 'caught'], body: "Tag the friends you were with when you post. They'll see it in Activity." },
  { id: 'friends-05', cat: 'friends', opens: 'home', needs: ['follows'], body: "Like a friend's post and they'll see it in Activity." },
  { id: 'friends-06', cat: 'friends', opens: 'home', needs: ['follows'], body: "Your friends' stories from the last day are at the top of Home." },
  { id: 'friends-07', cat: 'friends', opens: 'findFriends', body: "Follow someone whose drinks you'd like to see on Home." },
  { id: 'friends-08', cat: 'friends', opens: 'findFriends', body: 'Bring your Instagram friends: Sipply can match them from a file Instagram sends you.' },
  { id: 'friends-09', cat: 'friends', opens: 'findFriends', body: 'Search for people on Sipply by name or username.' },
  { id: 'friends-10', cat: 'friends', opens: 'home', needs: ['follows'], body: "Catch up on Home. Your friends' newest posts are at the top." },
  { id: 'friends-11', cat: 'friends', opens: 'findFriends', needs: ['noFollows'], body: "Home fills up with the people you follow. Find someone you know." },
  { id: 'friends-12', cat: 'friends', opens: 'home', needs: ['follows'], body: "Save a friend's post to keep their drink for later." },
  { id: 'friends-13', cat: 'friends', opens: 'profile', body: 'Share your profile with a friend so they can follow you.' },
  { id: 'friends-14', cat: 'friends', opens: 'activity', needs: ['posted'], body: 'See who liked your posts in Activity.' },
  { id: 'friends-15', cat: 'friends', opens: 'home', needs: ['follows'], body: "Your friends' profiles show every drink they've posted." },
  { id: 'friends-16', cat: 'friends', opens: 'activity', needs: ['tags'], body: "When a friend tags you in a post, you'll find it in Activity." },
  { id: 'friends-17', cat: 'friends', opens: 'findFriends', body: "Know someone who'd like Sipply? Send them an invite link." },
  { id: 'friends-18', cat: 'friends', opens: 'activity', body: 'New followers show up in Activity, with a Follow back beside each one.' },
  { id: 'friends-19', cat: 'friends', opens: 'log', needs: ['tags', 'caught'], body: 'Post a drink and tag the people who were there with you.' },
  { id: 'friends-20', cat: 'friends', opens: 'profile', body: 'Your friends see your posts once they follow you. Share your profile with them.' },

  /* ---- know: plain facts, each one true and matching the drink's own page. ---- */
  { id: 'know-01', cat: 'know', opens: 'drink', drink: 'negroni', body: 'The Negroni is equal parts gin, Campari and sweet vermouth. Read its story.' },
  { id: 'know-02', cat: 'know', opens: 'drink', drink: 'daiquiri', body: 'The Daiquiri is named after a beach near Santiago de Cuba. Its page has the rest.' },
  { id: 'know-03', cat: 'know', opens: 'drink', drink: 'margarita', body: 'Margarita is Spanish for daisy, and the drink is a tequila daisy at heart.' },
  { id: 'know-04', cat: 'know', opens: 'drink', drink: 'paloma', body: 'Paloma means dove in Spanish. See what goes into one.' },
  { id: 'know-05', cat: 'know', opens: 'dex', body: 'Shaken or stirred? Drinks with citrus are usually shaken, and spirit-only ones stirred.' },
  { id: 'know-06', cat: 'know', opens: 'dex', body: 'A twist of peel is squeezed over the glass for its oils, not only for looks.' },
  { id: 'know-07', cat: 'know', opens: 'dex', body: 'Bourbon has to be made in the United States, from at least 51 percent corn.' },
  { id: 'know-08', cat: 'know', opens: 'dex', body: 'Tequila is made from blue agave. Mezcal can be made from many kinds of agave.' },
  { id: 'know-09', cat: 'know', opens: 'dex', body: 'Rum is made from sugarcane, from its fresh juice or from molasses.' },
  { id: 'know-10', cat: 'know', opens: 'dex', body: "Gin's main flavour comes from juniper. The rest is each distiller's choice." },
  { id: 'know-11', cat: 'know', opens: 'dex', body: 'Vermouth is a wine, so an open bottle keeps best in the fridge.' },
  { id: 'know-12', cat: 'know', opens: 'dex', body: 'Stirring with ice adds water, and that water is part of the recipe.' },
  { id: 'know-13', cat: 'know', opens: 'drink', drink: 'sazerac', body: 'The Sazerac is the official cocktail of New Orleans. Read how that happened.' },
  { id: 'know-14', cat: 'know', opens: 'drink', drink: 'french-75', body: 'The French 75 is named after a field gun from the First World War.' },
  { id: 'know-15', cat: 'know', opens: 'drink', drink: 'americano', body: 'The Americano comes from Milan, and it came before the Negroni.' },
  { id: 'know-16', cat: 'know', opens: 'dex', body: 'Whisky or whiskey? Scotland and Japan usually leave out the e. Ireland and the US usually keep it.' },
  { id: 'know-17', cat: 'know', opens: 'dex', body: 'Cognac is a brandy, made from grapes in one region of France.' },
  { id: 'know-18', cat: 'know', opens: 'dex', body: 'Angostura bitters were first made in Venezuela, in the town that gave them their name.' },
  { id: 'know-19', cat: 'know', opens: 'drink', drink: 'mojito', body: 'The Mojito comes from Havana. Its page has the mint, the lime and the history.' },
  { id: 'know-20', cat: 'know', opens: 'dex', body: 'Coupe, rocks or highball: every page in the Dex says which glass a drink is served in.' },

  /* ---- tastes: the first run's questions, for people who skipped them. ---- */
  { id: 'tastes-01', cat: 'tastes', opens: 'tastes', body: 'Tell Sipply what you like and your Dex puts those drinks first.' },
  { id: 'tastes-02', cat: 'tastes', opens: 'tastes', body: 'A few quick questions and the Dex sorts itself around your tastes.' },
  { id: 'tastes-03', cat: 'tastes', opens: 'tastes', body: 'Fruity, sour or bitter? Answer once and get picks that fit.' },
  { id: 'tastes-04', cat: 'tastes', opens: 'tastes', body: 'Which spirits do you like? Your answers shape your drink picks.' },
  { id: 'tastes-05', cat: 'tastes', opens: 'tastes', body: 'Your tastes are blank. Fill them in and the Dex starts with your kind of drinks.' },
  { id: 'tastes-06', cat: 'tastes', opens: 'tastes', body: 'Picks made for you start with a few questions in Settings.' },
];
