// ── Glossary parser ─────────────────────────────────────────────────────────
// Parse the Glossary.md table with `marked`, then read the rows back out of the
// generated DOM as a clean [word, class, translation, plural, notes] array.
function parseGlossaryMd(text) {
  const tmp = document.createElement("div");
  tmp.innerHTML = marked.parse(text);
  const rows = [];
  tmp.querySelectorAll("table tbody tr").forEach(tr => {
    const cells = [...tr.querySelectorAll("td")].map(td => td.textContent.trim());
    rows.push([
      cells[0] || "",  // word
      cells[1] || "",  // class
      cells[2] || "",  // translation
      cells[3] || "",  // plural root
      cells[4] || "",  // notes
    ]);
  });
  // Stamp each row with its position so render() can reference the original
  // entry (for the forms modal) without an O(n) indexOf per visible row.
  rows.forEach((r, i) => { r.idx = i; });
  return rows;
}

// ── State ──────────────────────────────────────────────────────────────────
let GLOSSARY = [];
let query = "";
let activeClass = "";
let irregularOnly = false;
let sortCol = 0;
let sortAsc = true;

// ── DOM refs ───────────────────────────────────────────────────────────────
const searchEl    = document.getElementById("search");
const bodyEl      = document.getElementById("glossary-body");
const countEl     = document.getElementById("entry-count");
const filterWrap  = document.getElementById("class-filters");
const headers     = document.querySelectorAll("thead th[data-col]");

// ── Build class filter pills ───────────────────────────────────────────────
function buildFilters() {
  // Remove any class pills added previously (keep "All", the separator and the
  // standalone "Irregular" toggle, which live in the HTML).
  filterWrap.querySelectorAll('.pill[data-class]:not([data-class=""])').forEach(p => p.remove());

  const sep = filterWrap.querySelector(".filter-sep");

  const CLASSES = [...new Set(
    GLOSSARY.flatMap(r => r[1].split(/,\s*/))
  )].sort();

  CLASSES.forEach(cls => {
    const btn = document.createElement("button");
    btn.className = "pill";
    btn.dataset.class = cls;
    btn.textContent = cls;
    filterWrap.insertBefore(btn, sep);
  });
}

// ── Highlight helper ───────────────────────────────────────────────────────
function hl(text, q) {
  if (!q) return escHtml(text);
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return escHtml(text);
  return escHtml(text.slice(0,idx)) +
         "<mark>" + escHtml(text.slice(idx, idx+q.length)) + "</mark>" +
         escHtml(text.slice(idx+q.length));
}
function escHtml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// Render the plural-root cell. The listed root is checked against the one the
// declension rule (decline.js) would derive; irregular roots get an "(irreg.)"
// note carrying the would-be regular form as a hover tip.
function pluralCell(word, plural, q) {
  if (!plural) return "";
  const inner = `<span class="latin">${hl(plural, q)}</span><span class="script">${plural}</span>`;

  const reg = Declension.pluralRegularity(word, plural);
  const mark = reg.status === "irregular"
    ? `<span class="irreg-mark" data-tip="${escHtml("Irregular — rule derives “" + reg.computed + "”")}">(irreg.)</span>`
    : "";

  return `<span class="plural-cell">${inner}${mark}</span>`;
}

