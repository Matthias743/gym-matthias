/* GYM Matthias — app logic
   Everything runs in the browser. Data is saved in localStorage on the phone,
   and sw.js (the service worker) caches the files so the app works offline. */
/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2,"0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y,m-1,d); };
const monday = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - (x.getDay()+6)%7); return x; };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate()+n); return iso(d); };
const fmt = (s, o) => parse(s).toLocaleDateString("en-GB", o || {day:"numeric", month:"short"});
const fmtKg = n => (Math.round(n*100)/100).toString();
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2,9);
const norm = s => String(s||"").trim().toLowerCase().replace(/\s+/g, " ");
const kgNum = s => { const v = parseFloat(String(s ?? "").replace(",", ".")); return isNaN(v) ? 0 : v; };
const str = v => String(v ?? "").trim();

function parseTarget(t){ const m = String(t||"").match(/(\d+)\s*[×x]\s*(\d+)(?:\s*-\s*(\d+))?/); return m ? { sets:+m[1], lo:+m[2], hi:+(m[3]||m[2]) } : null; }
function parseRest(t){
  t = String(t||""); let m = t.match(/(\d+)\s*'\s*(\d+)?/);
  if (m) return (+m[1])*60 + (+(m[2]||0));
  m = t.match(/(\d+)(?:\s*-\s*\d+)?\s*"/); return m ? +m[1] : 0;
}
const fmtRest = s => s >= 60 ? `${Math.floor(s/60)}:${pad(s%60)}` : `${s}s`;

/* An exercise entry is {n: name, sets: [{kg, r}]} with strings as typed.
   rawSets() also reads the older {kg:"60 62.5", reps:"8 8 7"} shape. */
function rawSets(v){
  if (!v) return [];
  if (Array.isArray(v.sets)) return v.sets.map(s => ({ kg: str(s.kg), r: str(s.r) }));
  const reps = (String(v.reps||"").match(/\d+/g) || []), m = String(v.reps||"").trim().match(/^(\d+)\s*[x×*]\s*(\d+)$/i);
  const r = m ? Array(+m[1]).fill(m[2]) : reps;
  const k = String(v.kg||"").replace(/,/g, ".").split(/[\s\/;]+/).filter(Boolean);
  return Array.from({ length: Math.max(r.length, k.length) }, (_, i) => ({ kg: k[i] || "", r: r[i] || "" }));
}
/* Sets as numbers; an empty kg means "same as the set before". */
function setsOf(v){
  let prev = 0; const out = [];
  for (const s of rawSets(v)){
    const kg = s.kg !== "" ? kgNum(s.kg) : prev; if (s.kg !== "") prev = kg;
    if (s.kg !== "" || s.r !== "") out.push({ kg, r: parseInt(s.r, 10) || 0 });
  }
  return out;
}
const entryFilled = v => setsOf(v).length > 0;
function summary(v){
  const ss = setsOf(v); if (!ss.length) return "";
  const kgs = ss.map(s => s.kg), same = kgs.every(k => k === kgs[0]);
  const kgTxt = kgs.some(k => k > 0) ? (same ? fmtKg(kgs[0]) : kgs.map(fmtKg).join("/")) + " kg · " : "";
  return kgTxt + ss.map(s => s.r || "–").join(" ");
}
const sessDone = s => !!s && (!!s.went || Object.values(s.ex || {}).some(entryFilled));
const sessHasData = s => !!s && Object.values(s.ex || {}).some(entryFilled);

/* double progression: every work set at the top of the rep range -> add weight */
function topOfRange(e, v){
  const t = parseTarget(e.target); if (!t || !v) return null;
  const ss = setsOf(v).filter(s => s.r > 0); if (ss.length < t.sets) return null;
  const work = ss.slice(-t.sets); if (!work.every(s => s.r >= t.hi)) return null;
  const kg = Math.max(...work.map(s => s.kg)); return kg > 0 ? fmtKg(kg + (kg < 20 ? 1 : 2.5)) + " kg" : "";
}

/* ---------- default program (Push / Pull / Legs / Upper) ---------- */
const DEFAULT = { sessions: [
  { id:"push", name:"Push", focus:"Pecs, épaules, triceps", ex:[
    {id:"push-bench", name:"Développé couché", target:"2-3 approche + 3×6-8 · 2'30"},
    {id:"push-mil", name:"Développé militaire", target:"3×8-10 · 2'"},
    {id:"push-dips", name:"Dips", target:"3×8-10 · 2'"},
    {id:"push-fly", name:"Écarté poulie vis-à-vis", target:"3×10-12 · 90\""},
    {id:"push-lat", name:"Élévations latérales", target:"4×12-15 · superset"},
    {id:"push-tri", name:"Extension triceps unilatérale", target:"3×10-12 · superset, 90\""} ]},
  { id:"pull", name:"Pull", focus:"Dos, arrière d'épaule, biceps", ex:[
    {id:"pull-lat", name:"Tirage vertical", target:"3×6-8 · 2'30"},
    {id:"pull-row", name:"Tirage horizontal", target:"3×8-10 · 2'"},
    {id:"pull-pullover", name:"Pullover poulie", target:"3×8-10 · 2'"},
    {id:"pull-rear", name:"Arrière d'épaule poulie", target:"3×12-15 · 90\""},
    {id:"pull-hammer", name:"Curl marteau", target:"4×10-12 · 90\""} ]},
  { id:"legs", name:"Legs", focus:"Jambes & abdos", ex:[
    {id:"legs-press", name:"Presse à cuisses", target:"4×6-8 · 2'30"},
    {id:"legs-bulg", name:"Fentes bulgares", target:"3×8-10 par jambe · 2'"},
    {id:"legs-curl", name:"Leg curl assis", target:"4×8-10 · 2'"},
    {id:"legs-calf", name:"Mollets", target:"3×12-15 · 90\""},
    {id:"legs-abs", name:"Abdos poulie", target:"3×12-15 · 1'"},
    {id:"legs-raise", name:"Relevés de jambes", target:"3×12-15 · 1'"} ]},
  { id:"upper", name:"Upper", focus:"Haut du corps, épaules renforcées", ex:[
    {id:"up-incline", name:"Développé incliné pecs (30°)", target:"2 approche + 3×8-10 · 2'"},
    {id:"up-pullup", name:"Tractions", target:"3×8-10 · 2'"},
    {id:"up-row", name:"Tirage horizontal", target:"3×10-12 · 90\""},
    {id:"up-machine", name:"Machine pecs", target:"3×12-15 · 90\""},
    {id:"up-lat", name:"Élévations latérales poulie", target:"4×12-15 · superset"},
    {id:"up-face", name:"Face pull", target:"3×12-15 · superset, 90\""},
    {id:"up-curl", name:"Curl pupitre", target:"3×10-12 · 60-90\""} ]}
]};

/* ---------- state ---------- */
let program = clone(DEFAULT);
let goal = 3;
let weeks = {};                     // Monday "YYYY-MM-DD" -> {s:{sid:{name, date, went, note, ex:{eid:{n, sets}}}}}
const thisWeek = () => iso(monday(new Date()));
let viewWeek = thisWeek();
let tab = "week";
const extraRows = {};               // "week|sid|eid" -> rows added with "+ set"
let pDraft = null, pDirty = false;

function setStatus(t, err){ const s = $("#status"); s.textContent = t; s.classList.toggle("err", !!err); }
const progSession = sid => program.sessions.find(s => s.id === sid);
function exName(eid, v){
  for (const s of program.sessions){ const e = s.ex.find(x => x.id === eid); if (e) return e.name; }
  return (v && v.n) || eid;
}

/* ---------- saving (localStorage on this phone) ---------- */
const STORE_KEY = "gym-matthias-v1";
function cleanWeek(w){
  const out = { kind:"week", week:w.week, s:{} };
  for (const [sid, s] of Object.entries(w.s || {})){
    const ex = {};
    for (const [eid, v] of Object.entries(s.ex || {})){
      const sets = rawSets(v); while (sets.length && !sets[sets.length-1].kg && !sets[sets.length-1].r) sets.pop();
      if (sets.length) ex[eid] = { n: exName(eid, v), sets };
    }
    const note = (s.note || "").trim();
    if (Object.keys(ex).length || note || s.went){
      const ps = progSession(sid);
      out.s[sid] = { name: ps ? ps.name : (s.name || "Session"), date: s.date || "", went: !!s.went, note, ex };
    }
  }
  return out;
}
function load(){
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (!d) return;
    if (d.program && Array.isArray(d.program.sessions) && d.program.sessions.length) program = d.program;
    if (d.goal >= 1) goal = d.goal;
    if (d.weeks && typeof d.weeks === "object") weeks = d.weeks;
  } catch { setStatus("Couldn't read your saved data.", true); }
}
function snapshot(){
  const w = {};
  for (const [k, v] of Object.entries(weeks)){ const c = cleanWeek(v); if (Object.keys(c.s).length) w[k] = c; }
  return { app:"gym-matthias", version:1, savedAt: new Date().toISOString(), program, goal, weeks: w };
}
function persist(){
  clearTimeout(saveTimer); saveTimer = null;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(snapshot())); setStatus("Saved on this phone"); }
  catch { setStatus("Couldn't save: your phone storage is full or blocked.", true); }
}
let saveTimer = null;
function scheduleSave(){ setStatus("Saving…"); clearTimeout(saveTimer); saveTimer = setTimeout(persist, 300); }
const saveSettings = persist;

