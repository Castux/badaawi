// ── Semantic-family suggestions ──────────────────────────────────────────────
// Given a base word and a meaning the conlanger has assigned to it, propose a
// spread of related words to seed a semantic family. Three flavours:
//
//   1. Derivations — the regular lexicon affixes (Language.md › Lexicon):
//        -ad verb · -wi collective · -bi place · -j(V) adjective ·
//        -zim person · -m device · uz- negative · al- great · az- provenance
//   2. Same root — re-vowelling the consonantal skeleton under fresh templates,
//        the irregular Semitic-style way related words share a root.
//   3. Sound shifts — nudging one segment along its natural class, the way a
//        doublet or dialect form might drift in.
//
// (2) and (3) are deliberately non-regular: they are creative prompts, validated
// only against the phonotactics (via Declension.parseWord), not against any
// derivation rule. Every emitted word is guaranteed to parse as a legal word.
(function () {
  "use strict";

  const D = (typeof window !== "undefined" && window.Declension) ||
            (typeof require !== "undefined" && require("./decline.js"));

  const isVowel = s => /^[aui]/.test(s);
  const toShort = v => (isVowel(v) ? v[0] : v);
  const endsVowel = w => isVowel(w[w.length - 1]);

  // Hiatus linking, same table as decline.js (Language.md › Diphthongs).
  const LINKS = {
    a: { a: "w", u: "kh", i: "y" },
    u: { a: "w", u: "kh", i: "y" },
    i: { a: "y", u: "y", i: "w" },
  };
  function getLink(v, w) {
    v = toShort(v); w = toShort(w);
    return (LINKS[v] && LINKS[v][w]) || null;
  }

  // Flat list of every segment, in order; and just the consonants (the root).
  function segments(word) {
    const parsed = D.parseWord(word);
    if (!parsed) return null;
    return parsed.flat();
  }
  function rootConsonants(word) {
    const segs = segments(word);
    if (!segs) return [];
    return segs.filter(s => !isVowel(s));
  }
  // The last syllable's vowel, shortened — used to harmonise the adjective vowel.
  function lastVowel(word) {
    const parsed = D.parseWord(word);
    if (!parsed) return null;
    const last = parsed[parsed.length - 1];
    for (let i = last.length - 1; i >= 0; i--) if (isVowel(last[i])) return toShort(last[i]);
    return null;
  }

  // Attach a suffix, inserting a linking consonant if it would create a hiatus.
  function joinSuffix(base, suf) {
    if (isVowel(suf) && endsVowel(base)) {
      const link = getLink(base[base.length - 1], suf[0]);
      if (link) return base + link + suf;
    }
    return base + suf;
  }
  // Adjective -j(V): bare -j after a vowel, else a harmonising vowel + j.
  function adjForm(base) {
    if (endsVowel(base)) return base + "j";
    return base + (lastVowel(base) || "i") + "j";
  }

  // The regular derivational affixes, each with a gloss template over the base
  // meaning M. `class` is the resulting part of speech (— = prefix, unchanged).
  const DERIVATIONS = [
    { tag: "-ad",  cls: "v",   build: b => joinSuffix(b, "ad"),  gloss: M => `to ${M} — the action of “${M}”` },
    { tag: "-wi",  cls: "n",   build: b => joinSuffix(b, "wi"),  gloss: M => `${M} (collective) — many ${M} together` },
    { tag: "-bi",  cls: "n",   build: b => joinSuffix(b, "bi"),  gloss: M => `place of ${M}` },
    { tag: "-j",   cls: "adj", build: b => adjForm(b),           gloss: M => `${M}-like — having the quality of ${M}` },
    { tag: "-zim", cls: "n",   build: b => joinSuffix(b, "zim"), gloss: M => `${M}-person — one tied to ${M}` },
    { tag: "-m",   cls: "n",   build: b => joinSuffix(b, "m"),   gloss: M => `${M}-device — a thing made for ${M}` },
    { tag: "uz-",  cls: "—",   build: b => "uz" + b,             gloss: M => `not ${M}; the opposite of ${M}` },
    { tag: "al-",  cls: "—",   build: b => "al" + b,             gloss: M => `great ${M}; grand ${M}` },
    { tag: "az-",  cls: "—",   build: b => "az" + b,             gloss: M => `of ${M} (provenance, family name)` },
  ];

  function derivations(base, meaning) {
    const M = (meaning || "it").trim() || "it";
    return DERIVATIONS.map(d => ({
      word: d.build(base),
      gloss: d.gloss(M),
      tag: d.tag,
      cls: d.cls,
    })).filter(s => s.word !== base);
  }

  // Re-vowel the consonant skeleton with a few fixed melodies. `trailing` adds a
  // final vowel (open last syllable) instead of leaving the last consonant as a
  // coda. `lead` prepends a bare vowel (the V-initial syllable option).
  const MELODIES = [
    { vowels: ["a", "i"], trailing: true },
    { vowels: ["u", "a"], trailing: false },
    { vowels: ["i", "a"], trailing: true },
    { vowels: ["aa", "i"], trailing: false },
    { vowels: ["a"], trailing: false, lead: "a" },
    { vowels: ["u", "i"], trailing: true },
  ];

  function buildFromRoot(cons, mel) {
    if (!cons.length) return null;
    let w = mel.lead || "";
    cons.forEach((c, i) => {
      w += c;
      if (i < cons.length - 1 || mel.trailing) w += mel.vowels[i % mel.vowels.length];
    });
    return w;
  }

  function sameRoot(base, meaning) {
    const cons = rootConsonants(base);
    const root = cons.join("·");
    const M = (meaning || "it").trim() || "it";
    const seen = new Set([base]);
    const out = [];
    for (const mel of MELODIES) {
      const w = buildFromRoot(cons, mel);
      if (!w || seen.has(w) || !D.parseWord(w)) continue;
      seen.add(w);
      out.push({ word: w, gloss: `shares the root ${root} — a sibling of “${M}”`, tag: "root" });
    }
    return out;
  }

  // Natural-class neighbours for one-segment sound shifts (Language.md › Phonology).
  const CSHIFT = {
    b: ["f", "m"], f: ["b"], m: ["n", "b"], n: ["m", "d"],
    d: ["z", "n"], z: ["d", "j", "s"], s: ["sh", "z"], sh: ["s", "j"],
    j: ["z", "sh"], r: ["l"], l: ["r", "n"],
    q: ["kh"], kh: ["q"],
  };
  const VSHIFT = {
    a: ["u", "i"], u: ["a", "i"], i: ["a", "u"],
    aa: ["uu", "ii"], uu: ["aa"], ii: ["aa"],
  };
  const countLong = segs => segs.filter(s => isVowel(s) && s.length === 2).length;

  function soundShifts(base, meaning) {
    const segs = segments(base);
    if (!segs) return [];
    const M = (meaning || "it").trim() || "it";
    const seen = new Set([base]);
    const out = [];
    for (let i = 0; i < segs.length; i++) {
      const table = isVowel(segs[i]) ? VSHIFT : CSHIFT;
      for (const repl of table[segs[i]] || []) {
        const cand = segs.slice();
        cand[i] = repl;
        // Keep the one-long-vowel-per-word rule the language observes.
        if (countLong(cand) > 1) continue;
        const w = cand.join("");
        if (seen.has(w) || !D.parseWord(w)) continue;
        seen.add(w);
        out.push({ word: w, gloss: `sound-shifted relative of “${M}” (${segs[i]} → ${repl})`, tag: "shift" });
      }
    }
    return out;
  }

  // ── English-side family ──────────────────────────────────────────────────────
  // The other half of a semantic field: real related English words to coin terms
  // for. Pulled live from the Datamuse API (free, no key, CORS-enabled). Grouped
  // by relation; deduped so each word shows once under its strongest relation.
  const DATAMUSE = "https://api.datamuse.com/words?";
  const EN_RELATIONS = [
    { title: "Synonyms", code: "rel_syn", max: 10 },
    { title: "Associations", code: "rel_trg", max: 12 },
    { title: "Kinds & parts", code: "rel_spc", max: 6 },
  ];

  async function englishKin(meaning) {
    const m = (meaning || "").trim();
    if (!m) return { error: false, groups: [] };
    const q = encodeURIComponent(m);

    let failures = 0;
    const raw = await Promise.all(EN_RELATIONS.map(async rel => {
      try {
        const r = await fetch(`${DATAMUSE}${rel.code}=${q}&max=${rel.max}`);
        if (!r.ok) { failures++; return { title: rel.title, words: [] }; }
        const data = await r.json();
        return { title: rel.title, words: data.map(d => d.word) };
      } catch (_) {
        failures++;
        return { title: rel.title, words: [] };
      }
    }));

    // Dedupe across groups (and against the meaning itself); keep group order.
    const seen = new Set([m.toLowerCase()]);
    const groups = [];
    for (const g of raw) {
      const words = [];
      for (const w of g.words) {
        const lw = w.toLowerCase();
        if (seen.has(lw)) continue;
        seen.add(lw);
        words.push(w);
      }
      if (words.length) groups.push({ title: g.title, words });
    }
    return { error: failures === EN_RELATIONS.length, groups };
  }

  // Top-level: the full family for a base word + meaning.
  function family(base, meaning) {
    base = (base || "").trim().toLowerCase();
    if (!base) return null;
    const valid = !!D.parseWord(base);
    return {
      base,
      valid,
      root: rootConsonants(base).join("·"),
      groups: [
        { title: "Derived forms", note: "Regular lexicon affixes.", items: derivations(base, meaning) },
        { title: "Same root", note: "Irregular — re-vowelled skeleton.", items: sameRoot(base, meaning) },
        { title: "Sound shifts", note: "Irregular — drifted doublets.", items: soundShifts(base, meaning) },
      ].filter(g => g.items.length),
    };
  }

  const api = { family, derivations, sameRoot, soundShifts, rootConsonants, englishKin };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.Semantics = api;
})();
