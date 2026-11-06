const EYE={rx:23.5, ry:40.5, cx:27.5, cy:-4.5, tilt:0.157};
const EYE_HALFW=Math.hypot(EYE.rx*Math.cos(EYE.tilt),EYE.ry*Math.sin(EYE.tilt));   // half the width of one leaning eye
/* pupils morph smoothly between shapes — all flat, solid colour:
     slit · circle · dot · big (huge circles) · small · heart · star
   w/h = half-size, r = lean (mirrored per eye), dx = toward the nose, dy = down, hr = heart-ness, st = star-ness */
const PUP={
  slit:   {w:3.05, h:12,   r:.14, dx:15, dy:.5},
  circle: {w:7.5,  h:7.5,  dx:11, dy:1},
  dot:    {w:2.9,  h:2.9,  dx:12, dy:0},
  big:    {w:13.5, h:13.5, dx:6,  dy:2},
  small:  {w:5,    h:5,    dx:11, dy:0},
  peek:   {w:3.05, h:12,   r:.14, dx:14, dy:2},     // half-lidded: slits tucked up under the lid
  joy:    {w:11,   h:11,   dx:8,  dy:-6},           // happy squint: big circles peeking over the lower lid
  heart:  {w:11,   h:11,   dx:7,  dy:1,  hr:1},
  star:   {w:15,   h:15,   dx:6,  dy:1,  st:1},          // (big enough to read at a glance, in the notch too)
  plead:  {w:12,   h:13,   dx:6,  dy:3},            // big, a little low: puppy eyes
  odd:    {w:[3,6],h:[3,6],dx:11, dy:0},            // confused: one small, one bigger
};
const PUP_KEYS=['w','h','r','dx','dy','hr','st'];
for(const k in PUP) for(const e of PUP_KEYS) if(PUP[k][e]==null) PUP[k][e]=0;
const PUP_STYLES=['slit','circle','dot'];   // the resting look is a setting
/* moods. gaze/fx are handled in frame(); arrays are [left, right] */
const MOODS={
  idle:      {pu:'rest'},
  listening: {sz:1.04, tilt:-3, pu:'big'},
  thinking:  {top:[.1,.04], sl:[-.1,.1], tilt:4, pu:'small'},
  reading:   {top:.16, bot:.06, pu:'circle'},                          // eyes sweeping along lines
  editing:   {top:.3, sl:.12, bot:.12, sz:.98, pu:'slit'},              // squinting, concentrating
  running:   {top:.08, sz:1.02, tilt:-2, pu:'circle'},                  // watching the terminal
  searching: {sz:1.03, pu:'small'},                                     // darting all over
  looking:   {sz:1.05, pu:'circle'},                                    // studying your screenshot
  pleading:  {top:.14, sl:-.32, sz:1.03, tilt:-4, pu:'plead'},          // "can I?" puppy eyes
  talking:   {pu:'circle'},
  worried:   {top:.1, sl:-.28, bot:.08, sz:.98, tilt:-2, pu:'small'},     // an agent holds the desktop (not t_: that would count as talking)
  // talking faces — picked from what he's saying, one per sentence (see talkSentence). Gentle: no confetti or flashes.
  t_explain: {es:1.02, pu:'circle'},                                     // just explaining
  t_happy:   {bot:.3, bow:.06, sz:1.02, pu:'circle'},                     // good news: smiling eyes
  t_beam:    {shut:1, cup:1, sz:1.04, pu:'circle'},                       // "^ ^" — proud of it ("done", "fixed", "all tests pass")
  t_excited: {sz:1.06, es:1.05, pu:'big'},                                // wide-eyed
  t_curious: {top:[0,.14], sl:[0,.1], es:[1.06,.95], pu:'circle'},        // asking you something: one brow up
  t_unsure:  {top:[.06,.2], sl:[.1,.16], es:[.97,1.03], pu:'small'},      // "hmm, maybe…"
  t_sorry:   {top:.18, sl:-.38, bot:.08, es:.97, pu:'plead'},             // apologetic
  t_serious: {top:.24, sl:.14, sq:.95, pu:'small'},                       // careful / bad news / important
  t_warm:    {bot:.2, bow:.12, es:1.02, pu:'circle'},                     // kind, gentle
  t_think:   {top:[.08,.02], sl:[-.08,.08], pu:'small'},                  // working it out as he talks
  t_surprised:{sz:1.06, es:1.06, pu:'dot'},                               // "oh!"
  happy:     {bot:.46, bow:.08, sz:1.02, pu:'joy'},
  excited:   {sz:1.08, pu:'star'},
  love:      {bot:.28, bow:.4, sz:1.04, pu:'heart'},
  wink:      {shut:[0,1], bot:[.2,0], bow:.3, tilt:-5, pu:'circle'},
  curious:   {top:[0,.18], sl:[0,.1], es:[1.07,.94], tilt:-7, pu:'circle'},
  surprised: {sz:1.07, pu:'dot'},
  confused:  {top:[0,.3], sl:[0,.25], es:[1.06,.88], tilt:8, pu:'odd'},
  error:     {top:.34, sl:-.4, sz:.98, tilt:-5, pu:'dot'},
  annoyed:   {top:.55, sl:.03, sq:.88, sz:.92, tilt:3, pu:'peek'},
  sleepy:    {shut:1, tilt:3, pu:'rest'},   // shut: just the "‿ ‿" arcs
  joy:       {shut:1, cup:1, sz:1.04, tilt:-4, pu:'circle'},             // "^ ^" — beaming
  sad:       {top:.24, sl:-.55, bot:.12, bow:.3, es:.96, tilt:-6, pu:'plead'},  // droopy, a tear rolls down
  scared:    {es:1.1, sq:1.03, sz:1.06, tilt:2, pu:'dot'},             // huge round eyes, trembling little pupils
  bored:     {top:.44, sq:.94, tilt:5, pu:'small'},                     // half-lidded, glancing away
  shy:       {bot:.34, bow:.45, es:[1,.97], tilt:-8, pu:'circle'},       // bashful, looking down
  purr:      {shut:1, cup:1, sz:1.03, tilt:-6, pu:'circle'},             // being petted: "^ ^"
};