/* ---------- history (linked by exercise name) ---------- */
function entries(){
  const out = [];
  for (const k of Object.keys(weeks))
    for (const [sid, s] of Object.entries(weeks[k].s || {}))
      for (const [eid, v] of Object.entries(s.ex || {}))
        if (entryFilled(v)) out.push({ week:k, sid, date: s.date || k, eid, v, name: exName(eid, v) });
  return out.sort((a,b) => a.date.localeCompare(b.date));
}
function lastEntry(name, beforeWeek){
  const key = norm(name), l = entries().filter(x => x.week < beforeWeek && norm(x.name) === key);
  const x = l[l.length-1]; return x ? { v: x.v, date: x.date } : null;
}
function history(name){
  const key = norm(name);
  return entries().filter(x => norm(x.name) === key).map(x => { const ss = setsOf(x.v); return { date:x.date, kg: Math.max(0, ...ss.map(s => s.kg)), reps: ss.reduce((a,s) => a + s.r, 0), txt: summary(x.v), v: x.v }; });
}
const weekCount = k => { const w = weeks[k]; return w ? Object.values(w.s || {}).filter(sessDone).length : 0; };

/* ---------- week view ---------- */
function ensureWeek(k){ if (!weeks[k]) weeks[k] = { kind:"week", week:k, s:{} }; return weeks[k]; }
const inWeek = (d, k) => d >= k && d <= addDays(k, 6);
function autoDate(s){
  if (s.date) return;
  const today = iso(new Date());
  if (inWeek(today, viewWeek)) s.date = today;      // past weeks: you pick the day
}

