// ============================================================
// Karaoke Captions (web) · main app
// Audio -> Whisper (in the browser) -> script fix -> line breaks
// by real pixel width -> editor + preview -> karaoke SRT.
// ============================================================
const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
const $ = (id) => document.getElementById(id);
const K = window.KCore;
const t = (k, v) => window.I18N.t(k, v);

// ---------------- settings (remembered per browser) ----------------
const SETTINGS = ["lang", "model", "frameW", "frameH", "safeW", "font", "weight", "size", "stroke", "maxChars", "posY",
  "hl", "mode", "useBase", "base", "minWord", "pvFill", "pvStroke", "pvBox", "pvBoxColor", "pvBoxOp", "pvShadow", "pvShadowColor", "pvGuides"];
function getVal(id) { const el = $(id); return el.type === "checkbox" ? el.checked : el.value; }
function setVal(id, v) { const el = $(id); if (el.type === "checkbox") el.checked = !!v; else el.value = v; }
function settings() {
  const o = {}; for (const id of SETTINGS) o[id] = getVal(id);
  for (const k of ["frameW", "frameH", "safeW", "size", "stroke", "maxChars", "posY", "minWord", "pvBoxOp"]) o[k] = parseFloat(o[k]) || 0;
  return o;
}
try {
  const saved = JSON.parse(localStorage.getItem("kc.settings") || "{}");
  for (const id of SETTINGS) if (saved[id] !== undefined) setVal(id, saved[id]);
  $("script").value = localStorage.getItem("kc.script") || "";
} catch (e) { }
for (const id of SETTINGS) $(id).addEventListener("input", () => { localStorage.setItem("kc.settings", JSON.stringify(settings())); onStyleChange(); });
$("script").addEventListener("input", () => localStorage.setItem("kc.script", $("script").value));

// ---------------- status ----------------
let lastStatus = ["start", null, ""];
const ui = {
  // key = translation key; plain = already-written text (error messages)
  status(key, vars, kind) { lastStatus = [key, vars, kind]; $("status").textContent = t(key, vars); $("status").className = kind || ""; },
  raw(text, kind) { lastStatus = [null, text, kind]; $("status").textContent = text; $("status").className = kind || ""; },
  // fn rebuilds the text, so it can be translated again when the language changes
  dyn(fn, kind) { lastStatus = [fn, null, kind]; $("status").textContent = fn(); $("status").className = kind || ""; },
  refresh() {
    if (typeof lastStatus[0] === "function") ui.dyn(lastStatus[0], lastStatus[2]);
    else if (lastStatus[0]) ui.status(lastStatus[0], lastStatus[1], lastStatus[2]);
  },
  progress(f) { $("prog").style.width = Math.max(0, Math.min(1, f)) * 100 + "%"; },
};

// ---------------- state ----------------
let audioFile = null, audioBytes = null;
let caps = [];          // [{s, e, words:[{w, t}]}]
let diffs = [];
let projectName = "captions";

// ---------------- file input ----------------
function loadFile(f) {
  if (!f) return;
  audioFile = f;
  projectName = f.name.replace(/\.[^.]+$/, "");
  $("fileName").textContent = f.name + " · " + (f.size / 1048576).toFixed(1) + " MB";
  $("drop").classList.add("ok");
  $("player").src = URL.createObjectURL(f);
  f.arrayBuffer().then((b) => { audioBytes = b; $("go").disabled = false; ui.status("ready"); });
}
$("file").addEventListener("change", (e) => loadFile(e.target.files[0]));
const drop = $("drop");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); loadFile(e.dataTransfer.files[0]); });

// ---------------- fonts ----------------
$("loadFonts").addEventListener("click", async () => {
  if (!window.queryLocalFonts) { ui.status("noFontApi"); return; }
  try {
    const fonts = await window.queryLocalFonts();
    const fams = [...new Set(fonts.map((f) => f.family))].sort();
    $("fontList").innerHTML = fams.map((f) => `<option value="${f.replace(/"/g, "&quot;")}">`).join("");
    ui.status("fontsAvailable", { n: fams.length });
  } catch (e) { ui.status("fontsError", { m: e.message }, "err"); }
});
const mctx = document.createElement("canvas").getContext("2d");
function fontCss(st, size) { return `${st.weight} ${size || st.size}px "${st.font}", sans-serif`; }
function measure(text, st) { mctx.font = fontCss(st); return mctx.measureText(text).width + st.stroke * 2; }
function fontAvailable(st) { try { return document.fonts.check(`${st.weight} ${st.size}px "${st.font}"`); } catch (e) { return true; } }

