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

  // ── Inflected-form generation ──────────────────────────────────────────────
  // All paradigms below take the *listed* plural root from the glossary, which
  // is authoritative and may override the regular formation rule. A null plural
  // root means none was recorded, so plural-based forms cannot be built.

  // Strip the final consonant of a word (handling the kh/sh digraphs as one C).
  // This is the singular-present stem of a verb and the passive-participle stem.
  function stripFinalC(word) {
    if (word.endsWith("kh") || word.endsWith("sh")) return word.slice(0, -2);
    return word.slice(0, -1);
  }

  // Append the object marker, harmonizing with the last syllable's vowel:
  //   ends in a vowel     -> -rV   (V = that vowel, shortened)
  //   ends in a consonant -> -Vr   (V = the last syllable's vowel, shortened)
  function withObject(form) {
    const w = parseWord(form);
    if (!w || !w.length) return null;
    const last = w[w.length - 1];
    let vowel = null;
    for (const seg of last) if (isVowel(seg)) vowel = toShort(seg);
    if (vowel === null) return null;
    return isVowel(last[last.length - 1]) ? form + "r" + vowel : form + vowel + "r";
  }

  // Noun / adjective declension (singular + plural, each with an object form).
  function declineNominal(word, listedPlural) {
    const rows = [
      { label: "Singular", form: word },
      { label: "Singular · object", form: withObject(word) },
      { label: "Plural", form: listedPlural || null },
      { label: "Plural · object", form: listedPlural ? withObject(listedPlural) : null },
    ];
    return { title: "Declension", rows };
  }

  // True when the glossary translation marks the verb as intransitive-only,
  // i.e. contains "(intr.)" but not the combined "(tr./intr.)" form.
  function isIntransitiveOnly(translation) {
    return /\(intr\.\)/.test(translation || "");
  }

  // True when the glossary translation marks the verb as both transitive and
  // intransitive, i.e. "(tr./intr.)".
  function isBothTransitivity(translation) {
    return /\(tr\.\/intr\.\)/.test(translation || "");
  }

  // Third-group (irregular) verbs: present/perfect/unreal stems are suppletive
  // rather than derived from a single root, so they're listed wholesale.
  const IRREGULAR_VERBS = {
    fiya: {
      sing: { present: "fi", perfect: "fiwa", unreal: "fili" },
      plur: { present: "izif", perfect: "izifwa", unreal: "izifli" },
    },
    shuda: {
      sing: { present: "shu", perfect: "shuwa", unreal: "shuli" },
      plur: { present: "ushuq", perfect: "ushuqwa", unreal: "ushuqli" },
    },
  };

  function conjugateIrregularVerb(word) {
    const v = IRREGULAR_VERBS[word];
    if (!v) return null;
    return [{
      title: "Conjugation",
      note: "Irregular verb: the singular and plural stems are suppletive.",
      rows: [
        { label: "Present · sing.", form: v.sing.present },
        { label: "Present · plur.", form: v.plur.present },
        { label: "Perfect · sing.", form: v.sing.perfect },
        { label: "Perfect · plur.", form: v.plur.perfect },
        { label: "Unreal · sing.", form: v.sing.unreal },
        { label: "Unreal · plur.", form: v.plur.unreal },
      ],
    }];
  }

  // Verb conjugation: present/perfect/unreal in both numbers, plus participles.
  function conjugateVerb(word, listedPlural, translation) {
    const stem = stripFinalC(word);                 // singular present stem
    const pl = listedPlural || null;                // plural stem = plural root
    const sx = (base, s) => (base ? base + s : null);

    const tenses = {
      title: "Conjugation",
      rows: [
        { label: "Present · sing.", form: stem },
        { label: "Present · plur.", form: pl },
        { label: "Perfect · sing.", form: stem + "wa" },
        { label: "Perfect · plur.", form: sx(pl, "wa") },
        { label: "Unreal · sing.", form: stem + "li" },
        { label: "Unreal · plur.", form: sx(pl, "li") },
      ],
    };
    const participles = {
      title: "Participles",
      // Passive pair first so they share a row; the lone active present then
      // starts a fresh row instead of being orphaned beside a passive form.
      rows: [],
    };
    if (!isIntransitiveOnly(translation)) {
      if (isBothTransitivity(translation)) {
        participles.note = "The passive past participle applies only to transitive verbs.";
      }
      participles.rows.push(
        { label: "Passive past · sing.", form: stem + "n" },
        { label: "Passive past · plur.", form: sx(pl, "n") },
      );
    }
    participles.rows.push({ label: "Active present", form: sx(pl, "f") });
    return [tenses, participles];
  }

  // Irregular personal-pronoun paradigms, transcribed from Language.md. Keyed by
  // the singular subject form (the glossary's dictionary entry).
  const PRONOUNS = {
    ishi: { person: "1st person",
      sing: { subj: "ishi", obj: "ishir", poss: "isha" },
      plur: { subj: "iwiish", obj: "iwiishir", poss: "iwiisha" } },
    bij: { person: "2nd person",
      sing: { subj: "bij", obj: "bijir", poss: "bisha" },
      plur: { subj: "iibji", obj: "iibjir", poss: "iibsha" } },
    zif: { person: "3rd person · animate",
      sing: { subj: "zif", obj: "zifir", poss: "zifaj" },
      plur: { subj: "iizfi", obj: "iizfir", poss: "iizfij" } },
    aba: { person: "3rd person · inanimate",
      sing: { subj: "aba", obj: "abar", poss: "abaj" },
      plur: { subj: "awaab", obj: "awaabar", poss: "awaabaj" } },
  };

  // Reverse lookup: any subject/object/possessive form, singular or plural,
  // maps back to its PRONOUNS entry — so the glossary row for e.g. *iwiish*
  // (we) or *isha* (my/mine) opens the same full paradigm as *ishi* (I).
  const PRONOUN_FORMS = {};
  for (const [key, p] of Object.entries(PRONOUNS)) {
    for (const n of ['sing', 'plur']) {
      for (const form of Object.values(p[n])) {
        if (!(form in PRONOUN_FORMS)) PRONOUN_FORMS[form] = key;
      }
    }
  }

  function declinePronoun(word) {
    const p = PRONOUNS[PRONOUN_FORMS[word]];
    if (!p) return null;
    const block = (n) => ({
      title: n === "sing" ? "Singular" : "Plural",
      rows: [
        { label: "Subject", form: p[n].subj },
        { label: "Object", form: p[n].obj },
        { label: "Possessive", form: p[n].poss },
      ],
    });
    return { person: p.person, sections: [block("sing"), block("plur")] };
  }

  // Top-level entry: returns { kind, note?, sections: [{title, note?, rows}] } for
  // a glossary entry, or null if the entry has no generable paradigm. `klass` is
  // the glossary class string (e.g. "n, adj" or "pre, n"); a word may yield more
  // than one section (e.g. an entry that is both a verb and a noun).
  function paradigm(word, klass, listedPlural, translation) {
    const classes = (klass || "").split(/,\s*/).map(c => c.trim()).filter(Boolean);

    if (classes.includes("pro")) {
      const pro = declinePronoun(word);
      if (!pro) return null;
      return { kind: "pronoun", note: "Personal pronouns are irregular.", sections: pro.sections, sub: pro.person };
    }

    const sections = [];
    if (classes.includes("v")) {
      sections.push(...(IRREGULAR_VERBS[word]
        ? conjugateIrregularVerb(word)
        : conjugateVerb(word, listedPlural, translation)));
    }
    if (classes.includes("n") || classes.includes("adj")) sections.push(declineNominal(word, listedPlural));

    if (!sections.length) return null;
    return { kind: "regular", sections };
  }

  // True when the entry has a paradigm worth showing (so the UI can mark it).
  function isInflectable(word, klass) {
    const classes = (klass || "").split(/,\s*/).map(c => c.trim());
    if (classes.includes("pro")) return word in PRONOUN_FORMS;
    return classes.includes("v") || classes.includes("n") || classes.includes("adj");
  }

  // ── Single-form inflection (for the translation assistant) ─────────────────
  // Where paradigm() lays out every cell of a word's table, the assistant needs
  // the one form a set of grammatical choices selects. The choices are carried as
  // a small list of *tags* (e.g. ["pl","o"] or ["perf"]); inflectionAxes() tells
  // the UI which tags are meaningful for a class, and inflect() turns word+tags
  // into the single inflected string.

  // The inflecting class of an entry, by the same precedence paradigm() uses.
  function primaryClass(klass) {
    const classes = (klass || "").split(/,\s*/).map(c => c.trim());
    if (classes.includes("pro")) return "pro";
    if (classes.includes("v")) return "v";
    if (classes.includes("n") || classes.includes("adj")) return "nominal";
    return "invariant";
  }

  // Reverse map: any pronoun form → its grammatical coordinates, so a looked-up
  // form (e.g. *iwiish* "we", *isha* "my") can be traced to its base entry and
  // the number/case it already encodes.
  const PRONOUN_SLOT = {};
  for (const [key, p] of Object.entries(PRONOUNS)) {
    for (const num of ["sing", "plur"]) {
      for (const cse of ["subj", "obj", "poss"]) {
        const form = p[num][cse];
        if (!(form in PRONOUN_SLOT)) PRONOUN_SLOT[form] = { key, num, cse };
      }
    }
  }

  // Normalise a pronoun form to its dictionary base (1st-sing subject of its
  // person) plus the tags that recover the looked-up form. Lets the assistant
  // treat every pronoun uniformly: a singular-subject base steered by tags.
  function pronounBase(word) {
    const slot = PRONOUN_SLOT[word];
    if (!slot) return null;
    const tags = [];
    if (slot.num === "plur") tags.push("pl");
    if (slot.cse === "obj") tags.push("o");
    else if (slot.cse === "poss") tags.push("poss");
    return { base: PRONOUNS[slot.key].sing.subj, tags };
  }

  // The grammatical axes available for a class. Each axis is either a `select`
  // (one option active, the empty-tag option being the default) or a `toggle`
  // (its single tag present or not). `appliesWhen` hides an axis for selections
  // where it's meaningless (a participle has no separate plural form).
  function inflectionAxes(klass) {
    switch (primaryClass(klass)) {
      case "nominal":
        return [
          { key: "number", label: "Number", type: "select", options: [
            { tag: "", label: "sing." }, { tag: "pl", label: "plural" } ] },
          { key: "object", label: "Object", type: "toggle", options: [
            { tag: "o", label: "object" } ] },
        ];
      case "v":
        return [
          { key: "form", label: "Form", type: "select", options: [
            { tag: "", label: "present" }, { tag: "p", label: "perfect" },
            { tag: "un", label: "unreal" }, { tag: "ap", label: "act. part." },
            { tag: "pp", label: "pass. part." }, { tag: "imp", label: "imper." } ] },
          { key: "number", label: "Number", type: "select",
            appliesWhen: sel => !["ap", "imp"].includes(sel.form),
            options: [ { tag: "", label: "sing." }, { tag: "pl", label: "plural" } ] },
        ];
      case "pro":
        return [
          { key: "case", label: "Case", type: "select", options: [
            { tag: "", label: "subject" }, { tag: "o", label: "object" },
            { tag: "poss", label: "possess." } ] },
          { key: "number", label: "Number", type: "select", options: [
            { tag: "", label: "sing." }, { tag: "pl", label: "plural" } ] },
        ];
      default:
        return [];
    }
  }

  // Read a tag list back into a per-axis selection (the inverse of the chips the
  // UI shows): each select axis → its active tag (or ""), each toggle → boolean.
  function selectionFromTags(klass, tags) {
    tags = tags || [];
    const sel = {};
    for (const ax of inflectionAxes(klass)) {
      if (ax.type === "toggle") {
        sel[ax.key] = tags.includes(ax.options[0].tag);
      } else {
        let chosen = "";
        for (const opt of ax.options) if (opt.tag && tags.includes(opt.tag)) chosen = opt.tag;
        sel[ax.key] = chosen;
      }
    }
    return sel;
  }

  // The inverse: a selection object → its canonical (axis-ordered) tag list.
  function tagsFromSelection(klass, sel) {
    const tags = [];
    for (const ax of inflectionAxes(klass)) {
      if (ax.type === "toggle") { if (sel[ax.key]) tags.push(ax.options[0].tag); }
      else if (sel[ax.key]) tags.push(sel[ax.key]);
    }
    return tags;
  }

  const TENSE_KEY = { pres: "present", perf: "perfect", unreal: "unreal" };

  // Produce the single inflected form of `entry` ({word, klass, plural}) under
  // `tags`. Pronoun words must be the normalised base (see pronounBase). Returns
  // the string, or null when the chosen form can't be built (e.g. a plural form
  // with no plural root, a passive participle of a "to be" verb).
  function inflect(entry, tags) {
    tags = tags || [];
    const word = entry.word;
    const plural = entry.plural || pluralRoot(word);
    const isPl = tags.includes("pl");

    switch (primaryClass(entry.klass)) {
      case "pro": {
        const slot = PRONOUN_SLOT[word];
        if (!slot) return word;
        const p = PRONOUNS[slot.key];
        const num = isPl ? "plur" : "sing";
        const cse = tags.includes("o") ? "obj" : tags.includes("poss") ? "poss" : "subj";
        return p[num][cse];
      }
      case "v": {
        const irr = IRREGULAR_VERBS[word];
        if (tags.includes("ap")) return plural ? plural + "f" : null;       // active participle
        if (tags.includes("pp")) {                                          // passive participle
          if (irr) return null;
          return isPl ? (plural ? plural + "n" : null) : stripFinalC(word) + "n";
        }
        if (tags.includes("imp")) return word;                              // imperative = infinitive
        const tense = tags.includes("p") ? "perf" : tags.includes("un") ? "unreal" : "pres";
        if (irr) return irr[isPl ? "plur" : "sing"][TENSE_KEY[tense]];
        const stem = isPl ? plural : stripFinalC(word);
        if (!stem) return null;
        return tense === "perf" ? stem + "wa" : tense === "unreal" ? stem + "li" : stem;
      }
      case "nominal": {
        let base = isPl ? plural : word;
        if (!base) return null;
        return tags.includes("o") ? withObject(base) : base;
      }
      default:
        return word;                                                        // invariant
    }
  }

  const api = {
    parseWord, pluralRoot, pluralRegularity,
    withObject, paradigm, isInflectable,
    primaryClass, inflectionAxes, selectionFromTags, tagsFromSelection,
    inflect, pronounBase,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.Declension = api;
})();