function rowCount(sid, e, v){
  const t = parseTarget(e.target);
  return Math.max(t ? t.sets : 3, rawSets(v).length, 1) + (extraRows[`${viewWeek}|${sid}|${e.id}`] || 0);
}
function placeholders(cur, last, i){
  const raw = rawSets(cur), lr = last ? rawSets(last.v) : [];
  let kg = "";
  for (let j = i - 1; j >= 0; j--) if (raw[j] && raw[j].kg){ kg = raw[j].kg; break; }
  if (!kg && lr.length){ for (let j = Math.min(i, lr.length-1); j >= 0; j--) if (lr[j].kg){ kg = lr[j].kg; break; } }
  const r = lr[i] && lr[i].r ? lr[i].r : "reps";
  return { kg: kg || "kg", r };
}
function setsHtml(sid, e, v, last){
  const n = rowCount(sid, e, v), raw = rawSets(v);
  let h = `<div class="sets"><div class="set sets-head"><span></span><span>kg</span><span>reps</span></div>`;
  for (let i = 0; i < n; i++){
    const s = raw[i] || { kg:"", r:"" }, ph = placeholders(v, last, i), id = `${sid}-${e.id}-${i}`;
    h += `<div class="set"><span class="sn">${i+1}</span>
      <input id="kg-${esc(id)}" inputmode="decimal" autocomplete="off" enterkeyhint="next" data-sid="${esc(sid)}" data-eid="${esc(e.id)}" data-i="${i}" data-f="kg" value="${esc(s.kg)}" placeholder="${esc(ph.kg)}" class="${s.kg ? "filled" : ""}" aria-label="${esc(e.name)}, set ${i+1}, kg">
      <input id="r-${esc(id)}" inputmode="numeric" pattern="[0-9]*" autocomplete="off" enterkeyhint="next" data-sid="${esc(sid)}" data-eid="${esc(e.id)}" data-i="${i}" data-f="r" value="${esc(s.r)}" placeholder="${esc(ph.r)}" class="${s.r ? "filled" : ""}" aria-label="${esc(e.name)}, set ${i+1}, reps"></div>`;
  }
  return h + `<button class="ghost add-set" type="button" data-addset="${esc(sid)}|${esc(e.id)}">+ set</button></div>`;
}
function exHtml(sid, e, v){
  const last = lastEntry(e.name, viewWeek), rest = parseRest(e.target);
  return `<div class="exrow" id="ex-${esc(sid)}-${esc(e.id)}">
    <div class="exname"><b>${esc(e.name)}</b><small>${esc(e.target)}</small>
      ${last ? `<button type="button" class="last num" data-copy="${esc(sid)}|${esc(e.id)}" aria-label="Copy last time into this exercise">Last: ${esc(summary(last.v))} (${fmt(last.date)}) · tap to copy</button>` : ""}
      <span class="up num" id="up-${esc(sid)}-${esc(e.id)}">${upText(e, v, last)}</span>
      ${rest ? `<button class="timer" type="button" data-timer="${rest}" data-name="${esc(e.name)}">⏱ Rest ${fmtRest(rest)}</button>` : ""}
    </div>
    ${setsHtml(sid, e, v, last)}
  </div>`;
}
function upText(e, v, last){
  if (entryFilled(v)){ const n = topOfRange(e, v); return n === null ? "" : `↑ Top of range: ${n ? "go " + n : "add weight"} next time`; }
  const n = topOfRange(e, last && last.v); return n === null ? "" : `↑ Top of range last time: try ${n || "adding weight"} today`;
}
function renderWeek(){
  const k = viewWeek, cur = thisWeek(), w = weeks[k] || { s:{} }, end = addDays(k, 6);
  $("#week-title").textContent = k === cur ? "This week" : k === addDays(cur, -7) ? "Last week" : "Week of " + fmt(k);
  $("#week-range").textContent = `${fmt(k, {weekday:"short", day:"numeric", month:"short"})} – ${fmt(end, {weekday:"short", day:"numeric", month:"short"})}`;
  $("#next").disabled = k >= cur; $("#go-today").hidden = k === cur;
  const cards = program.sessions.map(s => {
    const sd = (w.s && w.s[s.id]) || { ex:{} };
    return `<article class="session" id="sess-${esc(s.id)}">
      <div class="s-head">
        <div class="s-title"><h3>${esc(s.name)}</h3><small>${esc(s.focus)}</small></div>
        <div class="s-meta">
          <label class="went"><input type="checkbox" class="s-went" id="went-${esc(s.id)}" data-sid="${esc(s.id)}"> Went</label>
          <input type="date" class="s-date" id="date-${esc(s.id)}" data-sid="${esc(s.id)}" value="${esc(sd.date)}" min="${k}" max="${end}" aria-label="Day of ${esc(s.name)}">
          <span class="pill" id="pill-${esc(s.id)}">Not done</span>
        </div>
      </div>
      ${s.ex.map(e => exHtml(s.id, e, (sd.ex || {})[e.id])).join("")}
      <div class="s-foot"><textarea class="s-note" id="note-${esc(s.id)}" data-sid="${esc(s.id)}" rows="1" placeholder="Note: how it felt, pain, sleep…" aria-label="Note for ${esc(s.name)}">${esc(sd.note)}</textarea><button class="ghost danger" data-clear="${esc(s.id)}" type="button">Clear</button></div>
    </article>`;
  });
  /* sessions logged this week that are no longer in the program */
  for (const [sid, sd] of Object.entries(w.s || {})){
    if (progSession(sid) || !sessDone(sd)) continue;
    cards.push(`<article class="session done orphan" id="sess-${esc(sid)}">
      <div class="s-head"><div class="s-title"><h3>${esc(sd.name || "Session")}</h3><small>Removed from your program · ${sd.date ? fmt(sd.date, {weekday:"long", day:"numeric", month:"short"}) : "no date"}</small></div>
        <div class="s-meta"><span class="pill">Done ✓</span></div></div>
      <ul>${Object.entries(sd.ex || {}).filter(([, v]) => entryFilled(v)).map(([eid, v]) => `<li><b>${esc(exName(eid, v))}</b> <span class="num">${esc(summary(v))}</span></li>`).join("") || "<li>Went, no numbers logged</li>"}</ul>
      <div class="s-foot" style="justify-content:flex-end"><button class="ghost danger" data-clear="${esc(sid)}" type="button">Clear</button></div>
    </article>`);
  }
  $("#sessions").innerHTML = cards.join("");
  updateWeekStatus();
}
function updateWeekStatus(){
  const k = viewWeek, w = weeks[k] || { s:{} }, n = program.sessions.length, isCur = k === thisWeek();
  const next = isCur ? program.sessions.find(s => !sessDone(w.s && w.s[s.id])) : null;
  $("#dots").innerHTML = program.sessions.map(s => {
    const sd = w.s && w.s[s.id], on = sessDone(sd), el = document.getElementById("sess-" + s.id);
    if (el){
      const isNext = !!next && next.id === s.id;
      el.classList.toggle("done", on); el.classList.toggle("next", isNext);
      document.getElementById("pill-" + s.id).textContent = on ? "Done ✓" : isNext ? "Up next" : "Not done";
      const cb = document.getElementById("went-" + s.id);
      cb.checked = on; cb.disabled = sessHasData(sd);
      cb.parentElement.title = cb.disabled ? "Done automatically because you logged numbers" : "Tick if you trained without logging numbers";
      const d = document.getElementById("date-" + s.id);
      d.classList.toggle("need", on && !(sd && sd.date)); d.title = d.classList.contains("need") ? "Pick the day you trained" : "";
    }
    return `<span class="${on ? "on" : ""}">${esc(s.name)}</span>`;
  }).join("");
  const done = weekCount(k);
  $("#count").innerHTML = `${done}<small>/${n}</small>`;
  const met = done >= goal;
  $("#counter").classList.toggle("met", met);
  const parts = [met ? `<span class="ok">Goal of ${goal} reached ✓</span>` : `Goal <b>${goal}</b> · ${goal - done} to go`];
  if (next) parts.push(`<span class="nx">Up next: <b class="nx">${esc(next.name)}</b></span>`);
  $("#goal-line").innerHTML = parts.join(" · ");
}
function refreshExercise(sid, eid){
  const ps = progSession(sid), e = ps && ps.ex.find(x => x.id === eid); if (!e) return;
  const v = ((weeks[viewWeek] || {s:{}}).s[sid] || { ex:{} }).ex[eid], last = lastEntry(e.name, viewWeek);
  const n = rowCount(sid, e, v);
  for (let i = 0; i < n; i++){
    const ph = placeholders(v, last, i), id = `${sid}-${eid}-${i}`;
    const kgEl = document.getElementById("kg-" + id), rEl = document.getElementById("r-" + id);
    if (kgEl) kgEl.placeholder = ph.kg; if (rEl) rEl.placeholder = ph.r;
  }
  const up = document.getElementById(`up-${sid}-${eid}`); if (up) up.textContent = upText(e, v, last);
}
function sessionOf(sid){ const w = ensureWeek(viewWeek); return w.s[sid] = w.s[sid] || { date:"", went:false, note:"", ex:{} }; }

