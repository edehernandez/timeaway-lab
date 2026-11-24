// Purpose: the measure module — the ONE driver the surface instrument, the rendered extractor and the fidelity graders read the running page through: one navigation and one evaluate per state, answered in the contract's line vocabulary.
// Provenance: hand-authored (test-author pass, slice 0, code skeleton harness pass), to the plugin's seed/extractors/README.md "The measure module".
//
// Page conventions this harness contract names (a design pack, when there is one, draws to them):
//   - a screen's section root carries its marker: data-marker="<marker>" (e.g. data-marker="P02"); the state is the
//     caller's (the fixture it reached), and when the root also carries data-state="<state>" it must equal it;
//   - an identified element carries data-element="<identifier>" inside that section; the root's identifier is "root";
//   - the shell (header, footer, primary navigation) stands under the shell rows' markers, each a data-marker too;
//   - a console error is a console message of type "error" or an uncaught page error, seen from before the load
//     until the evaluate.
//
// Answer lines (and nothing else):
//   navigations=<n>
//   ok <marker>/<state>/<identifier>:<property>
//   differs <marker>/<state>/<identifier>:<property> cited=<v> painted=<v>
//   missing element <marker>/<state>/<identifier>
//   stray <marker>/<state> <identifier or control>
//   missing marker <marker>/<state>
//   missing content <marker>/<state> <text>
//   console error <marker>/<state> <message>
//   status <marker>/<state> <code>
//
// The rules: one navigation per call (navigations=1, and the caller's pins hook reads the SAME page afterwards); one
// page.evaluate for every property, content and control; colours as colours and lengths as computed lengths — each
// cited literal is resolved in the same browser on a probe (a shallow clone of the element, beside it, with the cited
// value set on it), so a token, a hex or rgb() compare as the colour they paint and 1rem compares as 16px; lengths
// within 1px are equal; a literal the browser cannot resolve (CSS.supports false) is not a finding and answers ok;
// the denominator rule: a stray control is any control on the page OUTSIDE the shell markers that the state's literal
// set does not draw, and any data-element inside the section the literal set lacks.
import type { Page } from '@playwright/test';

/** The properties the canvas declares on one identified element: CSS property name → cited literal. */
export type ElementLiteral = Record<string, string>;

/** A state's literal set, read by the surface pass from the canvas at production time and carried by the instrument. */
export interface LiteralSet {
  /** "root" (the section root) and every data-element identifier → its declared properties. */
  elements: Record<string, ElementLiteral>;
  /** The literal text the canvas draws for the state, outside {{ placeholders }}. */
  content: string[];
  /** The controls the canvas draws for the state: data-element identifiers or accessible names. */
  controls: string[];
}

export interface MeasureCall {
  /** A page opened through the harness's engine door as the row's actor (harness.openPage), not yet navigated for this state. */
  page: Page;
  /** The state's route, relative to the product's base URL. */
  route: string;
  /** The screen marker, e.g. "P02". */
  marker: string;
  /** The state, e.g. "populated". */
  state: string;
  literal: LiteralSet;
  /** The shell rows' markers (header, footer, primary navigation): controls under them are outside the denominator. */
  shellMarkers: string[];
  /** Bounded readiness wait for the marker after the load, in ms (default 10 000). Never a fixed sleep. */
  readyTimeoutMs?: number;
}

interface EvalInput {
  marker: string;
  state: string;
  elements: Record<string, ElementLiteral>;
  content: string[];
  controls: string[];
  shellMarkers: string[];
}

/**
 * Loads the route ONCE on the given page and evaluates the state's literal set in ONE page.evaluate.
 * Returns the answer lines (see the header). The page stays loaded for the caller's pins hook.
 */
export async function measure(call: MeasureCall): Promise<string[]> {
  const { page, route, marker, state, literal, shellMarkers } = call;
  const tag = `${marker}/${state}`;
  const consoleErrors: string[] = [];
  const onConsole = (msg: { type(): string; text(): string }) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  };
  const onPageError = (err: Error) => consoleErrors.push(err.message);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  const lines: string[] = ['navigations=1'];
  try {
    const response = await page.goto(route, { waitUntil: 'load' });
    lines.push(`status ${tag} ${response ? response.status() : 0}`);
    await page
      .locator(`[data-marker="${cssEscape(marker)}"]`)
      .first()
      .waitFor({ state: 'attached', timeout: call.readyTimeoutMs ?? 10_000 })
      .catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);

    const input: EvalInput = {
      marker,
      state,
      elements: literal.elements,
      content: literal.content,
      controls: literal.controls,
      shellMarkers,
    };
    const evaluated = await page.evaluate(evaluateState, input);
    lines.push(...evaluated);
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
  }
  for (const message of consoleErrors) lines.push(`console error ${tag} ${oneLine(message)}`);
  return lines;
}

/**
 * The lines that fail a surface case: everything but `navigations=1`, `ok …` and the page's own `status` (default 200).
 * A surface case asserts this is empty, naming its row in the message.
 */
export function failures(lines: string[], expectedStatus = 200): string[] {
  return lines.filter((line) => {
    if (line === 'navigations=1') return false;
    if (line.startsWith('ok ')) return false;
    const status = /^status \S+ (\d+)$/.exec(line);
    if (status) return Number(status[1]) !== expectedStatus;
    return true;
  });
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, 300);
}

