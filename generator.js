// ── Phonotactic word generator ───────────────────────────────────────────────
// Port of etc/generator.lua. A small weighted context-free grammar that emits
// phonotactically well-formed words for the conlanger to mine. Every word it
// produces parses cleanly under the syllable rules in decline.js / lang.lua.
//
// Grammar (verbatim from generator.lua; numbers are weights for the element to
// their left, default 1):
//   start <- IT
//   I     <- ""×3 | "V"×2                 optional leading bare vowel
//   T     <- S | SS×3 | SSS×3 | SSSS       1–4 syllables, mostly 2–3
//   S     <- CV×3 | CVF×2                   open or closed syllable
//   C     <- F×14 | w | y                   onset (semivowels are rare onsets)
//   F     <- weighted full consonant
//   V     <- weighted vowel (long vowels rare)
// A closed syllable's coda is an F, never w/y — matching the constraint that a
// semivowel cannot close a syllable.
(function () {
  "use strict";

  // Expand a Lua-style {value, weight, value, weight, …} spec (weight optional,
  // default 1) into a flat array we can sample uniformly.
  function flatten(spec) {
    const out = [];
    for (let i = 0; i < spec.length; i++) {
      if (typeof spec[i] === "number") continue;
      const next = spec[i + 1];
      const factor = typeof next === "number" ? next : 1;
      for (let k = 0; k < factor; k++) out.push(spec[i]);
    }
    return out;
  }

  const RAW = {
    start: ["IT"],
    I: ["", 3, "V", 2],
    T: ["S", 1, "SS", 3, "SSS", 3, "SSSS", 1],
    S: ["CV", 3, "CVF", 2],
    C: ["F", 14, "w", "y"],
    F: [
      "b", 5, "d", 5, "f", 5,
      "sh", 4, "z", 4,
      "r", 3, "s", 3,
      "l", 2, "m", 2, "n", 2,
      "q", 1, "kh", 1, "j", 1,
    ],
    V: ["a", 5, "u", 3, "i", 4, "aa", 1, "uu", "ii"],
  };

  const GRAMMAR = {};
  for (const k in RAW) GRAMMAR[k] = flatten(RAW[k]);

  const pickRandom = arr => arr[Math.floor(Math.random() * arr.length)];

  // Expand one rule. Single uppercase letters are non-terminals (recurse);
  // everything else (lowercase letters, "", digraph halves) is terminal text.
  function expand(rule) {
    const arr = GRAMMAR[rule];
    if (!arr) return rule;
    let out = "";
    for (const ch of pickRandom(arr)) out += expand(ch);
    return out;
  }

  function word() {
    return expand("start");
  }

  // A batch of `n` words. `unique` drops duplicates (common for short words);
  // it gives up after a bounded number of tries so a tiny space still returns.
  function words(n, unique = true) {
    if (!unique) return Array.from({ length: n }, word);
    const seen = new Set();
    let tries = 0;
    while (seen.size < n && tries < n * 40) {
      const w = word();
      if (w) seen.add(w);
      tries++;
    }
    return [...seen];
  }

  const api = { word, words };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.Generator = api;
})();