$("#sessions").addEventListener("input", e => {
  const t = e.target, sid = t.dataset.sid; if (!sid || t.type === "checkbox") return;
  const s = sessionOf(sid);
  if (t.classList.contains("s-date")) s.date = t.value;
  else if (t.classList.contains("s-note")) s.note = t.value;
  else {
    const eid = t.dataset.eid, i = +t.dataset.i;
    const ent = s.ex[eid] = { n: exName(eid), sets: rawSets(s.ex[eid]) };
    while (ent.sets.length <= i) ent.sets.push({ kg:"", r:"" });
    ent.sets[i][t.dataset.f] = t.value;
    t.classList.toggle("filled", !!t.value.trim());
    refreshExercise(sid, eid);
    if (sessDone(s)){ autoDate(s); document.getElementById("date-" + sid).value = s.date; }
  }
  updateWeekStatus(); scheduleSave(viewWeek);
});
$("#sessions").addEventListener("change", e => {
  const t = e.target; if (!t.classList.contains("s-went")) return;
  const s = sessionOf(t.dataset.sid); s.went = t.checked;
  if (t.checked){ autoDate(s); document.getElementById("date-" + t.dataset.sid).value = s.date; }
  updateWeekStatus(); scheduleSave(viewWeek);
});
let clearTimer = null;
$("#sessions").addEventListener("click", e => {
  const tb = e.target.closest("[data-timer]"); if (tb){ startTimer(+tb.dataset.timer, tb.dataset.name); return; }
  const ad = e.target.closest("[data-addset]");
  if (ad){
    const [sid, eid] = ad.dataset.addset.split("|"), key = `${viewWeek}|${sid}|${eid}`;
    extraRows[key] = (extraRows[key] || 0) + 1;
    const ps = progSession(sid), ex = ps.ex.find(x => x.id === eid), v = ((weeks[viewWeek] || {s:{}}).s[sid] || {ex:{}}).ex[eid];
    document.getElementById(`ex-${sid}-${eid}`).outerHTML = exHtml(sid, ex, v);
    const n = rowCount(sid, ex, v); const f = document.getElementById(`kg-${sid}-${eid}-${n-1}`); if (f) f.focus();
    return;
  }
  const cp = e.target.closest("[data-copy]");
  if (cp){
    const [sid, eid] = cp.dataset.copy.split("|"), ps = progSession(sid), ex = ps.ex.find(x => x.id === eid);
    const last = lastEntry(ex.name, viewWeek); if (!last) return;
    const s = sessionOf(sid); s.ex[eid] = { n: ex.name, sets: rawSets(last.v) };
    autoDate(s); document.getElementById("date-" + sid).value = s.date;
    document.getElementById(`ex-${sid}-${eid}`).outerHTML = exHtml(sid, ex, s.ex[eid]);
    updateWeekStatus(); scheduleSave(viewWeek); return;
  }
  const b = e.target.closest("[data-clear]"); if (!b) return;
  if (b.dataset.armed !== "1"){ b.dataset.armed = "1"; b.textContent = "Tap again"; clearTimeout(clearTimer); clearTimer = setTimeout(() => { b.dataset.armed = ""; b.textContent = "Clear"; }, 4000); return; }
  const w = ensureWeek(viewWeek); delete w.s[b.dataset.clear];
  for (const key of Object.keys(extraRows)) if (key.startsWith(`${viewWeek}|${b.dataset.clear}|`)) delete extraRows[key];
  renderWeek(); scheduleSave(viewWeek);
});
$("#prev").onclick = () => { viewWeek = addDays(viewWeek, -7); renderWeek(); };
$("#next").onclick = () => { if (viewWeek < thisWeek()){ viewWeek = addDays(viewWeek, 7); renderWeek(); } };
$("#go-today").onclick = () => { viewWeek = thisWeek(); renderWeek(); };

