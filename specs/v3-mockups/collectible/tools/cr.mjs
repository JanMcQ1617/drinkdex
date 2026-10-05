const L=h=>{const n=parseInt(h.slice(1),16);return [n>>16,(n>>8)&255,n&255].map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[0.2126,0.7152,0.0722][i],0)};
const cr=(a,b)=>{const x=L(a),y=L(b);return ((Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)).toFixed(2)};
const blend=(fg,a,bg)=>{const f=parseInt(fg.slice(1),16),b=parseInt(bg.slice(1),16);const c=[16,8,0].map(s=>Math.round(((f>>s)&255)*a+((b>>s)&255)*(1-a)));return '#'+c.map(v=>v.toString(16).padStart(2,'0')).join('')};
const pairs=process.argv.slice(2);
for(let i=0;i<pairs.length;i+=2)console.log(pairs[i],'on',pairs[i+1],cr(pairs[i],pairs[i+1]));
export {cr,blend};
