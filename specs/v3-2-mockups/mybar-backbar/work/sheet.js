const R='/Users/janmcqueeny/Projects/drinkdex-worktrees/polish';
const idx=require(R+'/src/data/barIndex.json');
const drinks=require(R+'/src/data/drinks.json');
const BY=Object.fromEntries(drinks.map(d=>[d.id,d]));
const ING=Object.fromEntries(idx.ingredients.map(i=>[i.id,i]));
const recs=idx.recipes.filter(r=>BY[r.id]);
const stocked=new Set(['gin','bourbon','rye-whiskey','white-rum','tequila','campari','sweet-vermouth','dry-vermouth','triple-sec','angostura-bitters','sugar-syrup','lemon','lime','orange','mint','soda-water']);
const t=new Map();
for(const r of recs){const miss=[];for(const s of r.slots){if(s.some(x=>stocked.has(x)))continue;miss.push(s[0]);if(miss.length>1)break}if(miss.length===1)t.set(miss[0],(t.get(miss[0])||0)+1)}
// how many recipes use each ingredient (in index)
for (const cat of ['liqueur','spirit','wine']){
const list=idx.ingredients.filter(i=>i.category===cat&&i.uses>=3).map(i=>({l:i.label,id:i.id,u:i.uses,n:t.get(i.id)||0,own:stocked.has(i.id)})).sort((a,b)=>(b.own-a.own)||b.n-a.n||b.u-a.u);
console.log('\n'+cat+':',list.slice(0,14).map(x=>`${x.l}${x.own?'[on]':''} +${x.n} (in ${x.u})`).join(' | '));
}
console.log(idx.ingredients.length, idx.ingredients.filter(i=>i.uses>=3).length);