/* ---------- rest timer ---------- */
let tEnd = 0, tInt = null, actx = null;
/* keep the screen on while the rest timer runs (supported by Chrome on Android) */
let wakeLock = null;
async function keepAwake(on){
  try {
    if (on && !wakeLock && "wakeLock" in navigator){ wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); }
    if (!on && wakeLock){ await wakeLock.release(); wakeLock = null; }
  } catch {}
}
function startTimer(sec, name){
  keepAwake(true);
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.resume) actx.resume(); } catch {}
  tEnd = Date.now() + sec*1000;
  $("#t-name").textContent = "Rest · " + name;
  $("#timerbar").hidden = false; $("#timerbar").classList.remove("over");
  clearInterval(tInt); tick(); tInt = setInterval(tick, 250);
}
function tick(){
  const left = Math.ceil((tEnd - Date.now())/1000);
  if (left <= 0){
    clearInterval(tInt); $("#t-left").textContent = "Go!"; $("#timerbar").classList.add("over"); beep();
    try { navigator.vibrate && navigator.vibrate([300,150,300,150,300]); } catch {}
    setTimeout(() => keepAwake(false), 20000);
    return;
  }
  $("#t-left").textContent = fmtRest(left);
}
function beep(){
  if (!actx) return;
  try { [0, .25, .5].forEach(d => { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; g.gain.value = .15; o.connect(g); g.connect(actx.destination); o.start(actx.currentTime + d); o.stop(actx.currentTime + d + .15); }); } catch {}
}
$("#t-plus").onclick = () => { tEnd = Math.max(tEnd, Date.now()) + 15000; $("#timerbar").classList.remove("over"); clearInterval(tInt); tick(); tInt = setInterval(tick, 250); };
$("#t-stop").onclick = () => { clearInterval(tInt); $("#timerbar").hidden = true; keepAwake(false); };
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !$("#timerbar").hidden && tEnd > Date.now()) keepAwake(true); });

/* ---------- charts ---------- */
function niceStep(x){ const p = Math.pow(10, Math.floor(Math.log10(x))); const f = x/p; return (f<1.5?1:f<3?2:f<7?5:10)*p; }
const W = 600, H = 210, PL = 40, PR = 12, PT = 14, PB = 28;
function lineChart(pts, color, unit){
  const ys = pts.map(p => p.y); let lo = Math.min(...ys), hi = Math.max(...ys);
  if (lo === hi){ lo -= 1; hi += 1; }
  const step = niceStep((hi-lo)/3); lo = Math.floor(lo/step)*step; hi = Math.ceil(hi/step)*step;
  const iw = W-PL-PR, ih = H-PT-PB;
  const x = i => PL + (pts.length === 1 ? iw/2 : i*iw/(pts.length-1));
  const y = v => PT + ih - (v-lo)/(hi-lo)*ih;
  let g = "";
  for (let v = lo; v <= hi + step/2; v += step) g += `<line x1="${PL}" x2="${W-PR}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${PL-6}" y="${y(v)+4}" text-anchor="end">${fmtKg(v)}</text>`;
  const path = pts.map((p,i) => `${i?"L":"M"}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join("");
  const area = pts.length > 1 ? `<path d="${path}L${x(pts.length-1)},${PT+ih}L${x(0)},${PT+ih}Z" fill="${color}" fill-opacity="0.12" stroke="none"/>` : "";
  const dots = pts.map((p,i) => `<circle cx="${x(i)}" cy="${y(p.y)}" r="${i===pts.length-1?5:3}" fill="${i===pts.length-1?color:"var(--surface)"}" stroke="${color}" stroke-width="2"><title>${esc(p.label)}: ${fmtKg(p.y)} ${unit}</title></circle>`).join("");
  const xl = pts.length === 1 ? `<text x="${x(0)}" y="${H-8}" text-anchor="middle">${esc(pts[0].label)}</text>`
    : `<text x="${x(0)}" y="${H-8}" text-anchor="start">${esc(pts[0].label)}</text><text x="${x(pts.length-1)}" y="${H-8}" text-anchor="end">${esc(pts[pts.length-1].label)}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}${area}<path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>${dots}${xl}</svg>`;
}
function barChart(ws, goalN){
  const top = Math.max(goalN, program.sessions.length, ...ws.map(w => w.n), 2);
  const iw = W-PL-PR, ih = H-PT-PB, bw = iw/ws.length, y = v => PT + ih - v/top*ih;
  let g = "";
  for (let v = 0; v <= top; v++) g += `<line x1="${PL}" x2="${W-PR}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${PL-6}" y="${y(v)+4}" text-anchor="end">${v}</text>`;
  const bars = ws.map((w,i) => {
    const h = w.n/top*ih, met = w.n >= goalN;
    return `<rect x="${PL+i*bw+bw*.18}" y="${PT+ih-h}" width="${bw*.64}" height="${h}" rx="3" fill="${met ? "var(--green)" : "var(--accent)"}"><title>Week of ${esc(w.label)}: ${w.n} session${w.n===1?"":"s"}</title></rect>`
      + (w.n ? `<text x="${PL+i*bw+bw/2}" y="${PT+ih-h-5}" text-anchor="middle" style="fill:var(--fg)">${w.n}</text>` : "");
  }).join("");
  const gl = `<line x1="${PL}" x2="${W-PR}" y1="${y(goalN)}" y2="${y(goalN)}" stroke="var(--yellow)" stroke-width="2" stroke-dasharray="6 4"/>`;
  const xl = ws.map((w,i) => (i % 3 === 2 && i !== ws.length-2) || i === ws.length-1 ? `<text x="${PL+i*bw+bw/2}" y="${H-8}" text-anchor="middle">${i===ws.length-1 ? "This wk" : esc(w.label)}</text>` : "").join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sessions per week, last 12 weeks">${g}${bars}${gl}${xl}</svg>`;
}