// ---------------- audio decode ----------------
async function decodeTo16k(buf) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await ctx.decodeAudioData(buf.slice(0));
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
  const out = await off.startRendering();
  ctx.close();
  return out.getChannelData(0);
}
function windows(audio) {      // <= 28 s windows cut at the quietest moment
  const SR = 16000, F = 320, frames = Math.floor(audio.length / F), rms = new Float32Array(frames);
  for (let f = 0; f < frames; f++) { let s = 0; for (let i = f * F; i < (f + 1) * F; i++) s += audio[i] * audio[i]; rms[f] = s; }
  const out = []; let start = 0;
  while (start < audio.length) {
    if (audio.length - start <= 28 * SR) { out.push([start, audio.length]); break; }
    const a = Math.floor((start + 18 * SR) / F), b = Math.min(frames, Math.floor((start + 28 * SR) / F));
    let best = a; for (let f = a; f < b; f++) if (rms[f] < rms[best]) best = f;
    const cut = best * F + F / 2; out.push([start, cut]); start = cut;
  }
  return out;
}

// ---------------- Whisper ----------------
let asr = null, asrKey = "";
async function loadModel(model, forceWasm) {
  const key = model + (forceWasm ? "|wasm" : "");
  if (asr && asrKey === key) return asr;
  const { pipeline, env } = await import(TRANSFORMERS);
  // A copy of the model in ./models/ (same site) is used first; otherwise it is downloaded once and cached.
  env.localModelPath = new URL("./models/", location.href).href;
  env.allowLocalModels = location.protocol.startsWith("http");
  env.allowRemoteModels = true;
  let gpu = false;
  if (!forceWasm) { try { gpu = !!(navigator.gpu && (await navigator.gpu.requestAdapter())); } catch (e) { } }
  const progress_callback = (p) => {
    if (p.status === "progress" && p.total) {
      ui.status("downloading", { a: Math.round(p.loaded / 1048576), b: Math.round(p.total / 1048576) });
      ui.progress(0.05 + 0.2 * (p.loaded / p.total));
    }
  };
  const tries = [];
  if (gpu) tries.push({ device: "webgpu", dtype: { encoder_model: "fp32", decoder_model_merged: "q4" } });
  tries.push({ device: "wasm", dtype: { encoder_model: "fp32", decoder_model_merged: "q8" } });
  tries.push({ device: "wasm", dtype: "fp32" });
  let err = null;
  for (const tr of tries) {
    try {
      ui.status("loadingModel", { d: tr.device });
      asr = await pipeline("automatic-speech-recognition", model, Object.assign({ progress_callback }, tr));
      asr._device = tr.device; asrKey = key;
      return asr;
    } catch (e) { err = e; console.warn(e); }
  }
  throw new Error(t("modelFail", { m: err && err.message }));
}
function wordsOf(result, off) {
  const out = [];
  for (const c of (result && result.chunks) || []) {
    const text = String(c.text || "").trim(); if (!text) continue;
    const ts = c.timestamp || [];
    const s = (ts[0] != null ? ts[0] : 0) + off;
    let e = (ts[1] != null ? ts[1] : (ts[0] || 0) + 0.3) + off;
    if (e < s) e = s + 0.1;
    out.push({ w: text, s: +s.toFixed(3), e: +e.toFixed(3) });
  }
  return out;
}
function timesLookBroken(ws) {
  if (ws.length < 4) return false;
  const uniq = new Set(ws.map((w) => w.s.toFixed(2)));
  return uniq.size < ws.length * 0.5;
}
async function transcribe(audio, st) {
  let pipe = await loadModel(st.model, false);
  const wins = windows(audio);
  let all = [];
  for (let i = 0; i < wins.length; i++) {
    const [a, b] = wins[i];
    ui.status("transcribing", { i: i + 1, n: wins.length }); ui.progress(0.25 + 0.6 * i / wins.length);
    await new Promise((r) => setTimeout(r, 30));
    const opts = { return_timestamps: "word", language: st.lang, task: "transcribe" };
    let ws = wordsOf(await pipe(audio.subarray(a, b), opts), a / 16000);
    if (pipe._device === "webgpu" && timesLookBroken(ws)) {     // known WebGPU issue with word times
      ui.status("retryCpu");
      pipe = await loadModel(st.model, true);
      ws = wordsOf(await pipe(audio.subarray(a, b), opts), a / 16000);
    }
    all = all.concat(ws);
  }
  const out = [];
  for (const w of all) { if (/^[\.,!\?;:]+$/.test(w.w) && out.length) out[out.length - 1].w += w.w; else out.push(w); }
  return out;
}