// Is this entry's listed plural root irregular (diverges from the derived rule)?
function isIrregular(word, plural) {
  return !!plural && Declension.pluralRegularity(word, plural).status === "irregular";
}

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  const q = query.toLowerCase().trim();

  let rows = GLOSSARY.filter(r => {
    const classMatch = !activeClass || r[1].split(/,\s*/).includes(activeClass);
    const textMatch  = !q ||
      r[0].toLowerCase().includes(q) ||
      r[2].toLowerCase().includes(q) ||
      r[3].toLowerCase().includes(q) ||
      r[4].toLowerCase().includes(q);
    const irregMatch = !irregularOnly || isIrregular(r[0], r[3]);
    return classMatch && textMatch && irregMatch;
  });

  // Sort
  rows.sort((a, b) => {
    const av = a[sortCol] || "", bv = b[sortCol] || "";
    return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  countEl.textContent = rows.length + " / " + GLOSSARY.length + " entries";

  if (rows.length === 0) {
    bodyEl.innerHTML = `<tr><td colspan="5" class="no-results">No entries match — try a different search.</td></tr>`;
    return;
  }

  bodyEl.innerHTML = rows.map(r => {
    const inflect = Declension.isInflectable(r[0], r[1]);
    return `
    <tr${inflect ? ` class="inflect" data-idx="${r.idx}"` : ""}>
      <td class="word">
        <span class="word-line">
          <span class="latin">${hl(r[0], q)}</span>
          <span class="script">${r[0]}</span>
          ${inflect ? `<span class="forms-hint">forms ▸</span>` : ""}
        </span>
      </td>
      <td class="class">${escHtml(r[1])}</td>
      <td class="translation">${hl(r[2], q)}</td>
      <td class="plural">${pluralCell(r[0], r[3], q)}</td>
      <td class="notes">${hl(r[4], q)}</td>
    </tr>`;
  }).join("");
}

// ── Sort headers ───────────────────────────────────────────────────────────
const colIndex = {word:0, class:1, translation:2, plural:3, notes:4};

headers.forEach(th => {
  th.addEventListener("click", () => {
    const col = colIndex[th.dataset.col];
    if (sortCol === col) { sortAsc = !sortAsc; }
    else { sortCol = col; sortAsc = true; }

    headers.forEach(h => { h.classList.remove("sorted"); h.querySelector(".sort-arrow").textContent = "↕"; });
    th.classList.add("sorted");
    th.querySelector(".sort-arrow").textContent = sortAsc ? "↑" : "↓";
    render();
  });
});

// ── Search ─────────────────────────────────────────────────────────────────
searchEl.addEventListener("input", () => { query = searchEl.value; render(); });

// ── Class filter ───────────────────────────────────────────────────────────
filterWrap.addEventListener("click", e => {
  const btn = e.target.closest(".pill");
  if (!btn) return;

  // The "Irregular" pill is an independent toggle, combinable with a class.
  if (btn.dataset.filter === "irregular") {
    irregularOnly = !irregularOnly;
    btn.classList.toggle("active", irregularOnly);
    render();
    return;
  }

  // Class pills are single-select (leave the irregular toggle untouched).
  filterWrap.querySelectorAll(".pill:not([data-filter])").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  activeClass = btn.dataset.class;
  render();
});

// ── Declension / conjugation modal ───────────────────────────────────────────
const formsOverlay     = document.getElementById("forms-overlay");
const formsBodyEl      = document.getElementById("forms-body");
const formsWordEl      = document.getElementById("forms-word");
const formsWordScrEl   = document.getElementById("forms-word-script");
const formsSubEl       = document.getElementById("forms-sub");
const formsCloseEl     = document.getElementById("forms-close");

// One generated form: latin + script, or an em dash when it can't be formed
// (e.g. a plural-based form for an entry with no recorded plural root).
function formVal(form) {
  if (!form) return `<span class="form-na" title="not recorded">—</span>`;
  return `<span class="lat">${escHtml(form)}</span><span class="scr">${escHtml(form)}</span>`;
}

function renderSection(sec) {
  const rows = sec.rows.map(r => `
      <div class="form-row">
        <div class="form-label">${escHtml(r.label)}</div>
        <div class="form-val">${formVal(r.form)}</div>
      </div>`).join("");
  return `
    <div class="form-section">
      <h4>${escHtml(sec.title)}</h4>
      ${sec.note ? `<p class="form-note">${escHtml(sec.note)}</p>` : ""}
      <div class="form-grid">${rows}</div>
    </div>`;
}

function openForms(idx) {
  const row = GLOSSARY[idx];
  if (!row) return;
  const para = Declension.paradigm(row[0], row[1], row[3], row[2]);
  if (!para) return;

  formsWordEl.textContent = row[0];
  formsWordScrEl.textContent = row[0];
  const bits = [row[2], row[1]].filter(Boolean);
  if (para.sub) bits.push(para.sub);
  formsSubEl.textContent = bits.join("   ·   ");

  let html = "";
  if (para.note) html += `<p class="form-note form-note-top">${escHtml(para.note)}</p>`;
  html += para.sections.map(renderSection).join("");
  formsBodyEl.innerHTML = html;

  formsOverlay.hidden = false;
  document.body.classList.add("modal-open");
  formsCloseEl.focus();
}

function closeForms() {
  formsOverlay.hidden = true;
  document.body.classList.remove("modal-open");
}

bodyEl.addEventListener("click", e => {
  const tr = e.target.closest("tr.inflect");
  if (tr) openForms(Number(tr.dataset.idx));
});
formsCloseEl.addEventListener("click", closeForms);
formsOverlay.addEventListener("click", e => { if (e.target === formsOverlay) closeForms(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !formsOverlay.hidden) closeForms(); });

// ── Tab switching ──────────────────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
  });
});

// ── Language.md renderer ────────────────────────────────────────────────────
// Tokens that look like language forms in italics but are abstract notation —
// skip the script rendering for these (multi-letter notation only; single
// letters/digraphs are caught generically by length below).
const SKIP_SCRIPT = new Set([
  'C', 'V', 'CV', 'CVC', 'VC', 'SVO', 'SOV', '-iC', 'iy', 'yi', 'kh', 'sh',
  'awa', 'akhu', 'ayi', 'uwa', 'ukhu', 'uyi', 'iya', 'iyu', 'iwi',
]);