function cssEscape(s: string): string {
  return s.replace(/["\\]/g, '\\$&');
}

// Runs in the page. Self-contained: it may use nothing from this module's scope.
function evaluateState(input: EvalInput): string[] {
  const out: string[] = [];
  const tag = `${input.marker}/${input.state}`;
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const attrSel = (name: string, value: string) => `[${name}="${value.replace(/["\\]/g, '\\$&')}"]`;

  const root = document.querySelector(attrSel('data-marker', input.marker)) as HTMLElement | null;
  const rootState = root?.getAttribute('data-state');
  if (!root || (rootState !== null && rootState !== undefined && rootState !== input.state)) {
    out.push(`missing marker ${tag}`);
    return out;
  }

  // Elements: the root by its marker, each identifier inside the section (the first, when it repeats).
  const targets: { id: string; el: HTMLElement; props: Record<string, string> }[] = [];
  for (const [id, props] of Object.entries(input.elements)) {
    const el = id === 'root' ? root : (root.querySelector(attrSel('data-element', id)) as HTMLElement | null);
    if (!el) {
      out.push(`missing element ${tag}/${id}`);
      continue;
    }
    targets.push({ id, el, props });
  }

  // Painted values first, all of them, before any probe touches the layout.
  const painted = targets.map((t) => {
    const cs = getComputedStyle(t.el);
    const values: Record<string, string> = {};
    for (const prop of Object.keys(t.props)) values[prop] = cs.getPropertyValue(prop);
    return values;
  });

  const lengthTokens = (v: string): number[] | null => {
    const parts = norm(v).split(' ');
    const nums: number[] = [];
    for (const p of parts) {
      const m = /^(-?\d*\.?\d+(?:e-?\d+)?)px$/.exec(p);
      if (m) nums.push(Number(m[1]));
      else if (p === '0') nums.push(0);
      else return null;
    }
    return nums;
  };
  const same = (a: string, b: string): boolean => {
    if (norm(a) === norm(b)) return true;
    const la = lengthTokens(a);
    const lb = lengthTokens(b);
    if (la && lb && la.length === lb.length) return la.every((n, i) => Math.abs(n - lb[i]) <= 1);
    return false;
  };

  // Each cited literal resolved in this browser on a probe: a shallow clone beside the element, the cited value set on it.
  targets.forEach((t, i) => {
    for (const [prop, cited] of Object.entries(t.props)) {
      const subject = `${tag}/${t.id}:${prop}`;
      if (typeof CSS !== 'undefined' && CSS.supports && !CSS.supports(prop, cited)) {
        out.push(`ok ${subject}`); // a literal the browser cannot resolve is not a finding
        continue;
      }
      let resolved = cited;
      const parent = t.el.parentNode;
      if (parent) {
        const probe = t.el.cloneNode(false) as HTMLElement;
        probe.removeAttribute('id');
        probe.removeAttribute('data-element');
        probe.removeAttribute('data-marker');
        probe.setAttribute('aria-hidden', 'true');
        probe.style.setProperty(prop, cited, 'important');
        parent.insertBefore(probe, t.el.nextSibling);
        resolved = getComputedStyle(probe).getPropertyValue(prop);
        parent.removeChild(probe);
      }
      const value = painted[i][prop];
      if (same(resolved, value)) out.push(`ok ${subject}`);
      else out.push(`differs ${subject} cited=${norm(cited)} painted=${norm(value)}`);
    }
  });

  // Content the canvas draws for the state, inside the section.
  const text = norm(root.innerText || root.textContent || '');
  for (const c of input.content) {
    if (!text.includes(norm(c))) out.push(`missing content ${tag} ${norm(c)}`);
  }

  // The denominator: every control on the page outside the shell markers; and every identifier inside the section.
  const declared = new Set(input.controls.map(norm));
  const declaredIds = new Set(Object.keys(input.elements));
  const shells = input.shellMarkers
    .map((m) => Array.from(document.querySelectorAll(attrSel('data-marker', m))))
    .reduce((a, b) => a.concat(b), [] as Element[]);
  const inShell = (el: Element) => shells.some((s) => s.contains(el));
  const controlSel =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [contenteditable="true"]';
  const seen = new Set<string>();
  for (const el of Array.from(document.querySelectorAll(controlSel))) {
    if (inShell(el)) continue;
    const ident = el.closest('[data-element]')?.getAttribute('data-element');
    const own = el.getAttribute('data-element');
    const label = el.id ? document.querySelector(`label[for="${el.id.replace(/["\\]/g, '\\$&')}"]`) : null;
    const name = norm(
      el.getAttribute('aria-label') ||
        (label ? label.textContent || '' : '') ||
        (el as HTMLElement).innerText ||
        el.getAttribute('title') ||
        el.getAttribute('placeholder') ||
        el.getAttribute('name') ||
        el.getAttribute('value') ||
        el.tagName.toLowerCase(),
    );
    if ((own && declared.has(own)) || declared.has(name) || (ident && declared.has(ident))) continue;
    const key = own || name;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`stray ${tag} ${key}`);
  }
  for (const el of Array.from(root.querySelectorAll('[data-element]'))) {
    const id = el.getAttribute('data-element') || '';
    if (declaredIds.has(id) || declared.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(`stray ${tag} ${id}`);
  }
  return out;
}