// ---------------- generate ----------------
$("go").addEventListener("click", async () => {
  const st = settings();
  $("go").disabled = true; ui.progress(0.02);
  try {
    ui.status("preparing");
    const audio = await decodeTo16k(audioBytes);
    const words = await transcribe(audio, st);
    if (!words.length) throw new Error(t("emptyTranscript"));
    buildFromWords(words, st);
  } catch (e) {
    console.error(e); ui.raw(e.message || String(e), "err");
  } finally { $("go").disabled = !audioBytes; }
});
function buildFromWords(words, st) {
    st = st || settings();
    diffs = [];
    const script = $("script").value.trim();
    if (script) { const r = K.alignToScript(words, script); words = r.words; diffs = r.diffs; }
    caps = K.autoChunk(words, st.maxChars, 0, { measure: (t) => measure(t, st), maxWidth: st.safeW })
      .map((c) => ({ s: c.s, e: c.e, words: c.words.map((w) => ({ w: w.w, t: w.t })) }));
    renderCaps(); renderDiffs();
    ui.progress(1);
    const nC = caps.length, nD = diffs.length, fontOk = fontAvailable(st), fnt = st.font;
    ui.dyn(() => t("done", { n: nC }) + (nD ? t("checkDiffs") : "") + (fontOk ? "" : "\n" + t("fontMissing", { f: fnt })), "ok");
    setExports(true);
}
window.__kcBuildFromWords = buildFromWords;   // used by the automated tests

// ---------------- editor ----------------
const fmt = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1); };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const capText = (c) => c.words.map((w) => w.w).join(" ");

function renderCaps() {
  const st = settings();
  $("nCaps").textContent = caps.length ? "(" + caps.length + ")" : "";
  $("caps").innerHTML = caps.map((c, i) => {
    const over = measure(capText(c), st) > st.safeW;
    return `<div class="cap" data-i="${i}">
      <span class="t" title="${esc(t("listen"))}">${fmt(c.s)}</span>
      <input value="${esc(capText(c))}" class="${over ? "over" : ""}" title="${over ? esc(t("over")) : ""}">
      <span class="tools">
        <button data-a="split" title="${esc(t("split"))}">✂</button>
        <button data-a="merge" title="${esc(t("merge"))}">⤓</button>
        <button data-a="del" title="${esc(t("del"))}">✕</button>
      </span></div>`;
  }).join("");
}
function retime(c, newWords) {
  const old = c.words;
  if (newWords.length === old.length) { c.words = newWords.map((w, i) => ({ w, t: old[i].t })); return; }
  const tmp = { s: c.s, e: c.e, words: newWords.map((w, i) => ({ w, t: i === 0 ? c.s : null })) };
  K.fillTimes(tmp);
  c.words = tmp.words;
}
$("caps").addEventListener("change", (e) => {
  if (e.target.tagName !== "INPUT") return;
  const i = +e.target.closest(".cap").dataset.i;
  const ws = K.splitWords(e.target.value);
  if (!ws.length) { caps.splice(i, 1); } else retime(caps[i], ws);
  renderCaps(); drawFrame();
});
$("caps").addEventListener("click", (e) => {
  const row = e.target.closest(".cap"); if (!row) return;
  const i = +row.dataset.i, c = caps[i];
  if (e.target.classList.contains("t")) { $("player").currentTime = c.s; $("player").play(); return; }
  const a = e.target.dataset.a; if (!a) return;
  if (a === "del") caps.splice(i, 1);
  if (a === "merge" && caps[i + 1]) { const n = caps[i + 1]; c.words = c.words.concat(n.words); c.e = n.e; caps.splice(i + 1, 1); }
  if (a === "split") {
    const input = row.querySelector("input"), pos = input.selectionStart || 0;
    const before = K.splitWords(input.value.substring(0, pos)).length;
    if (before > 0 && before < c.words.length) {
      const second = { s: c.words[before].t, e: c.e, words: c.words.slice(before) };
      c.words = c.words.slice(0, before); c.e = second.s;
      caps.splice(i + 1, 0, second);
    }
  }
  renderCaps(); drawFrame();
});
function renderDiffs() {
  $("nDiffs").textContent = diffs.length ? "(" + diffs.length + ")" : "";
  const label = { fixed: t("fixed"), changed: t("changed") };
  $("diffs").innerHTML = diffs.length ? diffs.map((d) =>
    `<div class="diff"><span class="t" data-t="${d.t}">${fmt(d.t)}</span>${label[d.type] || d.type}: ` +
    (d.heard ? `<span class="heard">${esc(d.heard)}</span>` : "<i>" + t("notSaid") + "</i>") + " → " +
    (d.script ? `<span class="script">${esc(d.script)}</span>` : "<i>" + t("notInScript") + "</i>") + "</div>").join("")
    : '<p class="hint">' + ($("script").value.trim() && caps.length ? t("noDiffs") : t("diffsHint")) + "</p>";
}
$("diffs").addEventListener("click", (e) => { const t = e.target.dataset.t; if (t) { $("player").currentTime = +t; $("player").play(); } });