function slugify(t) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Turn an <em> node (rendered by marked from *italic*) into a dual latin+script
// form, or latin-only for single letters, affixes, and abstract notation.
function decorateLangForms(root) {
  root.querySelectorAll('em').forEach(em => {
    const text = em.textContent;
    // Only full words get a script form. Affixes and declensions are marked by a
    // leading or trailing dash, single phonemes are one or two letters, and
    // other abstract notation is listed in SKIP_SCRIPT.
    const isAffix = /^-|-$/.test(text);
    const span = document.createElement('span');
    span.className = 'lang-form';
    if (isAffix || SKIP_SCRIPT.has(text) || text.length <= 1 || text === '') {
      span.innerHTML = `<span class="lat">${escHtml(text)}</span>`;
    } else {
      span.innerHTML = `<span class="lat">${escHtml(text)}</span><span class="scr">${escHtml(text)}</span>`;
    }
    em.replaceWith(span);
  });
}

// Build the grammar nav + content from Language.md.
// `marked` parses the markdown; we split the result into sections at each <h2>,
// render every section onto a single scrollable page, and build a nav containing
// every heading level (h2/h3/h4) as anchor links into that page.
function renderGrammar(languageMd) {
  const nav     = document.getElementById('grammar-nav');
  const content = document.getElementById('grammar-content');
  nav.innerHTML = '';
  content.innerHTML = '';

  const parsed = document.createElement('div');
  parsed.innerHTML = marked.parse(languageMd);

  // Group top-level nodes into sections, starting at each <h2>.
  const sections = [];
  let current = null;
  parsed.childNodes.forEach(node => {
    if (node.nodeType === 1 && node.tagName === 'H2') {
      const title = node.textContent.trim();
      current = { title, slug: slugify(title), nodes: [node] };
      sections.push(current);
    } else if (current) {
      current.nodes.push(node);
    }
    // nodes before the first <h2> (the # title) are ignored
  });

  sections.forEach(sec => {
    // Section content
    const el = document.createElement('section');
    el.className = 'grammar-section';
    el.id = 'gsec-' + sec.slug;
    sec.nodes.forEach(n => el.appendChild(n));
    decorateLangForms(el);
    content.appendChild(el);

    // Nav: top-level entry for the section itself…
    const navGroup = document.createElement('div');
    navGroup.className = 'grammar-nav-group';
    const topLink = document.createElement('a');
    topLink.className = 'grammar-nav-item';
    topLink.href = '#' + el.id;
    topLink.textContent = sec.title;
    navGroup.appendChild(topLink);

    // …plus nested entries for every h3/h4 inside it.
    el.querySelectorAll('h3, h4').forEach(h => {
      const hid = 'g-' + sec.slug + '-' + slugify(h.textContent);
      h.id = hid;
      const a = document.createElement('a');
      a.href = '#' + hid;
      a.textContent = h.textContent;
      a.className = 'grammar-nav-sub' + (h.tagName === 'H4' ? ' grammar-nav-sub2' : '');
      navGroup.appendChild(a);
    });

    nav.appendChild(navGroup);
  });

  // Smooth-scroll for all nav links, and highlight the current section on scroll.
  const navLinks = [...nav.querySelectorAll('a')];
  navLinks.forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const link = nav.querySelector(`a[href="#${entry.target.id}"]`);
      if (!link) return;
      if (entry.isIntersecting) {
        navLinks.forEach(a => a.classList.remove('active'));
        link.classList.add('active');
      }
    });
  }, { rootMargin: '0px 0px -70% 0px', threshold: 0 });

  content.querySelectorAll('section.grammar-section, h3, h4').forEach(el => observer.observe(el));
}

// ── Bootstrap ──────────────────────────────────────────────────────────────
async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} — ${r.status} ${r.statusText}`);
  return r.text();
}

(async () => {
  let glossaryText, languageText;
  try {
    [glossaryText, languageText] = await Promise.all([
      fetchText('Glossary.md'),
      fetchText('Language.md'),
    ]);
  } catch (err) {
    // Most often the source files couldn't be loaded (e.g. opened over file://
    // or a failed deploy). Surface it instead of leaving a blank page.
    bodyEl.innerHTML = `<tr><td colspan="5" class="no-results">
      Couldn't load the language data (${escHtml(err.message)}).
      If you opened this file directly, serve the folder over http instead.
    </td></tr>`;
    return;
  }
  GLOSSARY = parseGlossaryMd(glossaryText);
  window.GLOSSARY = GLOSSARY;            // shared with the translation assistant (translate.js)
  buildFilters();
  render();
  renderGrammar(languageText);
  window.dispatchEvent(new Event("glossary-ready"));
})();
