// Contrast audit for the After hours tokens (WCAG 2.x relative luminance).
const L = (h) => { const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4); return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]; };
const mix = (fg, a, bg) => '#'+[1,3,5].map(i=>Math.round(parseInt(fg.slice(i,i+2),16)*a+parseInt(bg.slice(i,i+2),16)*(1-a)).toString(16).padStart(2,'0')).join('');
const cr = (a,b) => { const x=L(a), y=L(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); };
const T = {
  night:'#140E0D', nightRaised:'#201817', nightSunk:'#0D0909', backbar:'#3E0A12', backbarLow:'#2C0810',
  nightEdge:'#3B302D', nightEdgeControl:'#857A71',
  ink:'#F2EBE1', inkMuted:'#ADA298', inkFaint:'#857A71',
  wine:'#5B0F1A', wineSoft:'#A85A63', wineLit:'#E08A95', ember:'#D25366',
  gilt:'#B08A3E', giltLit:'#D4B06A', taupe:'#CBBBA5',
  paper:'#F7F2EA', paperInk:'#2B2322', paperMuted:'#6A6058', lineControl:'#8A7F74', white:'#FFFFFF', giltInk:'#7D5F1C', taupeInk:'#736247',
  scrimOverWhite: mix('#0E0B0B',0.78,'#FFFFFF'), scrimOverWhite62: mix('#0E0B0B',0.62,'#FFFFFF'),
  tabBar:'#241C1B', wineWash:'#F5E7E7',
};
const pairs = [
  ['ink','night',4.5],['inkMuted','night',4.5],['inkFaint','night',3],['inkMuted','nightRaised',4.5],['inkFaint','nightRaised',3],
  ['ink','backbar',4.5],['inkMuted','backbar',4.5],['ink','backbarLow',4.5],['wineLit','backbar',3],
  ['taupe','night',4.5],['wineLit','night',4.5],['ember','night',3],['giltLit','night',4.5],['gilt','night',3],['wineSoft','night',3],
  ['nightEdgeControl','night',3],['nightEdgeControl','nightRaised',3],['nightEdge','night',1],
  ['ink','wine',4.5],['wineSoft','night',3],
  ['ink','scrimOverWhite',4.5],['taupe','scrimOverWhite',4.5],['wineLit','scrimOverWhite',4.5],['giltLit','scrimOverWhite',4.5],['inkMuted','scrimOverWhite',4.5],
  ['ink','tabBar',4.5],['inkMuted','tabBar',4.5],
  ['paperInk','paper',4.5],['paperMuted','paper',4.5],['taupeInk','paper',4.5],['giltInk','paper',4.5],['wine','paper',4.5],['lineControl','paper',3],['paperMuted','white',4.5],
  ['paper','night',3],
  ['paperInk','gilt',4.5],['wine','wineWash',4.5],['giltLit','backbar',4.5],['taupe','backbar',4.5],['inkMuted','backbarLow',4.5],['wine','paper',4.5],['giltInk','paper',4.5],
];
for (const [f,b,min] of pairs) { const r=cr(T[f],T[b]); console.log((r>=min?'ok  ':'FAIL')+' '+f.padEnd(17)+' on '+b.padEnd(15)+r.toFixed(2)+':1  (need '+min+')'); }
console.log('scrim over white =', T.scrimOverWhite);