// ---------------- preview ----------------
const cv = $("cv"), ctx = cv.getContext("2d");
let bgImg = null, overlayImg = null;
function loadImg(input, cb) { input.addEventListener("change", (e) => { const f = e.target.files[0]; if (!f) return; const im = new Image(); im.onload = () => { cb(im); drawFrame(); }; im.src = URL.createObjectURL(f); }); }
loadImg($("pvBg"), (im) => bgImg = im);
loadImg($("pvOverlay"), (im) => overlayImg = im);
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
function activeIndex(c, t) { let k = -1; for (let i = 0; i < c.words.length; i++) if (t >= c.words[i].t) k = i; return k; }
function drawFrame() {
  const st = settings();
  if (cv.width !== st.frameW || cv.height !== st.frameH) { cv.width = st.frameW || 1080; cv.height = st.frameH || 1920; }
  const W = cv.width, H = cv.height, t = $("player").currentTime || 0;
  ctx.clearRect(0, 0, W, H);
  if (bgImg) { const r = Math.max(W / bgImg.width, H / bgImg.height); ctx.drawImage(bgImg, (W - bgImg.width * r) / 2, (H - bgImg.height * r) / 2, bgImg.width * r, bgImg.height * r); }
  else { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#3b4250"); g.addColorStop(1, "#1d2128"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  if (st.pvGuides) {
    ctx.strokeStyle = "rgba(255,208,0,.55)"; ctx.setLineDash([12, 10]); ctx.lineWidth = 2;
    const x0 = (W - st.safeW) / 2; ctx.strokeRect(x0, 0, st.safeW, H); ctx.setLineDash([]);
  }
  const ci = caps.findIndex((c) => t >= c.s && t < c.e);
  document.querySelectorAll(".cap.active").forEach((el) => el.classList.remove("active"));
  if (ci >= 0) {
    const row = document.querySelector(`.cap[data-i="${ci}"]`); if (row) row.classList.add("active");
    const c = caps[ci], k = activeIndex(c, t);
    ctx.font = fontCss(st); ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    const space = ctx.measureText(" ").width;
    const widths = c.words.map((w) => ctx.measureText(w.w).width);
    const total = widths.reduce((a, b) => a + b, 0) + space * (c.words.length - 1);
    const scale = total + st.stroke * 2 > st.safeW ? st.safeW / (total + st.stroke * 2) : 1;
    ctx.save(); ctx.translate(W / 2, st.posY); ctx.scale(scale, scale);
    if (st.pvBox) {
      const padX = st.size * 0.35, padY = st.size * 0.25;
      ctx.fillStyle = hexA(st.pvBoxColor, st.pvBoxOp / 100);
      ctx.fillRect(-total / 2 - padX, -st.size * 0.6 - padY, total + padX * 2, st.size * 1.2 + padY * 2);
    }
    let x = -total / 2;
    c.words.forEach((w, i) => {
      const on = st.mode === "progressive" ? i <= k : i === k;
      if (st.pvShadow) { ctx.shadowColor = hexA(st.pvShadowColor, 0.6); ctx.shadowBlur = st.size * 0.15; ctx.shadowOffsetX = ctx.shadowOffsetY = st.size * 0.06; }
      if (st.stroke > 0) { ctx.strokeStyle = st.pvStroke; ctx.lineWidth = st.stroke * 2; ctx.strokeText(w.w, x, 0); }
      ctx.shadowColor = "transparent";
      ctx.fillStyle = on ? st.hl : (st.useBase ? st.base : st.pvFill);
      ctx.fillText(w.w, x, 0);
      x += widths[i] + space;
    });
    ctx.restore();
  }
  if (overlayImg) ctx.drawImage(overlayImg, 0, 0, W, H);
}
function onStyleChange() { if (caps.length) renderCaps(); drawFrame(); }
(function loop() { if (!$("player").paused) drawFrame(); requestAnimationFrame(loop); })();
$("player").addEventListener("seeked", drawFrame);
drawFrame();

