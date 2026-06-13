// ── Plural-root declension ───────────────────────────────────────────────────
// Port of etc/lang.lua. Derives the plural root of a word from its singular form
// via the regular rule (sound inversion + vowel lengthening in the final
// syllable, with linking-consonant insertion and final-semivowel reduction).
// Used by the glossary to flag each listed plural root as regular or irregular.
//
// Grammar (from lang.lua, an LPEG definition):
//   word    <- head? tail*  !.
//   head    <- V closing?                  leading vowel-initial syllable
//   tail    <- C V closing?
//   closing <- C (&C / !.)                 a consonant is a coda only if another
//                                          consonant or word-end follows it;
//                                          otherwise it onsets the next syllable
//   V <- "aa" / "uu" / "ii" / [aui]
//   C <- "kh" / "sh" / [mnqbdjfszrlyw]
(function () {
  "use strict";

  const LONG_V = ["aa", "uu", "ii"];
  const DIGRAPH_C = ["kh", "sh"];
  const C_SET = "mnqbdjfszrlyw";

  function matchV(s, pos) {
    for (const v of LONG_V) if (s.startsWith(v, pos)) return [v, pos + 2];
    const c = s[pos];
    if (c && "aui".includes(c)) return [c, pos + 1];
    return null;
  }

  function matchC(s, pos) {
    for (const c of DIGRAPH_C) if (s.startsWith(c, pos)) return [c, pos + 2];
    const c = s[pos];
    if (c && C_SET.includes(c)) return [c, pos + 1];
    return null;
  }

  // A coda consonant: a C that is followed by another C or by the word-end.
  function matchClosing(s, pos) {
    const m = matchC(s, pos);
    if (!m) return null;
    const next = m[1];
    if (next >= s.length || matchC(s, next)) return m;
    return null;
  }

  // Returns an array of syllables (each an array of captured segments), or null
  // if the string is not a well-formed word.
  function parseWord(input) {
    if (Array.isArray(input)) return input.map(syll => syll.slice());

    const sylls = [];
    let pos = 0;

    // head?  — only a vowel can open a word with no onset consonant.
    const hv = matchV(input, pos);
    if (hv) {
      const syll = [hv[0]];
      pos = hv[1];
      const cl = matchClosing(input, pos);
      if (cl) { syll.push(cl[0]); pos = cl[1]; }
      sylls.push(syll);
    }

    // tail*  — C V closing?
    while (pos < input.length) {
      const c = matchC(input, pos);
      if (!c) return null;
      const v = matchV(input, c[1]);
      if (!v) return null;
      const syll = [c[0], v[0]];
      pos = v[1];
      const cl = matchClosing(input, pos);
      if (cl) { syll.push(cl[0]); pos = cl[1]; }
      sylls.push(syll);
    }

    if (pos !== input.length) return null; // !.  — must consume the whole word
    return sylls;
  }

  const isVowel = s => /[aui]/.test(s);
  const isLong = v => v.length === 2;
  const toShort = v => (isVowel(v) ? v[0] : v);
  const toLong = v => (isLong(v) ? v : v + v);

  const LINKS = {
    a: { a: "w", u: "kh", i: "y" },
    u: { a: "w", u: "kh", i: "y" },
    i: { a: "y", u: "y", i: "w" },
  };
  function getLink(v, w) {
    v = toShort(v); w = toShort(w);
    return (LINKS[v] && LINKS[v][w]) || null;
  }

  const flatten = word => word.map(syll => syll.join("")).join("");

  function pluralRoot(input) {
    const word = parseWord(input);
    if (!word) return null;

    // Vowel-initial single-syllable words are left undecided by the source rules.
    if (word.length === 1 && isVowel(word[0][0])) return null;

    // Shorten every vowel.
    for (const syll of word) {
      for (let i = 0; i < syll.length; i++) syll[i] = toShort(syll[i]);
    }

    // Final syllable:  CV -> VVC ,  CaVCb -> VVCaCbi
    const last = word[word.length - 1];
    [last[0], last[1]] = [last[1], last[0]];
    last[0] = toLong(last[0]);

    // Final semivowel reduction (cannot end a syllable): w -> f, y -> q.
    if (last[1] === "w") last[1] = "f";
    else if (last[1] === "y") last[1] = "q";

    if (last[2]) last[3] = "i";

    // Linking semivowel between the previous syllable's vowel and the new VV.
    const prev = word[word.length - 2];
    if (prev) {
      const link = getLink(prev[prev.length - 1], last[0]);
      if (link) last.unshift(link);
    }

    return flatten(word);
  }

  // Compare the rule's output against the plural root recorded in the glossary.
  // status: "regular" (match), "irregular" (mismatch), "unknown" (rule undefined).
  function pluralRegularity(singular, listedPlural) {
    const computed = pluralRoot(singular);
    if (computed === null) return { status: "unknown", computed: null };
    return { status: computed === listedPlural ? "regular" : "irregular", computed };
  }

  const api = { parseWord, pluralRoot, pluralRegularity };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.Declension = api;
})();