/* ---------- progress view ---------- */
function renderProgress(){
  const cur = thisWeek();
  if (document.activeElement !== $("#goal")) $("#goal").value = goal;
  const ws = []; for (let i = 11; i >= 0; i--){ const k = addDays(cur, -7*i); ws.push({ key:k, label: fmt(k), n: weekCount(k) }); }
  const total = Object.keys(weeks).reduce((a,k) => a + weekCount(k), 0);
  $("#s-total").textContent = total || "–";
  $("#s-avg").textContent = total ? (ws.slice(3,11).reduce((a,w) => a + w.n, 0)/8).toFixed(1) : "–";
  let streak = 0, k = cur; if (weekCount(k) < goal) k = addDays(k, -7);
  while (weekCount(k) >= goal && weekCount(k) > 0){ streak++; k = addDays(k, -7); }
  $("#s-streak").textContent = total ? streak : "–";
  $("#freq-chart").innerHTML = total ? barChart(ws, goal) : `<div class="empty-chart">Your weekly count shows up after your first session.</div>`;

  const sel = $("#ex-select"), prev = sel.value, seen = new Set();
  let html = "";
  for (const ps of program.sessions){
    const opts = ps.ex.filter(e => { const k2 = norm(e.name); if (!k2 || seen.has(k2)) return false; seen.add(k2); return true; });
    if (opts.length) html += `<optgroup label="${esc(ps.name)}">${opts.map(e => `<option value="${esc(e.name)}">${esc(e.name)}</option>`).join("")}</optgroup>`;
  }
  const old = [...new Map(entries().filter(x => !seen.has(norm(x.name))).map(x => [norm(x.name), x.name])).values()];
  if (old.length) html += `<optgroup label="Not in your program anymore">${old.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("")}</optgroup>`;
  sel.innerHTML = html;
  const vals = [...sel.options].map(o => o.value);
  if (vals.includes(prev)) sel.value = prev;
  else { const withData = vals.find(n => history(n).length); if (withData) sel.value = withData; }
  renderExercise();
}
function renderExercise(){
  const h = history($("#ex-select").value);
  if (!h.length){ $("#prog-chart").innerHTML = `<div class="empty-chart">No numbers for this exercise yet. Fill it in on the Week tab.</div>`; $("#pr").textContent = ""; $("#prog-table").innerHTML = ""; return; }
  const useKg = h.some(p => p.kg > 0);
  const pts = h.map(p => ({ label: fmt(p.date), y: useKg ? p.kg : p.reps, p })).filter(p => p.y > 0);
  $("#prog-chart").innerHTML = pts.length ? lineChart(pts.slice(-30), "var(--accent)", useKg ? "kg" : "reps") : `<div class="empty-chart">Add a weight or reps to see a chart.</div>`;
  if (pts.length){
    const best = pts.reduce((a,b) => b.y > a.y ? b : a), diff = pts[pts.length-1].y - pts[0].y;
    $("#pr").innerHTML = useKg
      ? `Heaviest: <b class="num">${fmtKg(best.y)} kg</b> on ${fmt(best.p.date)} (${esc(best.p.txt)})${pts.length > 1 ? ` · <span class="num">${diff>=0?"+":""}${fmtKg(diff)} kg</span> since your first log` : ""}`
      : `Most reps in a session: <b class="num">${best.y}</b> on ${fmt(best.p.date)} (bodyweight exercise, chart shows total reps)`;
  }
  $("#prog-table").innerHTML = `<table class="log"><thead><tr><th>Date</th><th>Sets</th></tr></thead><tbody>${h.slice(-8).reverse().map(p => `<tr><td>${fmt(p.date, {weekday:"short", day:"numeric", month:"short"})}</td><td>${esc(p.txt)}</td></tr>`).join("")}</tbody></table>`;
}
$("#ex-select").onchange = renderExercise;
let goalTimer = null;
$("#goal").addEventListener("input", () => {
  const v = parseInt($("#goal").value, 10); if (!(v >= 1 && v <= 7)) return;
  goal = v; renderProgress(); clearTimeout(goalTimer); goalTimer = setTimeout(saveSettings, 600);
});