// ---------------- export ----------------
function ts(x) {
  const ms = Math.round(Math.max(0, x) * 1000), p = (n, l) => String(n).padStart(l, "0");
  return p(Math.floor(ms / 3600000), 2) + ":" + p(Math.floor(ms / 60000) % 60, 2) + ":" + p(Math.floor(ms / 1000) % 60, 2) + "," + p(ms % 1000, 3);
}
const tagColor = (hex) => "#" + hex.slice(1).toUpperCase() + "FF";
function karaokeSRT() {
  const st = settings(), out = [], minW = (st.minWord || 0) / 1000;
  let n = 0;
  for (const c of caps) {
    // word segments, merging any that are too short into the previous one
    const segs = [];
    c.words.forEach((w, i) => {
      const s = i === 0 ? c.s : Math.max(c.s, w.t), e = i + 1 < c.words.length ? Math.max(s, c.words[i + 1].t) : c.e;
      if (e - s < minW && segs.length) segs[segs.length - 1].e = e; else segs.push({ s, e, k: i });
    });
    for (const sg of segs) {
      if (sg.e - sg.s < 0.001) continue;
      const txt = c.words.map((w, i) => {
        const on = st.mode === "progressive" ? i <= sg.k : i === sg.k;
        if (on) return `<font color=${tagColor(st.hl)}>${w.w}</font>`;
        return st.useBase ? `<font color=${tagColor(st.base)}>${w.w}</font>` : w.w;
      }).join(" ");
      out.push((++n) + "\n" + ts(sg.s) + " --> " + ts(sg.e) + "\n" + txt + "\n");
    }
  }
  return "﻿" + out.join("\n");
}
function plainSRT() {
  return "﻿" + caps.map((c, i) => (i + 1) + "\n" + ts(c.s) + " --> " + ts(c.e) + "\n" + capText(c) + "\n").join("\n");
}
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain;charset=utf-8" }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function setExports(on) { for (const id of ["expKaraoke", "expPlain", "saveProject"]) $(id).disabled = !on; }
$("expKaraoke").addEventListener("click", () => download(projectName + "_karaoke.srt", karaokeSRT()));
$("expPlain").addEventListener("click", () => download(projectName + ".srt", plainSRT()));
$("saveProject").addEventListener("click", () => download(projectName + ".karaoke.json",
  JSON.stringify({ app: "karaoke-captions", version: 1, name: projectName, settings: settings(), script: $("script").value, caps, diffs }, null, 1), "application/json"));
$("openProject").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const p = JSON.parse(await f.text());
    if (p.app !== "karaoke-captions") throw new Error(t("notProject"));
    for (const id of SETTINGS) if (p.settings && p.settings[id] !== undefined) setVal(id, p.settings[id]);
    $("script").value = p.script || ""; caps = p.caps || []; diffs = p.diffs || []; projectName = p.name || "captions";
    renderCaps(); renderDiffs(); setExports(true); drawFrame();
    ui.status("projectOpened", null, "ok");
  } catch (err) { ui.raw(err.message, "err"); }
});

// ---------------- interface language ----------------
$("uiLang").value = window.I18N.lang;
$("uiLang").addEventListener("change", (e) => window.I18N.setLang(e.target.value));
document.addEventListener("kc-lang", () => {
  ui.refresh(); renderDiffs(); if (caps.length) renderCaps();
  if (audioFile) $("fileName").textContent = audioFile.name + " · " + (audioFile.size / 1048576).toFixed(1) + " MB";
});
ui.status("start");
