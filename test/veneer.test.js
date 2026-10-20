import { describe, it, expect } from 'vitest';
import { Schema, Slice } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { candidates, mintId, idsOf, addTransaction, rewriteTransaction, removeDeclarationTransaction, removeTransaction, listOf, stripIds, sheetText, declarationOf, veneerPlugin, veneerKey, veneerCapabilities, veneerTypes } from '../src/index.js';

// A document made of sections, headings and paragraphs, each with an id and a class, the way a book's HTML comes in.
const attrs = { id: { default: null }, class: { default: null } };
const schema = new Schema({
  nodes: {
    doc: { attrs: { veneer: { default: null } }, content: 'section+' },
    section: { attrs, content: 'block+', group: 'block', parseDOM: [{ tag: 'section' }] },
    paragraph: { attrs, content: 'inline*', group: 'block', parseDOM: [{ tag: 'p' }] },
    heading: { attrs: { ...attrs, level: { default: 2 } }, content: 'inline*', group: 'block', parseDOM: [{ tag: 'h2' }] },
    text: { group: 'inline' }
  }
});
const p = (text, a = {}) => schema.nodes.paragraph.create(a, schema.text(text));
const h = (text, a = {}) => schema.nodes.heading.create(a, schema.text(text));
const section = (a, ...kids) => schema.nodes.section.create(a, kids);
const doc = schema.nodes.doc.create(null, [
  section({ id: 'archive' }, h('The archive'), p('First words of the chapter', { class: 'lead' }), section({}, p('Inside the subsection'), p('Second inside'))),
  section({}, p('A chapter nobody named'))
]);
const stateAt = (pos) => EditorState.create({ doc, selection: TextSelection.create(doc, pos), plugins: [veneerPlugin()] });
const posIn = (text) => { let at = null; doc.descendants((n, pos) => { if (at == null && n.isTextblock && n.textContent === text) at = pos + 1; }); return at; };

describe('candidates', () => {
  it('offers this block, the section by name and by place, the kind everywhere, and the document', () => {
    const c = candidates(doc, posIn('Second inside'));
    expect(c.block).toMatchObject({ type: 'paragraph', tag: 'p', id: null });
    expect(c.options.map((o) => o.key)).toEqual(['block', 'section:2:identity', 'section:2:role', 'section:1:identity', 'everywhere', 'document']);
    const byKey = Object.fromEntries(c.options.map((o) => [o.key, o]));
    expect(byKey.block.selector).toBe('#archive-s1-p2');
    expect(byKey.block.mint).toEqual({ pos: doc.resolve(posIn('Second inside')).before(3), id: 'archive-s1-p2' });
    expect(byKey['section:2:identity'].selector).toBe('#archive-s1 p');
    expect(byKey['section:2:role'].selector).toBe('#archive > section:nth-of-type(1) p');
    expect(byKey['section:1:identity']).toMatchObject({ selector: '#archive p', mint: null });
    expect(byKey.everywhere.selector).toBe('section > p');
    expect(byKey.document.selector).toBe('body');
  });
  it('uses the block\'s classes for the kind, and a named block needs no name', () => {
    const c = candidates(doc, posIn('First words of the chapter'));
    expect(c.options.find((o) => o.key === 'everywhere').selector).toBe('p.lead');
    const named = addTransaction(stateAt(posIn('First words of the chapter')), c.options[0], { color: '#ff0000' });
    const c2 = candidates(named.doc, posIn('First words of the chapter'));
    expect(c2.block.id).toBe('archive-p1');
    expect(c2.options[0].mint).toBeNull();
  });
  it('slugs a block with no named ancestor, and avoids a taken name', () => {
    const $p = doc.resolve(posIn('A chapter nobody named'));
    expect(mintId($p, 2, idsOf(doc))).toBe('a-chapter-nobody-named');
    expect(mintId($p, 2, new Set(['a-chapter-nobody-named']))).toBe('a-chapter-nobody-named-2');
  });
  it('answers null outside a textblock', () => {
    expect(candidates(doc, 0)).toBeNull();
  });
});

