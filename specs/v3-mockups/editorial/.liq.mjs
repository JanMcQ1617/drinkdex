import { liquidColor, LIQUID } from './.liquid.mts';
import { readFileSync } from 'node:fs';
const d = JSON.parse(readFileSync('/Users/janmcqueeny/Projects/drinkdex-worktrees/polish/src/data/drinks.json','utf8'));
const inv = Object.fromEntries(Object.entries(LIQUID).map(([k,v])=>[v,k]));
const ids = process.argv.slice(2);
for (const id of ids){ const x=d.find(a=>a.id===id); const c=liquidColor(x); console.log(id, c, inv[c]); }
const counts={}; for(const x of d){const k=inv[liquidColor(x)]; counts[k]=(counts[k]||0)+1}; console.log(JSON.stringify(counts));
