// The properties a rule may set, and the gate each value passes.

/**
 * The properties a rule may set, in the three groups the paragraph-style dialogs of InDesign and Word have taught, each with the kind of value its control writes: `length` (a finite number and a unit; `line-height` also a bare number), `color` (hex, as `<input type="color">` writes it), `keyword` (one of `options`), `family` (a face family the document declares).
 */
export const PROPERTIES = [
  { name: 'font-family', group: 'Type', kind: 'family' },
  { name: 'font-size', group: 'Type', kind: 'length', min: 0 },
  { name: 'line-height', group: 'Type', kind: 'length', min: 0, bare: true },
  { name: 'letter-spacing', group: 'Type', kind: 'length' },
  { name: 'font-weight', group: 'Type', kind: 'keyword', options: ['300', '400', '500', '600', '700'] },
  { name: 'font-style', group: 'Type', kind: 'keyword', options: ['normal', 'italic'] },
  { name: 'font-variant-caps', group: 'Type', kind: 'keyword', options: ['normal', 'small-caps'] },
  { name: 'color', group: 'Type', kind: 'color' },
  { name: 'text-align', group: 'Paragraph', kind: 'keyword', options: ['start', 'center', 'end', 'justify'] },
  { name: 'text-transform', group: 'Paragraph', kind: 'keyword', options: ['none', 'uppercase', 'lowercase', 'capitalize'] },
  { name: 'hyphens', group: 'Paragraph', kind: 'keyword', options: ['auto', 'manual', 'none'] },
  { name: 'text-indent', group: 'Paragraph', kind: 'length' },
  { name: 'margin-top', group: 'Paragraph', kind: 'length' },
  { name: 'margin-bottom', group: 'Paragraph', kind: 'length' },
  { name: 'break-before', group: 'Page', kind: 'keyword', options: ['auto', 'page', 'right', 'left', 'avoid'] },
  { name: 'break-after', group: 'Page', kind: 'keyword', options: ['auto', 'page', 'avoid'] },
  { name: 'break-inside', group: 'Page', kind: 'keyword', options: ['auto', 'avoid'] }
];
export const UNITS = ['pt', 'px', 'em', 'rem'];
export const SPEC = new Map(PROPERTIES.map((p) => [p.name, p]));
const LENGTH = /^(-?(?:\d+(?:\.\d*)?|\.\d+))(pt|px|em|rem)?$/;

/**
 * The gate a declaration passes before it is a rule's: the value its property's kind admits, written as the sheet will hold it (a family quoted). Nothing else is accepted.
 *
 * @param {string} property
 * @param {unknown} value
 * @param {string[] | null} [families] - the families the document declares, for a `font-family` (any name of letters, digits, spaces and dashes when absent)
 * @returns {string} the value to write
 * @throws {RangeError} saying why
 */
export function declarationOf(property, value, families = null) {
  const spec = SPEC.get(property);
  if (!spec) throw new RangeError(`veneer: ${property} is not a property a rule sets`);
  const v = String(value ?? '').trim();
  // The !important contract: a rule never insists. An author's !important outweighs every rule by the cascade's own rule, and is the author insisting.
  if (/!\s*important/i.test(v)) throw new RangeError('veneer: a rule never carries !important (an author\'s !important outweighs every rule, and is the author insisting)');
  if (spec.kind === 'length') {
    const m = LENGTH.exec(v);
    if (!m || !Number.isFinite(Number(m[1]))) throw new RangeError(`veneer: ${property} needs a number and a unit (${UNITS.join(', ')}${spec.bare ? ', or a bare number' : ''}), not "${v}"`);
    if (!m[2] && !spec.bare) throw new RangeError(`veneer: ${property} needs a unit (${UNITS.join(', ')})`);
    if (spec.min != null && Number(m[1]) < spec.min) throw new RangeError(`veneer: ${property} cannot be negative`);
    return `${Number(m[1])}${m[2] ?? ''}`;
  }
  if (spec.kind === 'color') {
    if (!/^#[0-9a-f]{6}$/i.test(v)) throw new RangeError(`veneer: ${property} needs a colour as #rrggbb, not "${v}"`);
    return v.toLowerCase();
  }
  if (spec.kind === 'keyword') {
    if (!spec.options.includes(v)) throw new RangeError(`veneer: ${property} is one of ${spec.options.join(', ')}, not "${v}"`);
    return v;
  }
  const name = v.replace(/^(["'])(.*)\1$/, '$2');
  if (!/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(name) || (families && !families.includes(name))) throw new RangeError(`veneer: "${name}" is not a face the document declares`);
  return `"${name}"`;
}

/** Every declaration through the gate, as the rule will hold them. */
export const gate = (declarations, families = null) => Object.fromEntries(Object.entries(declarations).map(([p, v]) => [p, declarationOf(p, v, families)]));
