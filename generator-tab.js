// ── Generator tab ────────────────────────────────────────────────────────────
// A conlanger's bench, hidden from the public reference. Revealed only when the
// page is opened with the ?lab URL parameter. Two tools:
//   · Generate — batches of phonotactically legal words (generator.js).
//   · Family   — pick a word, give it a meaning, and get a spread of related
//                words to build a semantic family from (semantics.js).
(function () {
  "use strict";

  // Gate: only wire the tab up when ?lab is present in the query string.
  const params = new URLSearchParams(location.search);
  if (!params.has("lab")) return;

  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const dual = w => `<span class="lat">${esc(w)}</span><span class="scr">${esc(w)}</span>`;

  // Reveal the (otherwise hidden) tab button — app.js's generic tab handler
  // takes over the actual switching from here.
  const tabBtn = document.getElementById("tab-generator");
  if (tabBtn) tabBtn.hidden = false;

  // ── Generator ──────────────────────────────────────────────────────────────
  const countEl   = document.getElementById("gen-count");
  const genBtn     = document.getElementById("gen-btn");
  const genResults = document.getElementById("gen-results");
  const famWordEl  = document.getElementById("fam-word");
  const famMeanEl  = document.getElementById("fam-meaning");

  function runGenerate() {
    const n = Math.min(500, Math.max(1, parseInt(countEl.value, 10) || 30));
    const list = Generator.words(n);
    genResults.innerHTML = list.map(w =>
      `<button class="word-chip" data-word="${esc(w)}" title="Use as family base">${dual(w)}</button>`
    ).join("");
  }

  genBtn.addEventListener("click", runGenerate);

  // Click a generated word to drop it into the family base field.
  genResults.addEventListener("click", e => {
    const chip = e.target.closest(".word-chip");
    if (!chip) return;
    famWordEl.value = chip.dataset.word;
    famMeanEl.focus();
    famWordEl.closest(".generator-tool").scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  // ── Family suggestions ───────────────────────────────────────────────────────
  const famBtn     = document.getElementById("fam-btn");
  const famResults = document.getElementById("fam-results");

  function renderItem(it) {
    return `
      <button class="fam-item" data-word="${esc(it.word)}" title="Explore this word's family">
        <span class="fam-item-word">${dual(it.word)}</span>
        <span class="fam-item-tag">${esc(it.tag)}${it.cls && it.cls !== "—" ? " · " + esc(it.cls) : ""}</span>
        <span class="fam-item-gloss">${esc(it.gloss)}</span>
      </button>`;
  }

  function renderFamily() {
    const fam = Semantics.family(famWordEl.value, famMeanEl.value);
    if (!fam) { famResults.innerHTML = ""; return; }

    let html = "";
    if (!fam.valid) {
      html += `<p class="fam-warn">"${esc(fam.base)}" isn't a well-formed word — suggestions may be sparse.</p>`;
    }
    html += `<p class="fam-root">root <span>${esc(fam.root || "—")}</span></p>`;

    if (!fam.groups.length) {
      html += `<p class="no-results">No related words could be formed.</p>`;
    } else {
      html += fam.groups.map(g => `
        <div class="fam-group">
          <h4>${esc(g.title)} <span class="fam-group-note">${esc(g.note)}</span></h4>
          <div class="fam-grid">${g.items.map(renderItem).join("")}</div>
        </div>`).join("");
    }
    // Placeholder for the English-side family, filled asynchronously below.
    html += `<div class="fam-group fam-english" id="fam-english"></div>`;
    famResults.innerHTML = html;

    loadEnglish(famMeanEl.value.trim());
  }

  // ── English semantic field (Datamuse) ────────────────────────────────────────
  const EN_HEAD = `<h4>English kin <span class="fam-group-note">related meanings — click one to explore it</span></h4>`;
  const enCache = new Map();
  let enToken = 0;

  async function loadEnglish(meaning) {
    let box = document.getElementById("fam-english");
    if (!box) return;
    if (!meaning) { box.remove(); return; }

    const token = ++enToken;
    box.innerHTML = EN_HEAD + `<p class="fam-loading">finding related words…</p>`;

    let res = enCache.get(meaning);
    if (!res) {
      res = await Semantics.englishKin(meaning);
      if (!res.error) enCache.set(meaning, res); // don't cache failed lookups
    }
    if (token !== enToken) return;                // a newer render superseded us

    box = document.getElementById("fam-english");
    if (!box) return;

    if (res.error) {
      box.innerHTML = EN_HEAD + `<p class="fam-warn">Couldn't reach the word service — check the connection.</p>`;
      return;
    }
    if (!res.groups.length) {
      box.innerHTML = EN_HEAD + `<p class="no-results">No related English words found.</p>`;
      return;
    }
    box.innerHTML = EN_HEAD + res.groups.map(g => `
      <div class="fam-en-group">
        <span class="fam-en-rel">${esc(g.title)}</span>
        <div class="fam-en-words">${g.words.map(w =>
          `<button class="en-chip" data-word="${esc(w)}">${esc(w)}</button>`).join("")}</div>
      </div>`).join("");
  }

  famBtn.addEventListener("click", renderFamily);
  famMeanEl.addEventListener("keydown", e => { if (e.key === "Enter") renderFamily(); });
  famWordEl.addEventListener("keydown", e => { if (e.key === "Enter") famMeanEl.focus(); });

  famResults.addEventListener("click", e => {
    // A conlang suggestion: re-seed the base and explore its own family.
    const item = e.target.closest(".fam-item");
    if (item) {
      famWordEl.value = item.dataset.word;
      renderFamily();
      famResults.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    // An English related word: adopt it as the meaning and walk the English
    // field outward from there (the base word, and so its conlang kin, stay put).
    const en = e.target.closest(".en-chip");
    if (en) {
      famMeanEl.value = en.dataset.word;
      renderFamily();
    }
  });

  // Seed an initial batch so the tab isn't empty on first open.
  runGenerate();
})();