describe('transactions', () => {
  it('adds a rule naming the block in the same transaction, in the history-sized unit of one', () => {
    const state = stateAt(posIn('Second inside'));
    const option = candidates(doc, posIn('Second inside')).options[0];
    const tr = addTransaction(state, option, { 'font-size': '14pt' }, 'measure');
    expect(tr.steps.map((s) => s.constructor.name)).toEqual(['AttrStep', 'DocAttrStep']);
    const next = state.apply(tr);
    expect(listOf(next.doc)).toEqual([{ id: 'a1', selector: '#measure', binding: 'identity', extent: 'block', declarations: { 'font-size': '14pt' } }]);
    expect(veneerKey.getState(next)).toEqual(listOf(next.doc));
    expect(next.doc.nodeAt(option.mint.pos).attrs.id).toBe('measure');
  });
  it('merges a second add on the same selector, rewrites, removes a declaration and then the rule', () => {
    let state = stateAt(posIn('Second inside'));
    const option = candidates(doc, posIn('Second inside')).options[0];
    state = state.apply(addTransaction(state, option, { 'font-size': '14pt' }));
    const again = candidates(state.doc, posIn('Second inside')).options[0];
    state = state.apply(addTransaction(state, again, { color: '#ff0000' }));
    expect(listOf(state.doc)).toHaveLength(1);
    expect(listOf(state.doc)[0].declarations).toEqual({ 'font-size': '14pt', color: '#ff0000' });
    state = state.apply(rewriteTransaction(state, 'a1', { color: '#0000ff' }));
    expect(listOf(state.doc)[0].declarations).toEqual({ color: '#0000ff' });
    state = state.apply(removeDeclarationTransaction(state, 'a1', 'color'));
    expect(listOf(state.doc)).toEqual([]);
    expect(state.doc.attrs.veneer).toBeNull();
    expect(() => removeTransaction(state, 'a1')).not.toThrow();
  });
  it('refuses a taken name, a bad name, and a rule with no declaration', () => {
    const state = stateAt(posIn('Second inside'));
    const option = candidates(doc, posIn('Second inside')).options[0];
    expect(() => addTransaction(state, option, { color: '#ff0000' }, 'archive')).toThrow(/already taken/);
    expect(() => addTransaction(state, option, { color: '#ff0000' }, '1st')).toThrow(/not a name/);
    expect(() => addTransaction(state, option, {})).toThrow(/needs a declaration/);
  });
});

describe('the gate and the sheet', () => {
  it('admits what a property\'s kind admits and nothing else', () => {
    expect(declarationOf('font-size', ' 14pt ')).toBe('14pt');
    expect(declarationOf('line-height', '1.4')).toBe('1.4');
    expect(() => declarationOf('font-size', '14')).toThrow(/needs a unit/);
    expect(() => declarationOf('font-size', '-1pt')).toThrow(/negative/);
    expect(declarationOf('color', '#FF0000')).toBe('#ff0000');
    expect(() => declarationOf('color', 'red')).toThrow(/#rrggbb/);
    expect(() => declarationOf('text-align', 'left')).toThrow(/one of/);
    expect(declarationOf('font-family', 'Source Serif 4', ['Source Serif 4'])).toBe('"Source Serif 4"');
    expect(() => declarationOf('font-family', 'Comic', ['Source Serif 4'])).toThrow(/not a face/);
    expect(() => declarationOf('color', '#ff0000 !important')).toThrow(/important/);
  });
  it('writes each rule in its extent\'s sublayer, the sublayers stated first', () => {
    const text = sheetText([
      { id: 'a1', selector: '#measure', extent: 'block', declarations: { 'font-size': '14pt', color: '#ff0000' } },
      { id: 'a2', selector: 'section > p', extent: 'everywhere', declarations: { hyphens: 'auto' } }
    ]);
    expect(text.split('\n')).toEqual([
      '@layer veneer.document, veneer.kind, veneer.section, veneer.block;',
      '@layer veneer.block { #measure { font-size: 14pt; color: #ff0000; } }',
      '@layer veneer.kind { section > p { hyphens: auto; } }'
    ]);
    expect(sheetText([])).toBe('');
  });
});

describe('the paste strip', () => {
  it('takes every id off a slice, at any depth', () => {
    const slice = new Slice(doc.content, 0, 0);
    const stripped = stripIds(slice);
    const ids = [];
    stripped.content.descendants((n) => { if (n.attrs.id) ids.push(n.attrs.id); });
    expect(ids).toEqual([]);
    expect(stripped.content.textBetween(0, stripped.content.size, ' ')).toBe(doc.textBetween(0, doc.content.size, ' '));
  });
});

describe('the capabilities', () => {
  it('declare three argument verbs whose commands run the transactions and refuse through the gate', () => {
    const caps = veneerCapabilities();
    expect(caps.map((c) => c.id)).toEqual(['veneer:add', 'veneer:rewrite', 'veneer:remove']);
    const state = stateAt(posIn('Second inside'));
    let applied = null;
    const add = caps[0].command({ key: 'block', declarations: { 'font-size': '14pt' } });
    expect(add(state)).toBe(true);
    expect(add(state, (tr) => { applied = state.apply(tr); })).toBe(true);
    expect(listOf(applied.doc)[0].selector).toBe('#archive-s1-p2');
    expect(caps[0].command({ key: 'nowhere', declarations: {} })(state)).toBe(false);
    expect(() => caps[0].command({ key: 'block', declarations: { color: 'red' } })(state, () => {})).toThrow(/#rrggbb/);
    expect(veneerTypes.declarations.check({ color: '#ff0000' })).toBe(true);
    expect(veneerTypes.declarations.check({ color: 1 })).toBe(false);
  });
});