const lerp=(a,b,t)=>a+(b-a)*t, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function eyePts(sc,L,side){
  const {top,sl,tc,bot,bow,sq,shut}=L, N=72, rt=-side*EYE.tilt*(1-shut), c=Math.cos(rt), s=Math.sin(rt), pts=[];
  let y0=1e9,y1=-1e9,x0=1e9,x1=-1e9;
  for(let i=0;i<N;i++){ const a=i/N*Math.PI*2, u=Math.cos(a), v=Math.sin(a), ex=u*EYE.rx*sc, ey=v*EYE.ry*sc*sq;
    let x=ex*c-ey*s, y=ex*s+ey*c;
    if(shut>.001){ const w=Math.sqrt(1-u*u);                 // closed: flat in the middle, ends curling up, tapering to points
      const down=12-4*u*u-3*(1-w), up=-(12-4*u*u-3*(1-w))+6, cup=L.cup||0;   // "‿" asleep … "^" beaming
      x=lerp(x,u*21*sc,shut); y=lerp(y,(lerp(down,up,cup)+lerp(1.45,2.6,cup)*v)*sc,shut); }
    pts.push([x,y]); y0=Math.min(y0,y); y1=Math.max(y1,y); x0=Math.min(x0,x); x1=Math.max(x1,x); }
  if(top<=0.001 && bot<=0.001 && tc<=0.001) return pts;
  const H=y1-y0, hw=(x1-x0)/2, mx=(x0+x1)/2;
  return pts.map(([x,y])=>{ const u=clamp((x-mx)/hw,-1,1), inner=-side*u;
    const tY=y0+top*H+sl*(H/2)*inner+tc*H*(1-u*u);
    const bY=y1-bot*H*((1-bow)+bow*1.1*Math.sqrt(Math.max(0,1-u*u)));
    y=Math.max(y,tY); y=Math.min(y,bY); if(tY>bY) y=(tY+bY)/2; return [x,y]; });
}
// pupil outline: an ellipse that can melt into a heart (hr) or a four-point star (st)
function pupilPts(rx,ry,rot,hr,st,N=48){ const c=Math.cos(rot),s=Math.sin(rot),o=[], e=1-hr-st;
  for(let i=0;i<N;i++){ const a=i/N*Math.PI*2, ca=Math.cos(a), sa=Math.sin(a);
    let x=ca*e, y=sa*e;
    if(hr>0){ const t=a+Math.PI/2, sn=Math.sin(t);
      x+=hr*16*sn*sn*sn/15; y+=hr*(-(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))/15+.12); }
    if(st>0){ x+=st*Math.sign(ca)*Math.pow(Math.abs(ca),2.4)*1.12; y+=st*Math.sign(sa)*Math.pow(Math.abs(sa),2.4)*1.12; }
    x*=rx; y*=ry; o.push([x*c-y*s,x*s+y*c]); } return o; }
