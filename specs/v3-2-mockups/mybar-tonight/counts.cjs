const fs=require('fs');
const root='/Users/janmcqueeny/Projects/drinkdex-worktrees/polish';
const b=require(root+'/src/data/barIndex.json');
const drinks=require(root+'/src/data/drinks.json');
const byId=Object.fromEntries(drinks.map(d=>[d.id,d]));
const photos=new Set(fs.readdirSync(root+'/assets/drinks').map(f=>f.replace(/\.webp$/,'')));
const ING=Object.fromEntries(b.ingredients.map(i=>[i.id,i]));
const R=Object.fromEntries(b.recipes.map(r=>[r.id,r]));
function match(owned){
  const mk=[],nr=[];
  for(const r of b.recipes){ const d=byId[r.id]; if(!d) continue;
    const miss=[]; for(const s of r.slots){ if(s.some(id=>owned.has(id))) continue; miss.push(s[0]); if(miss.length>1)break;}
    if(!miss.length) mk.push(d); else if(miss.length===1) nr.push([d,miss[0]]);
  }
  const t=new Map(); for(const [,m] of nr) t.set(m,(t.get(m)||0)+1);
  const nb=[...t.entries()].sort((a,b)=>b[1]-a[1]||ING[a[0]].label.localeCompare(ING[b[0]].label)).slice(0,8);
  return {mk,nr,nb};
}
const starter=['gin','vodka','white-rum','bourbon','sweet-vermouth','dry-vermouth','lemon','lime','sugar-syrup','angostura-bitters','soda-water','orange','triple-sec','mint'];
const stocked=[...starter,'campari','tequila','egg-white','honey-syrup','rye-whiskey','ginger-beer'];
const show=(name,ids)=>{const o=new Set(ids);const r=match(o);console.log('\n==',name,ids.length,'makeable',r.mk.length,'nearly',r.nr.length);
 console.log('nextBest',r.nb.map(([id,n])=>`${ING[id].label}(${n})`).join(', '));
 const sc={};for(const d of r.mk) sc[d.subcategory]=(sc[d.subcategory]||0)+1; console.log('subcats',JSON.stringify(sc));
 return r;};
show('starter',starter);
const rs=show('stocked',stocked);
// grenadine unlocks
const gren=rs.nr.filter(([d,m])=>m==='grenadine').map(([d])=>d.id+(photos.has(d.id)?'*':''));
console.log('grenadine unlocks',gren.join(', '));
for(const [id] of rs.nb){ console.log(' ',ING[id].label,'->',rs.nr.filter(([d,m])=>m===id).map(([d])=>d.name+(photos.has(d.id)?'*':'')).join(', '));}
show('stocked+grenadine',[...stocked,'grenadine']);
// picker states
const pick=['gin','vodka','white-rum','bourbon','sweet-vermouth','lemon','lime','mint','sugar-syrup','soda-water','angostura-bitters'];
const a=show('picker before campari',pick); const p2=show('picker after campari',[...pick,'campari']);
// ingredient uses
for(const id of ['gin','vodka','white-rum','bourbon','tequila','rye-whiskey','dark-rum','scotch-whisky','cognac','campari','triple-sec','sweet-vermouth','dry-vermouth','grenadine','coffee-liqueur','lemon','lime','orange','mint','egg-white','sugar-syrup','honey-syrup','soda-water','ginger-beer','angostura-bitters','tonic-water','cola','maraschino-liqueur','absinthe','grapefruit','ginger-ale','brandy','aperol','prosecco','champagne'])
  console.log(id, ING[id]?`${ING[id].label} ${ING[id].category} uses=${ING[id].uses}`:'MISSING');
