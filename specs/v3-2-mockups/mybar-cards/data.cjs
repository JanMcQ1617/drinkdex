const root='/Users/janmcqueeny/Projects/drinkdex-worktrees/polish';
const b=require(root+'/src/data/barIndex.json');
const drinks=require(root+'/src/data/drinks.json');
const fs=require('fs');
const photos=new Set(fs.readdirSync(root+'/assets/drinks').filter(f=>f.endsWith('.webp')).map(f=>f.replace('.webp','')));
const byId=Object.fromEntries(drinks.map(d=>[d.id,d]));
const ING=Object.fromEntries(b.ingredients.map(i=>[i.id,i]));
const recipes=b.recipes.filter(r=>byId[r.id]).map(r=>({r,d:byId[r.id]})).sort((a,c)=>a.d.name.localeCompare(c.d.name));
function match(owned){owned=new Set(owned);const mk=[],nr=[];
 for(const {r,d} of recipes){const miss=[];for(const s of r.slots){if(s.some(id=>owned.has(id)))continue;miss.push(s[0]);if(miss.length>1)break;}
  if(!miss.length)mk.push(d);else if(miss.length===1)nr.push({d,miss:miss[0]});}
 const t=new Map();for(const n of nr)t.set(n.miss,(t.get(n.miss)||0)+1);
 const nb=[...t].map(([id,u])=>({id,label:ING[id]?.label,u,drinks:nr.filter(n=>n.miss===id).map(n=>n.d)})).filter(x=>x.label).sort((a,c)=>c.u-a.u||a.label.localeCompare(c.label)).slice(0,8);
 return {mk,nr,nb};}
function inDrinks(id){return recipes.filter(({r})=>r.slots.some(s=>s.includes(id)))}
const arg=process.argv[2];
if(arg==='in'){for(const id of process.argv.slice(3)){const ds=inDrinks(id);console.log(id,ING[id]?.label,ds.length,'| photo:',ds.filter(x=>photos.has(x.d.id)).map(x=>x.d.name).slice(0,12).join(', '));}}
else{const owned=process.argv.slice(2);const m=match(owned);
 console.log('owned',owned.length,'makeable',m.mk.length,'nearly',m.nr.length);
 console.log('MAKE w/photo:',m.mk.filter(d=>photos.has(d.id)).map(d=>d.name).join(', '));
 console.log('MAKE all:',m.mk.map(d=>d.name).join(', '));
 for(const x of m.nb)console.log('NEXT',x.label,x.u,'|',x.drinks.filter(d=>photos.has(d.id)).map(d=>d.name).join(', '),'||',x.drinks.map(d=>d.name).slice(0,8).join(', '));}
