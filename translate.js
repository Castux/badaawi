// ── Translation assistant tab ────────────────────────────────────────────────
// A bulk lexicon lookup for the conlanger, hidden behind ?lab like the workshop.
// The user types English (one concept per word); each word is matched against
// the glossary, the right entry and inflection are chosen, and the inflected
// forms are assembled in an output box. It does NOT parse English — word order
// and grammar stay the user's job; it only pulls translations and inflects them.
//
// The textarea is the single source of truth. Its tokens carry an inline syntax:
//
//   concept ( = pinnedWord )? ( : class )? ( . tag )*
//
// e.g.  camel.o.pl   big=ali   dragon=zurakh:n   we.poss
//
// The cards under it are a pure render of the parsed text plus the glossary;
// every card action edits the text and re-parses, so the two never drift.
(function () {
  "use strict";

  const params = new URLSearchParams(location.search);
  if (!params.has("lab")) return;

  const tabBtn = document.getElementById("tab-translate");
  if (tabBtn) tabBtn.hidden = false;

  const esc  = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const dual = w => `<span class="lat">${esc(w)}</span><span class="scr">${esc(w)}</span>`;
  const NEW_CLASSES = ["n", "adj", "v", "pro", "pre", "conj"];

  const inputEl   = document.getElementById("tr-input");
  const slotsEl   = document.getElementById("tr-slots");
  const outputEl  = document.getElementById("tr-output");
  const copyBtn   = document.getElementById("tr-copy");
  const newBox    = document.getElementById("tr-new");
  const newListEl = document.getElementById("tr-new-list");
  const newCopyBtn= document.getElementById("tr-new-copy");

  // ── Glossary access ─────────────────────────────────────────────────────────
  // app.js parses Glossary.md into rows [word, class, translation, plural, …].
  const entryObj = r => ({ word: r[0], klass: r[1], translation: r[2], plural: r[3] });
  const allEntries = () => (window.GLOSSARY || []).map(entryObj);

  const ARTICLE = /^(?:to|the|a|an)\s+/;   // leading filler ignored in exact matching

  // A translation splits into senses at commas; each sense is a phrase that may
  // itself be several words. Parentheticals are dropped, whitespace normalised.
  // "to hold (tr.)" → ["to hold"];  "dawn, rising sun" → ["dawn", "rising sun"].
  function senses(tr) {
    return tr.toLowerCase().replace(/\([^)]*\)/g, " ").split(",")
             .map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  }

  // How well a glossary entry answers an English concept (which may be a phrase,
  // e.g. "rising sun"). Higher is better; 0 means no match. The order is: exact
  // sense (whole meaning, articles ignored) ▸ whole word ▸ prefix ▸ substring.
  // So "sun" prefers *alzura* (sun) over *alzuwir* (sunfire), and "rising sun"
  // hits *azra* exactly rather than just sharing the word "sun".
  function scoreEntry(e, concept) {
    const w = e.word.toLowerCase();
    if (w === concept) return 6;
    const ss = senses(e.translation);
    for (const s of ss) if (s === concept || s.replace(ARTICLE, "") === concept) return 5;

    let best = 0;
    if (!concept.includes(" ")) {                 // single-word concept → word-level matching
      for (const tw of ss.flatMap(s => s.split(" "))) {
        if (tw === concept) best = Math.max(best, 4);
        else if (concept.length >= 3 && (tw.startsWith(concept) || concept.startsWith(tw)))
          best = Math.max(best, 3);
      }
      if (best < 2 && concept.length >= 3 && w.startsWith(concept)) best = Math.max(best, 1);
    }
    if (best === 0 && concept.length >= 3 && e.translation.toLowerCase().includes(concept)) best = 2;
    return best;
  }

  function searchGlossary(concept) {
    concept = concept.toLowerCase();
    if (!concept) return [];
    const scored = [];
    for (const e of allEntries()) {
      const s = scoreEntry(e, concept);
      if (s > 0) scored.push({ e, s });
    }
    // Best score first; then the most exact / smallest match — the shortest
    // translation, then the shortest word, then alphabetical.
    scored.sort((a, b) =>
      b.s - a.s ||
      a.e.translation.length - b.e.translation.length ||
      a.e.word.length - b.e.word.length ||
      a.e.word.localeCompare(b.e.word));
    return scored.map(x => x.e);
  }

  // Glossary entries whose dictionary word is exactly `pin`. A word may have
  // several rows (e.g. *ashli* as preposition and as adjective/noun); prefer one
  // that inflects, and one matching a class hint if given.
  function findByWord(pin, clsHint) {
    const hits = allEntries().filter(e => e.word.toLowerCase() === pin.toLowerCase());
    if (!hits.length) return null;
    if (clsHint) {
      const byClass = hits.find(e => e.klass.split(/,\s*/).includes(clsHint));
      if (byClass) return byClass;
    }
    return hits.find(e => Declension.primaryClass(e.klass) !== "invariant") || hits[0];
  }

  // ── Token syntax ────────────────────────────────────────────────────────────
  // Parse one whitespace-delimited piece. Pieces with no letters (punctuation)
  // pass straight through to the output.
  function parsePiece(text) {
    if (!/[A-Za-z]/.test(text)) return { type: "literal", text };
    // The concept may join several English words with underscores (dry_sand) so a
    // multi-word meaning is still one whitespace-delimited token.
    const m = text.match(/^([^A-Za-z]*)([A-Za-z][A-Za-z'’_-]*)([\s\S]*)$/);
    const concept = m[2];
    let rest = m[3] || "", pin = null, cls = null;
    const tags = [];
    let mm = rest.match(/^=([A-Za-z][A-Za-z'’-]*)/);
    if (mm) { pin = mm[1]; rest = rest.slice(mm[0].length); }
    mm = rest.match(/^:([A-Za-z]+)/);
    if (mm) { cls = mm[1].toLowerCase(); rest = rest.slice(mm[0].length); }
    while ((mm = rest.match(/^\.([A-Za-z]+)/))) { tags.push(mm[1].toLowerCase()); rest = rest.slice(mm[0].length); }
    return { type: "concept", concept, pin, cls, tags };   // trailing punctuation dropped
  }

  function serializeToken(tk) {
    let s = tk.concept;
    if (tk.pin) s += "=" + tk.pin;
    if (tk.cls) s += ":" + tk.cls;
    for (const tag of tk.tags) s += "." + tag;
    return s;
  }

  // Scan the whole text into positioned pieces, so a single token can be edited
  // in place while everything else (including newlines) is preserved verbatim.
  function scanPieces(text) {
    const pieces = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(text))) {
      const p = parsePiece(m[0]);
      p.start = m.index;
      p.end = m.index + m[0].length;
      pieces.push(p);
    }
    return pieces;
  }

  // ── Resolution ──────────────────────────────────────────────────────────────
  // Turn a concept piece into everything the card and the output need.
  function resolve(tk) {
    const conceptText = tk.concept.replace(/_/g, " ");   // underscores are spaces in meaning
    const concept = conceptText.toLowerCase();
    const matches = searchGlossary(concept);
    let entry = null, status;

    if (tk.pin) {
      const pinned = findByWord(tk.pin, tk.cls);
      if (pinned) { entry = pinned; status = "pinned"; }
      else { entry = { word: tk.pin, klass: tk.cls || "", translation: conceptText, plural: null, custom: true };
             status = "custom"; }
    } else if (matches.length === 1) {
      entry = matches[0]; status = "ok";
    } else if (matches.length > 1) {
      entry = matches[0]; status = "ambiguous";
    } else {
      status = "nomatch";
    }

    // Normalise pronouns to their base form, folding the looked-up form's
    // number/case into the effective tags.
    let inflWord = entry ? entry.word : null;
    let effTags = tk.tags.slice();
    if (entry && Declension.primaryClass(entry.klass) === "pro") {
      const pb = Declension.pronounBase(entry.word);
      if (pb) {
        inflWord = pb.base;
        effTags = [...new Set([...pb.tags, ...tk.tags])];
      }
    }

    const klass = entry ? entry.klass : "";
    const axes = entry ? Declension.inflectionAxes(klass) : [];
    const output = entry ? Declension.inflect({ word: inflWord, klass, plural: entry.plural }, effTags) : null;

    return { tk, conceptText, entry, status, matches, axes, klass, effTags, output };
  }

  // ── State + the text⇆card loop ──────────────────────────────────────────────
  // Only one card shows at a time — the word at the caret (or the one just
  // clicked in the output). The caret position is the single source of truth for
  // which word that is; output clicks and card edits move the caret to match.
  let PIECES = [];   // positioned pieces from the current text
  let SLOTS  = [];   // resolved view-models, aligned 1:1 with PIECES
  let active = -1;   // index into SLOTS of the card on show

  // Re-parse the text into output + new-words (everything except the card).
  function rebuild() {
    PIECES = scanPieces(inputEl.value);
    SLOTS = PIECES.map(p => p.type === "concept"
      ? resolve(p)
      : { tk: p, literal: true });
    renderOutput();
    renderNewWords();
  }

  // Render the single card for whatever `active` currently points at.
  function showActive() {
    renderCard();
    markActiveInOutput();
  }

  // The concept piece at/just before the caret — the word being edited.
  function conceptAtCaret(pos) {
    let best = -1;
    for (let i = 0; i < SLOTS.length; i++) {
      const s = SLOTS[i];
      if (s.literal) continue;
      if (pos >= s.tk.start && pos <= s.tk.end) return i;   // caret inside this word
      if (s.tk.start <= pos) best = i;                       // …or the latest word before it
      else if (best === -1) best = i;                        // caret before the first word
    }
    return best;
  }

  // Follow the caret to pick the active word — for typing and clicking in the
  // textarea, where the caret is the genuine signal of intent.
  function syncFromCaret() {
    active = conceptAtCaret(inputEl.selectionStart || 0);
    showActive();
  }

  // Rewrite piece `i` from its (mutated) token. The edited word stays selected by
  // index — not by reading the caret back, which an unfocused textarea reports as
  // 0 (snapping to the first word). The textarea stays the source of truth; only
  // this one token's span is spliced. Token count/order never change (a token
  // serialises to a single whitespace-free piece), so `i` still points at it.
  function commit(i, tk) {
    const p = PIECES[i];
    const text = inputEl.value;
    const ser = serializeToken(tk);
    inputEl.value = text.slice(0, p.start) + ser + text.slice(p.end);
    const caret = p.start + ser.length;
    inputEl.setSelectionRange(caret, caret);
    active = i;
    rebuild();
    showActive();
  }

  // ── Card rendering ──────────────────────────────────────────────────────────
  const STATUS_LABEL = {
    ok: "matched", pinned: "pinned", ambiguous: "choose one",
    custom: "new word", nomatch: "no match",
  };

  function classBadge(klass) {
    return klass ? `<span class="tr-class">${esc(klass)}</span>` : "";
  }

  // The chosen-entry line (or a placeholder when nothing is resolved yet).
  function entryLine(s, i) {
    if (!s.entry) return `<div class="tr-entry tr-entry-none">no glossary match</div>`;
    const e = s.entry;
    const clearable = s.tk.pin ? `<button class="tr-clear" data-act="unpin" data-i="${i}" title="clear — back to auto-match">×</button>` : "";
    return `
      <div class="tr-entry">
        <span class="tr-entry-word">${dual(e.word)}</span>
        ${classBadge(e.klass)}
        <span class="tr-entry-gloss">${esc(e.translation)}</span>
        ${clearable}
      </div>`;
  }

  // Alternatives the user can pick instead of the current entry. Not capped — the
  // full match list is browsable (the container scrolls), so someone unsure what
  // to type can scan everything the concept turned up.
  function chooser(s, i) {
    const alts = s.matches.filter(e => !s.entry || e.word !== s.entry.word || e.klass !== s.entry.klass);
    if (!alts.length) return "";
    const chips = alts.map(e => `
      <button class="tr-alt" data-act="pick" data-i="${i}" data-word="${esc(e.word)}" data-klass="${esc(e.klass)}">
        <span class="tr-alt-word">${dual(e.word)}</span>
        <span class="tr-alt-gloss">${esc(e.klass)} · ${esc(e.translation)}</span>
      </button>`).join("");
    return `<div class="tr-alts">${chips}</div>`;
  }

  // The "no match — add a translation" form.
  function addForm(s, i) {
    const opts = NEW_CLASSES.map(c => `<option value="${c}">${c}</option>`).join("");
    return `
      <form class="tr-add" data-act="add" data-i="${i}">
        <input class="tr-add-word" type="text" placeholder="conlang word" autocomplete="off" spellcheck="false">
        <select class="tr-add-class" title="word class (for inflection)"><option value="">—</option>${opts}</select>
        <button class="tr-add-btn workshop-btn" type="submit">Add</button>
      </form>`;
  }

  // Inflection controls for the resolved entry.
  function axesBlock(s, i) {
    if (!s.axes.length) return "";
    const sel = Declension.selectionFromTags(s.klass, s.effTags);
    const groups = s.axes.map(ax => {
      const applies = !ax.appliesWhen || ax.appliesWhen(sel);
      const opts = ax.options.map(opt => {
        const on = ax.type === "toggle" ? sel[ax.key] : sel[ax.key] === opt.tag;
        return `<button class="tr-opt${on ? " active" : ""}" data-act="opt" data-i="${i}"
          data-axis="${esc(ax.key)}" data-tag="${esc(opt.tag)}" data-type="${ax.type}"
          ${applies ? "" : "disabled"}>${esc(opt.label)}</button>`;
      }).join("");
      return `<div class="tr-axis${applies ? "" : " tr-axis-off"}">
        <span class="tr-axis-label">${esc(ax.label)}</span>
        <span class="tr-opts">${opts}</span></div>`;
    }).join("");
    return `<div class="tr-axes">${groups}</div>`;
  }

  function slotCard(s, i) {
    const formed = s.output != null
      ? `<span class="tr-slot-form">${dual(s.output)}</span>`
      : `<span class="tr-slot-form tr-form-na">${s.entry ? "can't form" : "—"}</span>`;
    let body;
    if (s.status === "nomatch") body = addForm(s, i);
    else body = entryLine(s, i) + chooser(s, i) + axesBlock(s, i);

    return `
      <div class="tr-slot status-${s.status}">
        <div class="tr-slot-head">
          <span class="tr-concept">${esc(s.conceptText)}</span>
          <span class="tr-slot-status">${STATUS_LABEL[s.status] || ""}</span>
        </div>
        ${body}
        <div class="tr-slot-out">${formed}</div>
      </div>`;
  }

  // Just the active word's card.
  function renderCard() {
    if (active < 0 || !SLOTS[active] || SLOTS[active].literal) {
      slotsEl.innerHTML = `<p class="tr-empty">Type some English above, then click a word in the output to look it up and inflect it.</p>`;
      return;
    }
    slotsEl.innerHTML = slotCard(SLOTS[active], active);
  }

  function renderOutput() {
    const cards = SLOTS.filter(s => !s.literal);
    if (!cards.length) { outputEl.innerHTML = `<span class="tr-empty">—</span>`; return; }
    outputEl.innerHTML = SLOTS.map((s, i) => {
      if (s.literal) return `<span class="tr-out-lit">${esc(s.tk.text)}</span>`;
      const cls = s.output != null ? "tr-out-word" : "tr-out-word tr-out-gap";
      const inner = s.output != null ? dual(s.output) : "·";
      return `<button class="${cls}" data-i="${i}" title="${esc(s.conceptText)}${s.output == null ? " — unresolved" : ""}">${inner}</button>`;
    }).join(" ");
    markActiveInOutput();
  }

  // Highlight which output word the card is currently editing.
  function markActiveInOutput() {
    outputEl.querySelectorAll(".tr-out-word").forEach(el =>
      el.classList.toggle("editing", Number(el.dataset.i) === active));
  }

  function latinOutput() {
    return SLOTS.map(s => s.literal ? s.tk.text : (s.output != null ? s.output : "…"))
                .join(" ").replace(/\s+/g, " ").trim();
  }

  // ── New words (coined here, not yet in the glossary) ────────────────────────
  // Gathered so the user is reminded to add them to Glossary.md afterwards.
  function newWordEntries() {
    const seen = new Set(), out = [];
    for (const s of SLOTS) {
      if (s.literal || s.status !== "custom" || !s.entry) continue;
      const key = s.entry.word + "|" + s.entry.klass;
      if (seen.has(key)) continue;
      seen.add(key);
      const inflectable = ["n", "adj", "v"].some(c => s.entry.klass.split(/,\s*/).includes(c));
      out.push({
        word: s.entry.word,
        klass: s.entry.klass || "",
        gloss: s.conceptText,
        plural: inflectable ? (Declension.pluralRoot(s.entry.word) || "") : "",
      });
    }
    return out;
  }

  function renderNewWords() {
    const items = newWordEntries();
    newBox.hidden = items.length === 0;
    if (!items.length) { newListEl.innerHTML = ""; return; }
    newListEl.innerHTML = items.map(it => `
      <div class="tr-new-item">
        <span class="tr-new-word">${dual(it.word)}</span>
        <span class="tr-class${it.klass ? "" : " tr-class-q"}">${esc(it.klass || "?")}</span>
        <span class="tr-new-gloss">${esc(it.gloss)}</span>
        ${it.plural ? `<span class="tr-new-plural">pl. ${esc(it.plural)}</span>` : ""}
      </div>`).join("");
  }

  // The new words as Glossary.md table rows, ready to paste.
  function newWordsMarkdown() {
    return newWordEntries()
      .map(it => `| ${it.word} | ${it.klass} | ${it.gloss} | ${it.plural} | |`)
      .join("\n");
  }

  // ── Card interactions (delegated) ───────────────────────────────────────────
  slotsEl.addEventListener("click", e => {
    const btn = e.target.closest("[data-act]");
    if (!btn || btn.tagName === "FORM") return;
    const i = Number(btn.dataset.i);
    const s = SLOTS[i];
    if (!s || s.literal) return;
    const tk = s.tk;
    const act = btn.dataset.act;

    if (act === "unpin") { tk.pin = null; tk.cls = null; commit(i, tk); return; }

    if (act === "pick") {
      const word = btn.dataset.word, klass = btn.dataset.klass;
      if (Declension.primaryClass(klass) === "pro") {
        const pb = Declension.pronounBase(word);
        tk.pin = pb ? pb.base : word;
        tk.tags = pb ? pb.tags.slice() : [];
      } else {
        tk.pin = word;
      }
      tk.cls = null;
      commit(i, tk);
      return;
    }

    if (act === "opt") {
      if (btn.disabled) return;
      const sel = Declension.selectionFromTags(s.klass, s.effTags);
      const axis = btn.dataset.axis, tag = btn.dataset.tag;
      if (btn.dataset.type === "toggle") sel[axis] = !sel[axis];
      else sel[axis] = sel[axis] === tag ? "" : tag;   // re-click a select option clears to default
      const newTags = Declension.tagsFromSelection(s.klass, sel);
      // Pronouns: normalise to the base word so the tags fully describe the form.
      if (Declension.primaryClass(s.klass) === "pro" && s.entry) {
        const pb = Declension.pronounBase(s.entry.word);
        if (pb) tk.pin = pb.base;
      }
      tk.tags = newTags;
      commit(i, tk);
      return;
    }
  });

  // Add-new-translation form.
  slotsEl.addEventListener("submit", e => {
    const form = e.target.closest("form[data-act='add']");
    if (!form) return;
    e.preventDefault();
    const i = Number(form.dataset.i);
    const s = SLOTS[i];
    if (!s || s.literal) return;
    const word = form.querySelector(".tr-add-word").value.trim();
    if (!word) return;
    s.tk.pin = word;
    const cls = form.querySelector(".tr-add-class").value;
    s.tk.cls = cls || null;
    commit(i, s.tk);
  });

  // Click an output word → edit it: select that word and drop the caret on it.
  outputEl.addEventListener("click", e => {
    const btn = e.target.closest(".tr-out-word");
    if (!btn) return;
    const i = Number(btn.dataset.i);
    const s = SLOTS[i];
    if (!s || s.literal) return;
    active = i;
    inputEl.focus();
    inputEl.setSelectionRange(s.tk.end, s.tk.end);
    showActive();
  });

  // ── Textarea ⇆ card ──────────────────────────────────────────────────────────
  let typingTimer = 0;
  inputEl.addEventListener("input", () => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => { rebuild(); syncFromCaret(); }, 120);   // debounce so the card doesn't thrash mid-word
  });
  // Caret moves don't change the parse — just which word's card is shown.
  ["click", "keyup", "select"].forEach(ev => inputEl.addEventListener(ev, syncFromCaret));

  async function copyWithFeedback(btn, text) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const old = btn.textContent;
      btn.textContent = "Copied ✓";
      setTimeout(() => { btn.textContent = old; }, 1200);
    } catch { /* clipboard unavailable — no-op */ }
  }
  copyBtn.addEventListener("click", () => copyWithFeedback(copyBtn, latinOutput()));
  newCopyBtn.addEventListener("click", () => copyWithFeedback(newCopyBtn, newWordsMarkdown()));

  // ── Boot once the glossary is parsed ────────────────────────────────────────
  function init() { rebuild(); syncFromCaret(); }
  if (window.GLOSSARY && window.GLOSSARY.length) init();
  else window.addEventListener("glossary-ready", init, { once: true });
})();