// hero drinks info
for(const id of ['negroni','whiskey-sour','daiquiri','old-fashioned','martini','mojito','margarita','manhattan','tom-collins','gin-fizz','bees-knees','gold-rush','boulevardier','moscow-mule','americano','tequila-sunrise','ward-8','jack-rose','mint-julep']){
  const d=byId[id]; const r=R[id]; console.log(id,'#'+d.dexNumber,d.subcategory,'|',d.glassware,'|',r?r.slots.map(s=>ING[s[0]]?.label).join(', '):'-', '| makeable', rs.mk.includes(d));
}
console.log('\n######## picker');
function tally(ids){const o=new Set(ids);const r=match(o);const t=new Map();for(const [,m] of r.nr)t.set(m,(t.get(m)||0)+1);return {r,t};}
const pk=['gin','sweet-vermouth','white-rum','vodka','lemon','lime','orange','mint','sugar-syrup','soda-water','angostura-bitters'];
const A=tally(pk), B=tally([...pk,'rye-whiskey']);
console.log('before rye',A.r.mk.length,'after',B.r.mk.length);
for(const id of ['gin','sweet-vermouth','white-rum','vodka','rye-whiskey','brandy','maraschino-liqueur','absinthe','triple-sec','bourbon','dark-rum','tequila','campari','scotch-whisky','cognac','dry-vermouth'])
  console.log(' ',id,'+',B.t.get(id)||0, '(uses',ING[id].uses+')');
console.log('rye newly makeable:',B.r.mk.filter(d=>!A.r.mk.includes(d)).map(d=>d.name+(photos.has(d.id)?'*':'')).join(', '));
console.log('\n######## after grenadine');
const G=tally([...stocked,'grenadine']);
for(const id of ['absinthe','grapefruit','ginger-ale','maraschino-liqueur','scotch-whisky','brandy','applejack','apricot-brandy','champagne'])
  console.log(' ',ING[id]?.label,G.t.get(id),'->',G.r.nr.filter(([d,m])=>m===id).map(([d])=>d.name+(photos.has(d.id)?'*':'')).join(', '));
const S=tally(stocked);
console.log('new from grenadine:',G.r.mk.filter(d=>!S.r.mk.includes(d)).map(d=>d.id+'#'+d.dexNumber+' '+d.subcategory+' '+d.glassware).join(' | '));
for(const id of ['monkey-gland','waldorf','horses-neck','rob-roy','greyhound','gin-daisy','bacardi-cocktail','tequila-sunrise','ward-8']){const d=byId[id]; if(d) console.log(id,'#'+d.dexNumber,d.subcategory,'|',d.glassware, '|color?', JSON.stringify(d.color||d.liquid||d.hue||null));}
console.log(Object.keys(byId['waldorf']||{}).join(','));
console.log('\n######## full-slot credit');
function fullTally(ids){const o=new Set(ids);const t=new Map();let mk=0;
 for(const r of b.recipes){ if(!byId[r.id]) continue; const miss=[]; for(const s of r.slots){ if(s.some(id=>o.has(id))) continue; miss.push(s); if(miss.length>1)break;}
  if(!miss.length) mk++; else if(miss.length===1) for(const id of new Set(miss[0])) t.set(id,(t.get(id)||0)+1);}
 return {mk,t};}
const P=fullTally([...pk,'rye-whiskey']);
console.log('mk',P.mk);
for(const id of ['brandy','maraschino-liqueur','absinthe','triple-sec','bourbon','dark-rum','tequila','campari','scotch-whisky','cognac','dry-vermouth'])
  console.log(' ',id,'+',P.t.get(id)||0);
const P0=fullTally(pk); console.log('rye credit before rye (full):',P0.t.get('rye-whiskey'), 'bourbon', P0.t.get('bourbon'));
// verify: actual delta by brute force for a few
for(const id of ['brandy','triple-sec','bourbon','scotch-whisky','campari','absinthe','maraschino-liqueur','tequila','dark-rum']){ const x=fullTally([...pk,'rye-whiskey',id]).mk; console.log('  brute',id,x-P.mk);}
console.log('\n######## headlines (photo first, then lowest dex)');
function heads(ids){const o=new Set(ids);const r=match(o);
 for(const [id,n] of r.nb){ const ds=r.nr.filter(([d,m])=>m===id).map(([d])=>d).sort((a,b)=>(photos.has(b.id)-photos.has(a.id))||a.dexNumber-b.dexNumber);
  console.log(' ',ING[id].label,n,'->',ds.slice(0,5).map(d=>d.name+'#'+d.dexNumber+(photos.has(d.id)?'*':'')+'['+d.glassware+']').join(', '));}}
