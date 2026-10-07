const R='/Users/janmcqueeny/Projects/drinkdex-worktrees/polish';
const idx=require(R+'/src/data/barIndex.json');
const drinks=require(R+'/src/data/drinks.json');
const fs=require('fs');
const photos=new Set(fs.readdirSync(R+'/assets/drinks').filter(f=>f.endsWith('.webp')).map(f=>f.replace('.webp','')));
const BY=Object.fromEntries(drinks.map(d=>[d.id,d]));
const ING=Object.fromEntries(idx.ingredients.map(i=>[i.id,i]));
const recs=idx.recipes.filter(r=>BY[r.id]).map(r=>({r,d:BY[r.id]})).sort((a,b)=>a.d.name.localeCompare(b.d.name));
function match(owned){const mk=[],nr=[];for(const {r,d} of recs){const miss=[];for(const s of r.slots){if(s.some(x=>owned.has(x)))continue;miss.push(s[0]);if(miss.length>1)break}if(!miss.length)mk.push(d);else if(miss.length===1)nr.push({d,m:miss[0]})}return {mk,nr}}
const stocked=['gin','bourbon','rye-whiskey','white-rum','tequila','campari','sweet-vermouth','dry-vermouth','triple-sec','angostura-bitters','sugar-syrup','lemon','lime','orange','mint','soda-water'];
const without=new Set(stocked.filter(x=>x!=='campari'));
const a=match(without), b=match(new Set(stocked));
const before=new Set(a.mk.map(d=>d.id));
console.log('without campari',a.mk.length,'with',b.mk.length);
console.log('NEW:',b.mk.filter(d=>!before.has(d.id)).map(d=>d.name+(photos.has(d.id)?'*':'')+' ['+d.ingredients.join(', ')+']').join('\n'));
const g={};for(const n of b.nr){(g[n.m]=g[n.m]||[]).push(n.d)}
const groups=Object.entries(g).sort((x,y)=>y[1].length-x[1].length).slice(0,10);
for(const [m,ds] of groups){console.log('\n'+ING[m].label+' ('+ING[m].category+') +'+ds.length+': '+ds.map(d=>d.name+(photos.has(d.id)?'*':'')).join(', '))}
console.log('\nnearly total',b.nr.length);
// recipe slots for a few
for(const id of ['negroni','manhattan','whiskey-sour','tequila-sunrise','ward-8','kamikaze','screwdriver','greyhound','paloma','bees-knees']){const r=idx.recipes.find(r=>r.id===id);console.log(id, r&&JSON.stringify(r.slots.map(s=>s.slice(0,3))))}