/* ---------- backup: export and import ---------- */
function buildCsv(){
  const q = x => { const s = String(x ?? ""); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = [["Date","Week","Session","Exercise","Set","kg","Reps","Note"]];
  for (const k of Object.keys(weeks).sort()){
    for (const s of Object.values(weeks[k].s || {})){
      if (!sessDone(s) && !(s.note||"").trim()) continue;
      let first = true;
      const note = () => { const n = first ? (s.note || "") : ""; first = false; return n; };
      const exs = Object.entries(s.ex || {}).filter(([, v]) => entryFilled(v));
      if (!exs.length) rows.push([s.date || k, k, s.name || "", "", "", "", "", note()]);
      for (const [eid, v] of exs) setsOf(v).forEach((st, i) => rows.push([s.date || k, k, s.name || "", exName(eid, v), i+1, st.kg ? fmtKg(st.kg) : "", st.r || "", note()]));
    }
  }
  return "﻿" + rows.map(r => r.map(q).join(";")).join("\r\n");
}
function download(name, text, type){
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href:url, download:name });
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
const exportMsg = (t, err) => { const m = $("#export-msg"); m.textContent = t; m.className = "msg" + (err ? " err" : ""); };
$("#export-json").onclick = () => { download(`gym-matthias-backup-${iso(new Date())}.json`, JSON.stringify(snapshot(), null, 1), "application/json"); exportMsg("Backup downloaded."); };
$("#export-csv").onclick = () => { download(`gym-matthias-${iso(new Date())}.csv`, buildCsv(), "text/csv"); exportMsg("Table downloaded."); };