heads(stocked); console.log('--- after grenadine'); heads([...stocked,'grenadine']);
const S2=match(new Set(stocked)); const G2=match(new Set([...stocked,'grenadine']));
console.log('grenadine adds sorted:',G2.mk.filter(d=>!S2.mk.includes(d)).sort((a,b)=>(photos.has(b.id)-photos.has(a.id))||a.dexNumber-b.dexNumber).map(d=>d.name+'#'+d.dexNumber+'['+d.glassware+']').join(', '));
const sh=match(new Set(stocked)).mk.sort((a,b)=>(photos.has(b.id)-photos.has(a.id))||a.dexNumber-b.dexNumber).slice(0,12).map(d=>d.name+'#'+d.dexNumber); console.log('hero by dex:',sh.join(', '));
for(const id of ['monkey-gland','waldorf','horses-neck','gin-daisy','whiskey-daisy','bacardi-cocktail','rob-roy']){const d=byId[id]; if(d) console.log(id, d.tastingNotes, d.description.slice(0,90));}
console.log('\n######## after grapefruit');
heads([...stocked,'grapefruit']);
const S3=match(new Set(stocked)); const G3=match(new Set([...stocked,'grapefruit']));
console.log('mk',G3.mk.length,'adds:',G3.mk.filter(d=>!S3.mk.includes(d)).sort((a,b)=>(photos.has(b.id)-photos.has(a.id))||a.dexNumber-b.dexNumber).map(d=>d.name+'#'+d.dexNumber+'['+d.glassware+'] '+d.subcategory).join(', '));
for(const id of ['salty-dog','siesta','nevada','brown-derby']){const d=byId[id]; console.log(id,d.tastingNotes.join('/'),'|',d.description.slice(0,80));}
// triple sec photographed users in set
console.log('triple sec users w/ photo:', b.recipes.filter(r=>r.slots.some(s=>s.includes('triple-sec'))&&photos.has(r.id)).map(r=>r.id+'#'+byId[r.id]?.dexNumber).join(', '));
console.log('maraschino users w/ photo:', b.recipes.filter(r=>r.slots.some(s=>s.includes('maraschino-liqueur'))&&photos.has(r.id)).map(r=>r.id+'#'+byId[r.id]?.dexNumber).join(', '));
console.log('absinthe users w/ photo:', b.recipes.filter(r=>r.slots.some(s=>s.includes('absinthe'))&&photos.has(r.id)).map(r=>r.id+'#'+byId[r.id]?.dexNumber).join(', '));
console.log('brandy users w/ photo:', b.recipes.filter(r=>r.slots.some(s=>s.includes('brandy'))&&photos.has(r.id)).map(r=>r.id+'#'+byId[r.id]?.dexNumber).join(', '));
console.log('rye users w/ photo:', b.recipes.filter(r=>r.slots.some(s=>s.includes('rye-whiskey'))&&photos.has(r.id)).map(r=>r.id+'#'+byId[r.id]?.dexNumber).join(', '));
console.log('gin users w/ photo:', b.recipes.filter(r=>r.slots.some(s=>s.includes('gin'))&&photos.has(r.id)).map(r=>r.id+'#'+byId[r.id]?.dexNumber).slice(0,12).join(', '));
console.log('vodka users w/ photo:', b.recipes.filter(r=>r.slots.some(s=>s.includes('vodka'))&&photos.has(r.id)).map(r=>r.id+'#'+byId[r.id]?.dexNumber).slice(0,12).join(', '));
console.log('white-rum users w/ photo:', b.recipes.filter(r=>r.slots.some(s=>s.includes('white-rum'))&&photos.has(r.id)).map(r=>r.id+'#'+byId[r.id]?.dexNumber).slice(0,12).join(', '));
