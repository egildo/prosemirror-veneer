// The veneer as CSS: one sheet, in a cascade layer after the author's, each extent a sublayer.
//
// THE LAYERS: the author's sheets are in a cascade layer the host names (`author` here; BelType's Cicero wraps them in it when run with `layer`), and the veneer in `veneer`, after it, so a rule outranks the theme whatever the theme's specificity. Inside, each extent is a sublayer, the wider first: a rule on one block outranks one on its kind in a section, which outranks one on the kind everywhere, which outranks one on the document, whatever their selectors' specificity; within one sublayer, the list's order decides a tie.
import { SPEC } from './properties.js';

export const AUTHOR_LAYER = 'author';
export const VENEER_LAYER = 'veneer';
/** The statement a page carries at the top of its head, so `veneer` comes after the author's layer. */
export const layersStatement = (author = AUTHOR_LAYER) => `@layer ${author}, ${VENEER_LAYER};`;
export const LAYERS_STATEMENT = layersStatement();
const SUBLAYER = { document: 'document', everywhere: 'kind', section: 'section', block: 'block' };
const SUBLAYERS = `@layer ${['document', 'kind', 'section', 'block'].map((s) => `${VENEER_LAYER}.${s}`).join(', ')};`;

const ruleText = (rule) => `@layer ${VENEER_LAYER}.${SUBLAYER[rule.extent] ?? 'block'} { ${rule.selector} { ${Object.entries(rule.declarations).map(([p, v]) => `${p}: ${v};`).join(' ')} } }`;

/** The sheet's text for a list: the sublayers' order stated first, then each rule in its extent's sublayer, in the list's order (later rules win a tie within one). */
export const sheetText = (list) => (list.length ? [SUBLAYERS, ...list.map(ruleText)].join('\n') : '');

/**
 * The contract a rule keeps with a paged engine, checked where a rule is made (after `declarationOf`, the gate of each value): the selector holds no `:has()` (the copies of a divided block would not match it), each declaration is one of `PROPERTIES` with a value the browser accepts for it, and nothing in it is a paged-media form a rewriter would have had to rewrite.
 *
 * @throws {RangeError} naming what is refused
 */
export function contract(rule) {
  if (/:has\s*\(/i.test(rule.selector)) throw new RangeError('veneer: a selector may not use :has() (the copies of a divided block would not match it)');
  const entries = Object.entries(rule.declarations);
  if (!entries.length) throw new RangeError('veneer: a rule needs a declaration');
  for (const [p, v] of entries) {
    if (!SPEC.has(p)) throw new RangeError(`veneer: ${p} is not a property a rule sets`);
    if (/\b(running|string|element|target-counter|target-text|leader)\s*\(/i.test(v)) throw new RangeError(`veneer: "${v}" is a paged-media form the engine would have to rewrite`);
    if (typeof CSS !== 'undefined' && CSS.supports && !CSS.supports(p, v)) throw new RangeError(`veneer: "${v}" is not a value of ${p}`);
  }
}