/* CSV parser for the format written by buildCsv (also accepts exports from the first version of the app) */
function parseCsv(text){
  text = text.replace(/^\ufeff/, "");
  const sep = text.split(/\r?\n/)[0].includes(";") ? ";" : ",";
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++){
    const c = text[i];
    if (q){ if (c === '"' && text[i+1] === '"'){ cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === sep){ row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r"){ if (c === "\r" && text[i+1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length){ row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
const slug = s => norm(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || uid();
function weeksFromCsv(text){
  const rows = parseCsv(text), head = rows.shift() || [];
  if (norm(head[0]) !== "date" || head.length < 7) throw new Error("This CSV doesn't look like a GYM Matthias table.");
  const out = {};
  for (const [date, wk, sname, ename, , kg, reps, note] of rows){
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) continue;
    const k = /^\d{4}-\d{2}-\d{2}$/.test(wk || "") ? wk : iso(monday(parse(date)));
    const ps = program.sessions.find(s => norm(s.name) === norm(sname));
    const sid = ps ? ps.id : "s-" + slug(sname || "session");
    const w = out[k] = out[k] || { kind:"week", week:k, s:{} };
    const s = w.s[sid] = w.s[sid] || { name: ps ? ps.name : (sname || "Session"), date, went:false, note:"", ex:{} };
    if (note) s.note = note;
    if (!ename){ s.went = true; continue; }
    const pe = ps && ps.ex.find(e => norm(e.name) === norm(ename));
    const eid = pe ? pe.id : "x-" + slug(ename);
    (s.ex[eid] = s.ex[eid] || { n: ename, sets: [] }).sets.push({ kg: kg || "", r: reps || "" });
  }
  return out;
}
let pendingImport = null;
$("#import-btn").onclick = () => $("#import-file").click();
$("#import-file").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const text = await f.text();
    if (/\.json$/i.test(f.name) || text.trim().startsWith("{")){
      const d = JSON.parse(text);
      if (d.app !== "gym-matthias" || !d.weeks) throw new Error("This file isn't a GYM Matthias backup.");
      const n = Object.values(d.weeks).reduce((a, w) => a + Object.values(w.s || {}).filter(sessDone).length, 0);
      pendingImport = { kind:"json", d };
      $("#import-text").textContent = `Restore this backup (${n} sessions)? It replaces everything on this phone, including your program.`;
    } else {
      const w = weeksFromCsv(text);
      const n = Object.values(w).reduce((a, x) => a + Object.keys(x.s).length, 0);
      pendingImport = { kind:"csv", w };
      $("#import-text").textContent = `Add ${n} sessions from this table? Sessions with the same week and name are replaced.`;
    }
    $("#import-confirm").hidden = false; exportMsg("");
  } catch (err) { exportMsg((err && err.message) || "Couldn't read this file.", true); }
};
$("#import-no").onclick = () => { pendingImport = null; $("#import-confirm").hidden = true; };
$("#import-yes").onclick = () => {
  if (!pendingImport) return;
  if (pendingImport.kind === "json"){
    const d = pendingImport.d;
    if (d.program && Array.isArray(d.program.sessions) && d.program.sessions.length) program = d.program;
    if (d.goal >= 1) goal = d.goal;
    weeks = d.weeks; pDraft = null;
  } else {
    for (const [k, w] of Object.entries(pendingImport.w)){ const t = ensureWeek(k); Object.assign(t.s, w.s); }
  }
  pendingImport = null; $("#import-confirm").hidden = true;
  persist(); renderProgress(); exportMsg("Import done.");
};

/* ---------- program editor ---------- */
function renderEditor(){
  if (!pDraft) pDraft = clone(program);
  $("#p-editor").innerHTML = pDraft.sessions.map((s, i) => `
    <div class="p-session">
      <div class="p-head">
        <input class="name" id="ps-name-${i}" data-i="${i}" data-k="name" value="${esc(s.name)}" aria-label="Session name" placeholder="Session name">
        <input class="focus" id="ps-focus-${i}" data-i="${i}" data-k="focus" value="${esc(s.focus)}" aria-label="Focus" placeholder="Focus (optional)">
        <button class="ghost danger" type="button" data-act="rm-s" data-i="${i}" aria-label="Remove session ${esc(s.name)}">Remove</button>
      </div>
      ${s.ex.map((e, j) => `
        <div class="p-row">
          <input id="pe-name-${i}-${j}" data-i="${i}" data-j="${j}" data-k="name" value="${esc(e.name)}" placeholder="Exercise" aria-label="Exercise name">
          <input class="tgt" id="pe-tgt-${i}-${j}" data-i="${i}" data-j="${j}" data-k="target" value="${esc(e.target)}" placeholder="Target, e.g. 3×8-10 · 2'" aria-label="Target">
          <span class="btns">
            <button class="ghost" type="button" data-act="up" data-i="${i}" data-j="${j}" aria-label="Move up" ${j===0?"disabled":""}>↑</button>
            <button class="ghost" type="button" data-act="rm-e" data-i="${i}" data-j="${j}" aria-label="Remove exercise">✕</button>
          </span>
        </div>`).join("")}
      <div><button class="ghost" type="button" data-act="add-e" data-i="${i}" style="color:var(--accent)">+ Add exercise</button></div>
    </div>`).join("");
}
function markP(){ pDirty = true; $("#p-save").disabled = false; $("#p-discard").hidden = false; $("#p-msg").textContent = ""; }
$("#p-editor").addEventListener("input", e => {
  const t = e.target, i = +t.dataset.i; if (isNaN(i)) return;
  if (t.dataset.j !== undefined) pDraft.sessions[i].ex[+t.dataset.j][t.dataset.k] = t.value;
  else pDraft.sessions[i][t.dataset.k] = t.value;
  markP();
});
$("#p-editor").addEventListener("click", e => {
  const b = e.target.closest("button[data-act]"); if (!b) return;
  const i = +b.dataset.i, j = +b.dataset.j, s = pDraft.sessions[i];
  if (b.dataset.act === "add-e"){ s.ex.push({ id: s.id + "-" + uid(), name:"", target:"3×8-10 · 2'" }); markP(); renderEditor(); document.getElementById(`pe-name-${i}-${s.ex.length-1}`).focus(); return; }
  if (b.dataset.act === "rm-e"){ s.ex.splice(j, 1); }
  if (b.dataset.act === "up" && j > 0){ [s.ex[j-1], s.ex[j]] = [s.ex[j], s.ex[j-1]]; }
  if (b.dataset.act === "rm-s"){
    if (b.dataset.armed !== "1"){ b.dataset.armed = "1"; b.textContent = "Tap again"; setTimeout(() => { b.dataset.armed = ""; b.textContent = "Remove"; }, 4000); return; }
    pDraft.sessions.splice(i, 1);
  }
  markP(); renderEditor();
});
$("#p-add-session").onclick = () => { pDraft = pDraft || clone(program); pDraft.sessions.push({ id:"s-" + uid(), name:"New session", focus:"", ex:[{ id:"e-" + uid(), name:"", target:"3×8-10 · 2'" }] }); markP(); renderEditor(); };
$("#p-discard").onclick = () => { pDraft = clone(program); pDirty = false; $("#p-save").disabled = true; $("#p-discard").hidden = true; $("#p-msg").textContent = ""; renderEditor(); };
$("#p-save").onclick = () => {
  const p = { sessions: pDraft.sessions.map(s => ({ ...s, name: s.name.trim() || "Session", focus: s.focus.trim(), ex: s.ex.filter(e => e.name.trim()).map(e => ({ ...e, name: e.name.trim(), target: e.target.trim() })) })).filter(s => s.ex.length) };
  if (!p.sessions.length){ $("#p-msg").textContent = "Keep at least one session with one exercise."; $("#p-msg").className = "msg err"; return; }
  program = p; pDraft = clone(p); pDirty = false; $("#p-save").disabled = true; $("#p-discard").hidden = true; renderEditor();
  persist(); $("#p-msg").className = "msg"; $("#p-msg").textContent = "Program saved.";
};

/* ---------- tabs ---------- */
function showTab(t){
  tab = t;
  for (const n of ["week","progress","program"]){ $("#view-" + n).hidden = n !== t; $("#tab-" + n).setAttribute("aria-selected", String(n === t)); }
  if (t === "week") renderWeek(); if (t === "progress") renderProgress(); if (t === "program") renderEditor();
}
document.querySelector(".tabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) showTab(b.dataset.tab); });

/* save right away when the app goes to the background */
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && saveTimer) persist(); });
window.addEventListener("pagehide", () => { if (saveTimer) persist(); });

/* ---------- install and offline (PWA) ---------- */
let installEvent = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvent = e; $("#install").hidden = false; });
$("#install").onclick = async () => { if (!installEvent) return; installEvent.prompt(); await installEvent.userChoice.catch(() => {}); installEvent = null; $("#install").hidden = true; };
window.addEventListener("appinstalled", () => { $("#install").hidden = true; });

if ("serviceWorker" in navigator){
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloading){ reloading = true; location.reload(); } });
  navigator.serviceWorker.register("sw.js").then(reg => {
    const offer = () => { if (reg.waiting && navigator.serviceWorker.controller) $("#update").hidden = false; };
    offer();
    reg.addEventListener("updatefound", () => { const w = reg.installing; if (w) w.addEventListener("statechange", () => { if (w.state === "installed") offer(); }); });
    $("#update-btn").onclick = () => { if (saveTimer) persist(); if (reg.waiting) reg.waiting.postMessage("skipWaiting"); };
  }).catch(() => {});
}
/* ask the browser not to delete our data when the phone is low on space */
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}

/* ---------- boot ---------- */
load();
renderWeek();
