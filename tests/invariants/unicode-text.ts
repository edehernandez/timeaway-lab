// Purpose: shared Unicode text for the display-name rows (REQ-024 comparison, REQ-013/REQ-020 blank names) — the White_Space and default-ignorable characters A-056 and A-058 name, drawn per run, and the comparison key REQ-024's own words define.
// Provenance: hand-authored (test-author pass, slice 1, batch test-author-27), from PRD REQ-024 AMENDED (A-058) and the amended ROW-216 (A-056); the character sets come from the Unicode Character Database (PropList.txt White_Space, DerivedCoreProperties.txt Default_Ignorable_Code_Point), named here and cross-read from the test runner's own Unicode tables — never from the product. A public harness boundary beside harness.ts, imported by ledger tests only. It asserts nothing about any row.
//
// Why the key is stated here. REQ-024 compares two display names "after NFC normalization and ignoring letter case,
// surrounding white space (the Unicode White_Space characters) and characters that display as nothing (the Unicode
// default-ignorable code points, wherever they sit)". nameKey() is that sentence, written once, so a test can say
// whether a name the product read back is the name the admin typed under the comparison the owner ratified. It is
// an oracle taken from the PRD's words, not from the product's code.
import { SetupError } from './harness';

/** Every Unicode White_Space code point (PropList.txt; 25, stable since Unicode 6.3). */
export const WHITE_SPACE: readonly number[] = [
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x0085, 0x00a0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
];

/** Named default-ignorable code points from across the property's ranges (DerivedCoreProperties.txt), assigned ones. */
export const NAMED_IGNORABLES: readonly number[] = [
  0x00ad, // soft hyphen
  0x034f, // combining grapheme joiner
  0x061c, // Arabic letter mark
  0x115f, 0x1160, // Hangul choseong / jungseong fillers
  0x17b4, 0x17b5, // Khmer inherent vowels
  0x180b, 0x180c, 0x180d, 0x180e, // Mongolian free variation selectors, vowel separator
  0x200b, 0x200c, 0x200d, 0x200e, 0x200f, // zero-width space, non-joiner, joiner; LRM, RLM
  0x202a, 0x202e, // bidi embedding / override
  0x2060, 0x2061, 0x2064, // word joiner, invisible operators
  0x2066, 0x2069, 0x206f, // bidi isolates, nominal digit shapes
  0x3164, // Hangul filler
  0xfe00, 0xfe0f, // variation selectors
  0xfeff, // zero-width no-break space
  0xffa0, // halfwidth Hangul filler
  0x1bca0, // shorthand format letter overlap
  0x1d173, // musical symbol begin beam
  0xe0001, 0xe0020, 0xe007f, // language tag, tag space, cancel tag
  0xe0100, 0xe01ef, // variation selectors supplement
];

const DI = /\p{Default_Ignorable_Code_Point}/gu;
const DI_ONE = /^\p{Default_Ignorable_Code_Point}$/u;
const WS_ONE = /^\p{White_Space}$/u;
const UNASSIGNED_ONE = /^\p{Cn}$/u;
const SURROUNDING_WS = /^\p{White_Space}+|\p{White_Space}+$/gu;

let allIgnorables: number[] | null = null;
let assignedIgnorables: number[] | null = null;

function enumerate(): void {
  if (allIgnorables) return;
  const all: number[] = [];
  const assigned: number[] = [];
  for (let c = 0; c <= 0x10ffff; c++) {
    if (c >= 0xd800 && c <= 0xdfff) continue;
    const s = String.fromCodePoint(c);
    if (DI_ONE.test(s)) {
      all.push(c);
      if (!UNASSIGNED_ONE.test(s)) assigned.push(c);
    }
  }
  // The runner's tables must agree with the named lists, or the draws below would not be the sets the PRD names.
  const wsEngine: number[] = [];
  for (let c = 0; c <= 0xffff; c++) if (c < 0xd800 || c > 0xdfff) if (WS_ONE.test(String.fromCodePoint(c))) wsEngine.push(c);
  if (wsEngine.join(',') !== WHITE_SPACE.join(',')) {
    throw new SetupError(`the test runner's White_Space table (${wsEngine.length} code points) differs from the 25 PropList.txt names`);
  }
  const missing = NAMED_IGNORABLES.filter((c) => !all.includes(c));
  if (missing.length > 0 || all.length < 4000) {
    throw new SetupError(`the test runner's Default_Ignorable_Code_Point table lacks ${missing.map(u).join(' ')} or is short (${all.length})`);
  }
  allIgnorables = all;
  assignedIgnorables = assigned;
}

/** Every default-ignorable code point (about 4 170, assigned or not), from the runner's Unicode tables. */
export function everyIgnorable(): readonly number[] {
  enumerate();
  return allIgnorables!;
}

/** The assigned default-ignorable code points (the ones a keyboard or a paste can carry), from the runner's tables. */
export function assignedIgnorable(): readonly number[] {
  enumerate();
  return assignedIgnorables!;
}

/** `n` distinct members of `xs`, drawn afresh on every run. */
export function draw(xs: readonly number[], n: number): number[] {
  const pool = [...xs];
  const out: number[] = [];
  while (out.length < n && pool.length > 0) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

/** One member of `xs`, drawn afresh on every run. */
export function drawOne(xs: readonly number[]): number {
  return xs[Math.floor(Math.random() * xs.length)];
}

/** The string of the given code points. */
export function chars(...cps: number[]): string {
  return String.fromCodePoint(...cps);
}

/** "U+0041" for one code point. */
export function u(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

/** A name shown with every character outside printable ASCII as U+XXXX, so a message says exactly what was sent. */
export function show(s: string): string {
  return JSON.stringify(
    Array.from(s)
      .map((ch) => {
        const cp = ch.codePointAt(0)!;
        return cp >= 0x21 && cp <= 0x7e ? ch : cp === 0x20 ? ' ' : `<${u(cp)}>`;
      })
      .join(''),
  );
}

/** `s` with `insert` placed before its `index`-th code point. */
export function insertAt(s: string, index: number, insert: string): string {
  const cps = Array.from(s);
  return [...cps.slice(0, index), insert, ...cps.slice(index)].join('');
}

/**
 * REQ-024's comparison key, from its own words: drop the default-ignorable code points wherever they sit, drop the
 * surrounding White_Space, put the rest in NFC and ignore letter case. Two names are "the same display name" under
 * REQ-024 exactly when their keys are equal.
 */
export function nameKey(s: string): string {
  const visible = s.replace(DI, '').replace(SURROUNDING_WS, '');
  return visible.normalize('NFC').toLowerCase().normalize('NFC');
}

/** True when `s` is blank in ROW-216's sense (A-056): only White_Space and default-ignorable code points, in any mix. */
export function isBlankName(s: string): boolean {
  return nameKey(s) === '';
}
