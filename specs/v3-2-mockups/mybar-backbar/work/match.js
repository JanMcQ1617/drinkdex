const R='/Users/janmcqueeny/Projects/drinkdex-worktrees/polish';
const idx=require(R+'/src/data/barIndex.json');
const drinks=require(R+'/src/data/drinks.json');
const fs=require('fs');
const photos=new Set(fs.readdirSync(R+'/assets/drinks').filter(f=>f.endsWith('.webp')).map(f=>f.replace('.webp','')));
const BY=Object.fromEntries(drinks.map(d=>[d.id,d]));
const ING=Object.fromEntries(idx.ingredients.map(i=>[i.id,i]));
const recs=idx.recipes.filter(r=>BY[r.id]).map(r=>({r,d:BY[r.id]})).sort((a,b)=>a.d.name.localeCompare(b.d.name));
function match(owned){const mk=[],nr=[];for(const {r,d} of recs){const miss=[];for(const s of r.slots){if(s.some(x=>owned.has(x)))continue;miss.push(s[0]);if(miss.length>1)break}if(!miss.length)mk.push(d);else if(miss.length===1)nr.push({d,m:miss[0]})}
const t=new Map();for(const n of nr)t.set(n.m,(t.get(n.m)||0)+1);const nb=[...t.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8);return {mk,nr,nb}}
const shelves={
 starter:['gin','vodka','white-rum','bourbon','sweet-vermouth','dry-vermouth','lemon','lime','sugar-syrup','angostura-bitters','soda-water','orange','triple-sec','mint'],
 stocked:process.argv.slice(2).length?process.argv.slice(2):['gin','bourbon','rye-whiskey','white-rum','campari','sweet-vermouth','dry-vermouth','angostura-bitters','lemon','lime','sugar-syrup','soda-water','orange','mint','triple-sec','tequila'],
};
for(const [k,s] of Object.entries(shelves)){
 const missing=s.filter(x=>!ING[x]); if(missing.length)console.log('BAD',missing);
 const o=new Set(s);const {mk,nr,nb}=match(o);
 console.log('\n==',k,s.length,'makeable',mk.length,'nearly',nr.length);
 console.log('MAKE:',mk.map(d=>d.name+(photos.has(d.id)?'*':'')).join(', '));
 console.log('NB:',nb.map(([i,n])=>ING[i].label+' +'+n).join(', '));
 console.log('NEAR w/photo:',nr.filter(n=>photos.has(n.d.id)).map(n=>n.d.name+' <'+ING[n.m].label+'>').join(', '));
}
