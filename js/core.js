// ============================================================
// KARAOKE CORE (ES3: runs in ExtendScript, browsers and Node)
// Parses SRT, "karaoke SRT" (words tagged as {12.345}word) and
// Premiere Pro transcript JSON, and builds captions with
// per-word start times.
// ============================================================
var KCore = (function () {

    // ---------- small helpers (no ES5 in ExtendScript) ----------
    function trim(s) { return String(s).replace(/^\s+|\s+$/g, ""); }
    function round3(n) { return Math.round(n * 1000) / 1000; }
    function isPunct(s) { return /^[\.,!\?;:…—\-"'\)\]]+$/.test(s); }
    function norm(w) { return String(w).toLowerCase().replace(/[^a-z0-9']/g, ""); }
    function splitWords(text) {
        var parts = trim(text.replace(/\r\n|\r|\n/g, " ")).split(/\s+/), out = [], i;
        for (i = 0; i < parts.length; i++) { if (parts[i] !== "") out.push(parts[i]); }
        return out;
    }

    // ---------- minimal JSON parser (ExtendScript has no JSON) ----------
    function parseJSON(src) {
        var i = 0, s = String(src);
        if (s.charCodeAt(0) === 0xFEFF) i = 1;
        function ws() { while (i < s.length && /\s/.test(s.charAt(i))) i++; }
        function err(m) { throw new Error("JSON error at " + i + ": " + m); }
        function val() {
            ws();
            var c = s.charAt(i);
            if (c === "{") return obj();
            if (c === "[") return arr();
            if (c === '"') return str();
            if (c === "t" && s.substr(i, 4) === "true") { i += 4; return true; }
            if (c === "f" && s.substr(i, 5) === "false") { i += 5; return false; }
            if (c === "n" && s.substr(i, 4) === "null") { i += 4; return null; }
            return num();
        }
        function num() {
            var m = /^-?\d+(\.\d+)?([eE][+\-]?\d+)?/.exec(s.substr(i, 40));
            if (!m) err("bad value");
            i += m[0].length; return parseFloat(m[0]);
        }
        function str() {
            var out = "", c; i++;
            while (i < s.length) {
                c = s.charAt(i++);
                if (c === '"') return out;
                if (c === "\\") {
                    c = s.charAt(i++);
                    if (c === "n") out += "\n"; else if (c === "t") out += "\t";
                    else if (c === "r") out += "\r"; else if (c === "b") out += "\b";
                    else if (c === "f") out += "\f";
                    else if (c === "u") { out += String.fromCharCode(parseInt(s.substr(i, 4), 16)); i += 4; }
                    else out += c;
                } else out += c;
            }
            err("unterminated string");
        }
        function arr() {
            var a = []; i++; ws();
            if (s.charAt(i) === "]") { i++; return a; }
            while (true) {
                a.push(val()); ws();
                if (s.charAt(i) === ",") { i++; continue; }
                if (s.charAt(i) === "]") { i++; return a; }
                err("expected , or ]");
            }
        }
        function obj() {
            var o = {}, k; i++; ws();
            if (s.charAt(i) === "}") { i++; return o; }
            while (true) {
                ws(); if (s.charAt(i) !== '"') err("expected key");
                k = str(); ws();
                if (s.charAt(i) !== ":") err("expected :");
                i++; o[k] = val(); ws();
                if (s.charAt(i) === ",") { i++; continue; }
                if (s.charAt(i) === "}") { i++; return o; }
                err("expected , or }");
            }
        }
        return val();
    }

    // ---------- SRT ----------
    function parseTime(t) {
        var m = /(\d+):(\d+):(\d+)[,\.](\d+)/.exec(t);
        if (!m) return null;
        return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + parseFloat("0." + m[4]);
    }

    // Returns [{s, e, text, words:[{w, t}]}]; t is null when the word has no tag.
    function parseSRT(src) {
        var txt = String(src).replace(/^﻿/, "").replace(/\r\n|\r/g, "\n");
        var chunks = txt.split(/\n\s*\n/), caps = [], c, lines, j, tl, m, textLines, k, toks, words, tm;
        for (c = 0; c < chunks.length; c++) {
            lines = trim(chunks[c]).split("\n");
            tl = -1;
            for (j = 0; j < lines.length && j < 3; j++) { if (lines[j].indexOf("-->") >= 0) { tl = j; break; } }
            if (tl < 0) continue;
            m = lines[tl].split("-->");
            textLines = [];
            for (j = tl + 1; j < lines.length; j++) {
                var L = trim(lines[j].replace(/<[^>]+>/g, ""));
                if (L !== "") textLines.push(L);
            }
            if (!textLines.length) continue;
            words = [];
            var display = [];
            for (k = 0; k < textLines.length; k++) {
                toks = splitWords(textLines[k]);
                var clean = [];
                for (j = 0; j < toks.length; j++) {
                    tm = /^\{(-?[\d\.]+)\}(.*)$/.exec(toks[j]);
                    if (tm && tm[2] !== "") { words.push({ w: tm[2], t: parseFloat(tm[1]) }); clean.push(tm[2]); }
                    else if (tm) { continue; }
                    else { words.push({ w: toks[j], t: null }); clean.push(toks[j]); }
                }
                display.push(clean.join(" "));
            }
            caps.push({ s: parseTime(m[0]), e: parseTime(m[1]), text: display.join("\r"), words: words });
        }
        return caps;
    }

    // ---------- transcript JSON (Premiere export, Whisper-style, etc.) ----------
    // Collects every object that has a text-ish key and a start time.
    function collectWords(node, out) {
        var k, i;
        if (node instanceof Array) { for (i = 0; i < node.length; i++) collectWords(node[i], out); return; }
        if (!node || typeof node !== "object") return;
        var text = node.text !== undefined ? node.text : (node.word !== undefined ? node.word : node.value);
        var hasWordsChild = node.words instanceof Array && node.words.length;
        if (!hasWordsChild && typeof text === "string" && typeof node.start === "number") {
            var end = typeof node.end === "number" ? node.end :
                (typeof node.duration === "number" ? node.start + node.duration : null);
            var type = node.type ? String(node.type) : "";
            out.push({ w: text, s: node.start, e: end, punct: /punct/i.test(type) });
            return;
        }
        for (k in node) { if (node.hasOwnProperty(k)) collectWords(node[k], out); }
    }

    function parseTranscriptJSON(src) {
        var data = parseJSON(src), raw = [], words = [], i, scale = 1, maxT = 0, w;
        collectWords(data, raw);
        for (i = 0; i < raw.length; i++) { if (raw[i].s > maxT) maxT = raw[i].s; }
        if (maxT > 1e9) scale = 1 / 254016000000;          // Adobe ticks
        else if (maxT > 20000) scale = 1 / 1000;           // milliseconds
        raw.sort(function (a, b) { return a.s - b.s; });
        for (i = 0; i < raw.length; i++) {
            w = trim(raw[i].w);
            if (w === "") continue;
            var s = raw[i].s * scale, e = raw[i].e === null ? null : raw[i].e * scale;
            if ((raw[i].punct || isPunct(w)) && words.length) {   // glue punctuation to the previous word
                words[words.length - 1].w += w;
                continue;
            }
            // a JSON "word" may contain spaces (segment text): split it evenly
            var parts = splitWords(w), p, dur = (e !== null ? e - s : 0.3 * parts.length);
            for (p = 0; p < parts.length; p++) {
                words.push({ w: parts[p], s: round3(s + dur * p / parts.length), e: round3(s + dur * (p + 1) / parts.length) });
            }
        }
        for (i = 0; i < words.length; i++) {           // fill missing ends
            if (words[i].e === null || isNaN(words[i].e)) words[i].e = (i + 1 < words.length) ? words[i + 1].s : words[i].s + 0.3;
        }
        return words;
    }

    // ---------- timing ----------
    // Gives every word in a caption a start time. Tagged/known times are kept;
    // the rest are spread by word length between the known neighbours.
    function fillTimes(cap) {
        var W = cap.words, n = W.length, i, j, a, b, ta, tb, tot, acc;
        if (!n) return cap;
        var speechEnd = cap.e - Math.min(0.15, (cap.e - cap.s) * 0.1);
        if (W[0].t === null || W[0].t < cap.s) W[0].t = W[0].t === null ? cap.s : W[0].t;
        i = 0;
        while (i < n) {
            if (W[i].t !== null) { i++; continue; }
            a = i - 1; b = i;
            while (b < n && W[b].t === null) b++;
            ta = W[a].t;
            tb = (b < n) ? W[b].t : speechEnd;
            tot = 0;
            for (j = a; j < b; j++) tot += W[j].w.length + 2;
            acc = W[a].w.length + 2;
            for (j = i; j < b; j++) { W[j].t = round3(ta + (tb - ta) * acc / tot); acc += W[j].w.length + 2; }
            i = b;
        }
        for (i = 1; i < n; i++) { if (W[i].t < W[i - 1].t) W[i].t = W[i - 1].t; }
        return cap;
    }

    // Matches SRT captions with transcript word times (handles edited words).
    function mergeWithTranscript(caps, tw, offset) {
        var c, i, k, cap, used = 0;
        for (c = 0; c < caps.length; c++) {
            cap = caps[c];
            var lo = cap.s - offset - 0.6, hi = cap.e - offset + 0.3;
            while (used < tw.length && tw[used].s < lo) used++;
            k = used;
            for (i = 0; i < cap.words.length; i++) {
                if (cap.words[i].t !== null) continue;
                var target = norm(cap.words[i].w), look;
                for (look = k; look < tw.length && tw[look].s <= hi && look < k + 4; look++) {
                    if (norm(tw[look].w) === target && target !== "") {
                        cap.words[i].t = round3(Math.max(cap.s, Math.min(cap.e, tw[look].s + offset)));
                        k = look + 1;
                        break;
                    }
                }
            }
            used = Math.max(used, k);
            fillTimes(cap);
        }
        return caps;
    }

    // Finds the time offset between SRT (sequence time) and transcript (clip time).
    function guessOffset(caps, tw) {
        var cands = [0], c, i, best = 0, bestScore = -1;
        for (c = 0; c < Math.min(3, caps.length); c++) {
            if (!caps[c].words.length) continue;
            var f = norm(caps[c].words[0].w);
            for (i = 0; i < tw.length; i++) { if (norm(tw[i].w) === f) cands.push(round3(caps[c].s - tw[i].s)); }
        }
        for (c = 0; c < cands.length; c++) {
            var score = 0, j, p = 0;
            for (i = 0; i < caps.length; i++) {
                if (!caps[i].words.length) continue;
                var target = norm(caps[i].words[0].w);
                for (j = p; j < tw.length; j++) {
                    if (Math.abs(tw[j].s + cands[c] - caps[i].s) < 0.35 && norm(tw[j].w) === target) { score++; p = j; break; }
                    if (tw[j].s + cands[c] > caps[i].s + 0.5) break;
                }
            }
            if (score > bestScore) { bestScore = score; best = cands[c]; }
        }
        return best;
    }

    // Builds captions straight from transcript words (no SRT).
    var WEAK = { "a": 1, "an": 1, "the": 1, "and": 1, "or": 1, "but": 1, "to": 1, "of": 1, "for": 1, "with": 1, "in": 1, "on": 1, "at": 1, "your": 1, "my": 1, "our": 1, "their": 1, "his": 1, "her": 1, "its": 1, "you": 1, "i": 1, "if": 1, "is": 1, "are": 1, "be": 1, "by": 1, "from": 1, "that": 1, "this": 1, "it": 1, "can": 1, "could": 1, "will": 1, "into": 1, "as": 1, "before": 1, "after": 1, "until": 1, "when": 1, "where": 1, "what": 1, "who": 1, "which": 1, "so": 1, "than": 1, "more": 1, "most": 1, "very": 1, "don't": 1, "not": 1, "no": 1, "all": 1, "any": 1, "some": 1, "every": 1, "just": 1, "about": 1, "credit": 1, "bank": 1, "data": 1, "may": 1, "might": 1, "must": 1, "should": 1, "would": 1, "have": 1, "has": 1, "had": 1, "been": 1, "was": 1, "were": 1, "do": 1, "does": 1, "did": 1, "how": 1, "why": 1, "these": 1, "those": 1, "here": 0, "card": 0 };
    var STARTERS = { "and": 1, "or": 1, "but": 1, "to": 1, "for": 1, "with": 1, "before": 1, "after": 1, "until": 1, "if": 1, "when": 1, "on": 1, "in": 1, "into": 1, "by": 1, "from": 1, "that": 1, "which": 1, "putting": 1, "giving": 1, "including": 1, "because": 1, "so": 1, "while": 1 };
    // Splits transcript words into caption lines. Hard breaks at sentence ends
    // and pauses; inside each phrase a small optimizer picks line breaks that
    // keep lines near the limit and avoid ending on weak words.
    // opts (optional): {measure: function(text) -> px, maxWidth: px}
    function autoChunk(tw, maxChars, offset, opts) {
        maxChars = maxChars || 26; offset = offset || 0; opts = opts || {};
        var measure = opts.measure, maxW = opts.maxWidth;
        var caps = [], phrases = [], cur = [], i;
        // merge "24" + "-7" / "/7" style tokens
        var W = [];
        for (i = 0; i < tw.length; i++) {
            if (W.length && /^[\-\/]\d/.test(tw[i].w) && /\d$/.test(W[W.length - 1].w)) {
                W[W.length - 1] = { w: W[W.length - 1].w + "/" + tw[i].w.substr(1), s: W[W.length - 1].s, e: tw[i].e };
            } else W.push(tw[i]);
        }
        for (i = 0; i < W.length; i++) {
            cur.push(W[i]);
            var next = W[i + 1], gap = next ? next.s - W[i].e : 99;
            if (/[\.!\?]["']?$/.test(W[i].w) || gap > 0.45) { phrases.push(cur); cur = []; }
        }
        if (cur.length) phrases.push(cur);
        function lineCost(ws, a, b) {     // words a..b-1 as one line
            var len = -1, k, txt = [];
            for (k = a; k < b; k++) { len += ws[k].w.length + 1; txt.push(ws[k].w); }
            var c = 4;                                   // each extra line costs
            if (measure && maxW) {
                var px = measure(txt.join(" "));
                if (px > maxW && b - a > 1) return 1e9;  // never past the margins
                c += Math.pow(1 - Math.min(px, maxW) / maxW, 2) * 6;
                if (len > maxChars + 3) c += (len - maxChars) * 3;   // soft limit for readability
            } else {
                if (len > maxChars + 3) return 1e9;
                c += len > maxChars ? (len - maxChars) * 3 : Math.pow((maxChars - len) / maxChars, 2) * 6;
            }
            var last = ws[b - 1].w, lastKey = norm(last);
            if (b < ws.length) {
                if (WEAK[lastKey]) c += 6;
                if (/[,;:]$/.test(last)) c -= 3;
                if (b - a === 1) c += 3;                     // lonely word
                if (len < 10 && !(measure && maxW && b - a > 1)) c += 4;                        // very short line
                var nk = norm(ws[b].w);
                if (STARTERS[nk]) c -= 2.5;                  // natural break before "and", "to", ...
                if (nk === "you" && !/[,;:]$/.test(last)) c += 4;   // "tells / you"
            }
            if (b === ws.length && b - a === 1 && a > 0) c += 5;   // orphan at the end
            return c;
        }
        for (var p = 0; p < phrases.length; p++) {
            var ws = phrases[p], n = ws.length, best = [0], from = [0], b, a;
            for (b = 1; b <= n; b++) {
                best[b] = 1e18;
                for (a = Math.max(0, b - 12); a < b; a++) {
                    var v = best[a] + lineCost(ws, a, b);
                    if (v < best[b]) { best[b] = v; from[b] = a; }
                }
            }
            var cuts = [], x = n;
            while (x > 0) { cuts.push([from[x], x]); x = from[x]; }
            cuts.reverse();
            for (var c = 0; c < cuts.length; c++) {
                var words = [], txt = [], j;
                for (j = cuts[c][0]; j < cuts[c][1]; j++) { words.push({ w: ws[j].w, t: round3(ws[j].s + offset) }); txt.push(ws[j].w); }
                caps.push({ s: round3(ws[cuts[c][0]].s + offset), e: round3(ws[cuts[c][1] - 1].e + offset), text: txt.join(" "), words: words });
            }
        }
        for (i = 0; i < caps.length; i++) {
            var nx = caps[i + 1] ? caps[i + 1].s : caps[i].e + 1;
            caps[i].e = (nx - caps[i].e < 0.35) ? nx : Math.min(caps[i].e + 0.15, nx);
            caps[i].e = round3(caps[i].e);
        }
        return caps;
    }

    // ---------- output ----------
    function fmtTime(x) {
        var ms = Math.round(Math.max(0, x) * 1000);
        function p(n, l) { n = String(n); while (n.length < l) n = "0" + n; return n; }
        return p(Math.floor(ms / 3600000), 2) + ":" + p(Math.floor(ms / 60000) % 60, 2) + ":" + p(Math.floor(ms / 1000) % 60, 2) + "," + p(ms % 1000, 3);
    }
    // tagged = true writes {time}word so word timing survives copy/paste.
    function toSRT(caps, tagged) {
        var out = [], c, i, cap, lineWords, li, lines;
        for (c = 0; c < caps.length; c++) {
            cap = caps[c];
            lines = String(cap.text).split("\r");
            var outLines = [], wi = 0;
            for (li = 0; li < lines.length; li++) {
                lineWords = splitWords(lines[li]);
                var parts = [];
                for (i = 0; i < lineWords.length; i++, wi++) {
                    var wd = cap.words[wi];
                    parts.push(tagged && wd && wd.t !== null ? "{" + wd.t.toFixed(2) + "}" + wd.w : (wd ? wd.w : lineWords[i]));
                }
                outLines.push(parts.join(" "));
            }
            out.push((c + 1) + "\n" + fmtTime(cap.s) + " --> " + fmtTime(cap.e) + "\n" + outLines.join("\n") + "\n");
        }
        return out.join("\n");
    }

    // One call for every UI: srtText and/or jsonText -> captions with word times.
    // opts: {offset: number|null (null = auto), maxChars: number}
    function build(srtText, jsonText, opts) {
        opts = opts || {};
        var caps = null, tw = null, offset = (opts.offset === null || opts.offset === undefined) ? null : opts.offset, i, info = "";
        if (jsonText) tw = parseTranscriptJSON(jsonText);
        if (srtText) {
            caps = parseSRT(srtText);
            if (!caps.length) throw new Error("No captions found in the SRT.");
            if (tw && tw.length) {
                if (offset === null) offset = guessOffset(caps, tw);
                mergeWithTranscript(caps, tw, offset);
                info = "SRT + transcript (offset " + offset + " s)";
            } else {
                for (i = 0; i < caps.length; i++) fillTimes(caps[i]);
                info = "SRT only: word times estimated inside each caption";
            }
        } else if (tw && tw.length) {
            caps = autoChunk(tw, opts.maxChars, offset || 0);
            info = "Transcript only: captions auto-split at " + (opts.maxChars || 26) + " characters";
        } else throw new Error("Load an SRT and/or a transcript JSON.");
        return { captions: caps, info: info, offset: offset || 0 };
    }

    // ---------- script alignment ----------
    // Uses the brief's script to fix recognition errors while keeping the
    // transcript's timing. Where the speaker said something different from
    // the script, the audio wins and the difference is reported.
    var NUMS = { "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten", "11": "eleven", "12": "twelve", "20": "twenty", "24": "twentyfour" };
    function key(w) {
        var k = norm(w);
        if (NUMS[k]) k = NUMS[k];
        return k;
    }
    function similar(a, b) {      // cheap edit-distance ratio
        if (a === b) return 1;
        if (!a || !b) return 0;
        var m = a.length, n = b.length, d = [], i, j;
        for (i = 0; i <= m; i++) { d[i] = [i]; }
        for (j = 0; j <= n; j++) d[0][j] = j;
        for (i = 1; i <= m; i++) for (j = 1; j <= n; j++)
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
        return 1 - d[m][n] / Math.max(m, n);
    }
    function scriptTokens(script) {
        var lines = String(script).replace(/\r\n|\r/g, "\n").split("\n"), out = [], i, j, toks;
        for (i = 0; i < lines.length; i++) {
            // drop list markers like "1:" "2." at the start of a line
            var L = lines[i].replace(/^\s*(\d+)\s*[:\.\)]\s+/, "");
            toks = splitWords(L);
            for (j = 0; j < toks.length; j++) {
                var t = toks[j].replace(/^[“”"\(\[]+/, "").replace(/[“”"\)\]]+$/, "");
                if (t !== "" && !isPunct(t)) out.push(t.replace(/[’]/g, "'"));
            }
        }
        return out;
    }
    // tw: [{w,s,e}] transcript words. Returns {words:[{w,s,e,flag}], diffs:[...]}
    function alignToScript(tw, script) {
        var S = scriptTokens(script), n = tw.length, m = S.length, i, j;
        if (!m || !n) return { words: tw, diffs: [] };
        var TK = [], SK = [];
        for (i = 0; i < n; i++) TK.push(key(tw[i].w));
        for (j = 0; j < m; j++) SK.push(key(S[j]));
        // DP over word sequences (Needleman-Wunsch). Banded for long texts.
        var band = Math.max(60, Math.abs(n - m) + 40), INF = 1e9, D = [], P = [];
        for (i = 0; i <= n; i++) { D[i] = []; P[i] = []; }
        for (i = 0; i <= n; i++) {
            var c = Math.round(i * m / n), lo = Math.max(0, c - band), hi = Math.min(m, c + band);
            for (j = 0; j <= m; j++) {
                if (j < lo || j > hi) { D[i][j] = INF; continue; }
                if (i === 0 && j === 0) { D[0][0] = 0; P[0][0] = 0; continue; }
                var best = INF, p = 0, v;
                if (i > 0 && j > 0 && D[i - 1][j - 1] < INF) {
                    var sim = similar(TK[i - 1], SK[j - 1]);
                    v = D[i - 1][j - 1] + (sim === 1 ? 0 : (sim >= 0.6 ? 0.6 : 1.4));
                    if (v < best) { best = v; p = 1; }
                }
                if (i > 0 && D[i - 1][j] < INF) { v = D[i - 1][j] + 1; if (v < best) { best = v; p = 2; } }   // extra spoken word
                if (j > 0 && D[i][j - 1] < INF) { v = D[i][j - 1] + 1; if (v < best) { best = v; p = 3; } }   // script word not spoken
                D[i][j] = best; P[i][j] = p;
            }
        }
        var ops = []; i = n; j = m;
        while (i > 0 || j > 0) {
            var op = P[i][j];
            if (op === 1) { ops.push([i - 1, j - 1]); i--; j--; }
            else if (op === 2) { ops.push([i - 1, -1]); i--; }
            else { ops.push([-1, j - 1]); j--; }
        }
        ops.reverse();
        var words = [], diffs = [], k;
        for (k = 0; k < ops.length; k++) {
            var ti = ops[k][0], si = ops[k][1];
            if (ti >= 0 && si >= 0) {
                var sm = similar(TK[ti], SK[si]);
                // a 1-to-1 swap between two exact matches is most likely a recognition error
                var prevOk = k > 0 && ops[k - 1][0] >= 0 && ops[k - 1][1] >= 0 && TK[ops[k - 1][0]] === SK[ops[k - 1][1]];
                var nextOk = k + 1 < ops.length && ops[k + 1][0] >= 0 && ops[k + 1][1] >= 0 && TK[ops[k + 1][0]] === SK[ops[k + 1][1]];
                if (sm === 1 || sm >= 0.6 || (prevOk && nextOk)) {
                    // same word (or a misrecognition of it): script spelling, audio timing
                    words.push({ w: S[si], s: tw[ti].s, e: tw[ti].e });
                    if (sm < 1) diffs.push({ t: tw[ti].s, type: "fixed", heard: tw[ti].w, script: S[si] });
                } else {
                    // a different word: keep what was said, report it
                    words.push({ w: tw[ti].w, s: tw[ti].s, e: tw[ti].e, flag: 1 });
                    diffs.push({ t: tw[ti].s, type: "changed", heard: tw[ti].w, script: S[si] });
                }
            } else if (ti >= 0) {
                words.push({ w: tw[ti].w, s: tw[ti].s, e: tw[ti].e, flag: 1 });
                diffs.push({ t: tw[ti].s, type: "extra", heard: tw[ti].w, script: "" });
            } else {
                var near = words.length ? words[words.length - 1].e : 0;
                diffs.push({ t: near, type: "missing", heard: "", script: S[si] });
            }
        }
        return { words: words, diffs: mergeDiffs(diffs) };
    }
    // Groups consecutive differences into phrases for a readable report.
    function mergeDiffs(d) {
        var out = [], i, cur = null;
        for (i = 0; i < d.length; i++) {
            if (d[i].type === "fixed") { cur = null; out.push(d[i]); continue; }
            if (cur && d[i].t - cur.t2 < 1.2) {
                if (d[i].heard) cur.heard += (cur.heard ? " " : "") + d[i].heard;
                if (d[i].script) cur.script += (cur.script ? " " : "") + d[i].script;
                cur.t2 = d[i].t;
            } else {
                cur = { t: d[i].t, t2: d[i].t, type: "changed", heard: d[i].heard, script: d[i].script };
                out.push(cur);
            }
        }
        return out;
    }

    return {
        alignToScript: alignToScript, scriptTokens: scriptTokens,
        parseJSON: parseJSON, parseSRT: parseSRT, parseTranscriptJSON: parseTranscriptJSON,
        fillTimes: fillTimes, mergeWithTranscript: mergeWithTranscript, guessOffset: guessOffset,
        autoChunk: autoChunk, toSRT: toSRT, build: build, splitWords: splitWords
    };
})();
if (typeof module !== "undefined") module.exports = KCore;
