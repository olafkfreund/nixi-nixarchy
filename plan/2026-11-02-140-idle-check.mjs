// #140 step 5: page checks in a CPU-only headless Chromium (never the user's Chrome).
// node idle-test.mjs <cdp-port> <page-url> <shot-prefix>
import { writeFileSync } from "node:fs";
const [port, url, shot] = process.argv.slice(2);
const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r, { once: true }));
let id = 0; const pend = new Map();
ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ev = async js => { const r = await send("Runtime.evaluate", { expression: `(async()=>{${js}})()`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result?.result?.value; };
const snap = async name => { const s = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 420, height: 460, scale: 1 } }); writeFileSync(`${shot}-${name}.png`, Buffer.from(s.result.data, "base64")); };
await send("Emulation.setDeviceMetricsOverride", { width: 340, height: 460, deviceScaleFactor: 1, mobile: false });
await send("Page.enable");
// pretend to be the native window: the page then sends its window messages and click regions, which we record
await send("Page.addScriptToEvaluateOnNewDocument", { source:
  "window.__msgs=[]; window.webkit={messageHandlers:{nixiui:{postMessage:m=>window.__msgs.push(String(m))}}};" +
  "new MutationObserver((_,o)=>{ if(document.documentElement){ document.documentElement.classList.add('native'); o.disconnect(); } }).observe(document,{childList:true});" });
await send("Page.navigate", { url }); await sleep(4500);
const results = []; const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); };
const QUIET = "AM=null; attnPend=null; chip.className=''; notifyRow=null; notifyQ.length=0; propOn=null; capOn=false; idleHoldUntil=0; if(idleActive()||idleShowing()) throw new Error('still busy');";
const mode = m => ev(`await post('/api/settings',{idle_mode:'${m}'}).then(r=>r.json()).then(j=>{info=j;}); return info.idle_mode`);

// 1. shrink: peek after ~1 s with the timers scaled down; a tight click region even with click-through off
await mode("shrink");
await ev("nixiIdleScale(0.02); lastUser=lastActive=lastMouse=performance.now(); idleHoldUntil=0; return 1");
await sleep(2200);
let st = await ev("return {st:idleSt, peek:document.body.classList.contains('peek'), ct:!!info.click_through, region:lastRegion}");
check("peek after idle (shrink)", st.st === "peek" && st.peek, st);
check("tight click region in the peek (click-through off)", st.region && st.region !== "off" && st.region.startsWith("[["), st.region);
await snap("peek");

// 2. an agent 'needs you' restores and holds
await ev("onEvent({t:'attention',from:'claude',name:'Claude',kind:'ask',project:'snowflake',text:'needs your permission to use Bash'}); return 1");
await sleep(300);
st = await ev("return {st:idleSt, hold:Math.round(idleHoldUntil-performance.now())}");
check("attention restores to full and holds ~20 s", st.st === "full" && st.hold > 15000, st);
await snap("restored");

// 3. a notification in fullscreen does not restore (back to peek first)
await sleep(3000); await ev(QUIET+" lastUser=lastActive=lastMouse=performance.now()-60000; return 1"); await sleep(700);
await ev("SIT.fullscreen=true; onEvent({t:'notify',key:'fs1',app:'Slack',source:'',category:'chat',summary:'x',body:'y'}); return 1");
await sleep(400);
st = await ev("const s=idleSt; SIT.fullscreen=false; return {st:s}");
console.log("before-fs-check", JSON.stringify(st));
check("notification in fullscreen leaves him in the peek", st.st === "peek", st);

// 3b. a "finished" during fullscreen does not pop him out of the peek (it only shows its mark)
await sleep(3000); await ev(QUIET+" lastUser=lastActive=lastMouse=performance.now()-60000; return 1"); await sleep(700);
await ev("SIT.fullscreen=true; onEvent({t:'attention',from:'codex',name:'Codex',kind:'done',project:'snowflake',text:'done'}); return 1");
await sleep(1500);
st = await ev("const s=idleSt; SIT.fullscreen=false; return {st:s}");
check("a 'finished' in fullscreen leaves him in the peek", st.st === "peek", st);

// 4. doze: doze:hide after the doze time; an event sends doze:show (not show); nixiCmd sends show
await mode("doze");
await sleep(5600); await ev(QUIET+" __msgs.length=0; lastUser=lastActive=lastMouse=performance.now(); setIdle('full'); nixiIdleScale(0.02); return 1");
await sleep(7500);
st = await ev("return {st:idleSt, dozing, msgs:__msgs.filter(m=>m.startsWith('doze')||m==='show')}");
check("doze after the doze time sends doze:hide", st.st === "doze" && st.dozing && st.msgs.includes("doze:hide"), st);
await ev("__msgs.length=0; onEvent({t:'attention',from:'codex',name:'Codex',kind:'done',project:'snowflake',text:'Tests pass.'}); return 1");
await sleep(300);
st = await ev("return {st:idleSt, msgs:__msgs.filter(m=>m.startsWith('doze')||m==='show')}");
check("an event pops him up with doze:show (no focus)", st.st === "full" && st.msgs.includes("doze:show") && !st.msgs.includes("show"), st);
await sleep(3000); await ev(QUIET+" lastUser=lastActive=lastMouse=performance.now()-400000; return 1"); await sleep(1200);
console.log("pre-cmd", JSON.stringify(await ev("return {st:idleSt, dozing}")));
await ev("__msgs.length=0; nixiCmd('listen').catch(()=>{}); return 1"); await sleep(300);
st = await ev("return {st:idleSt, msgs:__msgs.filter(m=>m.startsWith('doze')||m==='show')}");
check("your own command uses show (with focus)", st.msgs.includes("show") && !st.msgs.includes("doze:show"), st);

// 5. off: never shrinks
await mode("off");
await ev("endListening&&endListening(); idleHoldUntil=0; lastUser=lastActive=lastMouse=performance.now()-400000; return 1"); await sleep(1500);
st = await ev("return {st:idleSt}");
check("off never shrinks", st.st === "full", st);
await mode("shrink");
console.log(JSON.stringify(results, null, 1));
await send("Target.closeTarget", { targetId: t.id }).catch(() => {});
process.exit(results.every(r => r.ok) ? 0 : 1);
