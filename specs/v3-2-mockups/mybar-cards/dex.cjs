const root='/Users/janmcqueeny/Projects/drinkdex-worktrees/polish';
const b=require(root+'/src/data/barIndex.json');const drinks=require(root+'/src/data/drinks.json');const fs=require('fs');
const photos=new Set(fs.readdirSync(root+'/assets/drinks').filter(f=>f.endsWith('.webp')).map(f=>f.replace('.webp','')));
const byId=Object.fromEntries(drinks.map(d=>[d.id,d]));const ING=Object.fromEntries(b.ingredients.map(i=>[i.id,i]));
const owned=new Set('gin lemon lime sugar-syrup white-rum sweet-vermouth angostura-bitters bourbon soda-water orange dry-vermouth campari triple-sec mint tonic-water ginger-beer egg-white'.split(' '));
const mk=[],nr=[];for(const r of b.recipes){const d=byId[r.id];if(!d)continue;const miss=[];for(const s of r.slots){if(s.some(i=>owned.has(i)))continue;miss.push(s[0]);if(miss.length>1)break;}if(!miss.length)mk.push(d);else if(miss.length==1)nr.push({d,m:miss[0]});}
const fmt=d=>`${d.name}#${d.dexNumber}${photos.has(d.id)?'*':''}[${d.glassware}]`;
mk.sort((a,c)=>a.dexNumber-c.dexNumber);console.log('MAKE',mk.length,mk.slice(0,16).map(fmt).join(', '));
for(const id of ['vodka','scotch-whisky','absinthe','brandy']){const l=nr.filter(n=>n.m===id).map(n=>n.d).sort((a,c)=>a.dexNumber-c.dexNumber);console.log(id,l.length,l.map(fmt).join(', '));}
const subs={};for(const d of mk){(subs[d.subcategory]=subs[d.subcategory]||[]).push(d)}
for(const [k,v] of Object.entries(subs))console.log('SUB',k,v.length,v.slice(0,5).map(fmt).join(', '));
// round robin by subcategory in dex order of each group's lead
const groups=Object.values(subs).sort((a,c)=>a[0].dexNumber-c[0].dexNumber);const rr=[];for(let i=0;rr.length<mk.length;i++)for(const g of groups)if(g[i])rr.push(g[i]);
console.log('RR',rr.slice(0,12).map(fmt).join(', '));
