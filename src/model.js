// The model: the veneer rides in the state as the doc's `veneer` attribute, a JSON string, a list of `{ id, selector, binding: 'identity' | 'role', extent, declarations }`. A change is ONE `DocAttrStep` (with, when a node had to be named first, one `AttrStep` setting its `id` before it), so it is in the history, crosses the collab protocol like any step, and sits outside the body: a saved document never holds presentation, only identity (`id`) where a rule needed a name.
import { Plugin, PluginKey } from 'prosemirror-state';
import { Fragment, Slice } from 'prosemirror-model';
import { contract } from './sheet.js';

/** The key of the veneer plugin. Its state is the list, READ from the doc's attribute (parsed once per text): the transaction that changes the attribute is what changes it. */
export const veneerKey = new PluginKey('veneer');

/** The list a doc carries (empty for a doc with no attribute). */
export const listOf = (doc) => (doc.attrs.veneer ? JSON.parse(doc.attrs.veneer) : []);

export const veneerPlugin = () => new Plugin({
  key: veneerKey,
  state: {
    init: (_config, state) => listOf(state.doc),
    apply: (tr, list, old, state) => (state.doc.attrs.veneer === old.doc.attrs.veneer ? list : listOf(state.doc))
  }
});

// ---------------------------------------------------------------- the schema's conventions
//
// What the selectors and the minted names read off the schema, as a host states it: which node types section the document, the letter each type gives a minted name, the word a kind is called in the plural, and the element a node is drawn as. The defaults are a document made of sections, headings, paragraphs and lists; a host with other nouns passes its own.

const escape = (s) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, (c) => `\\${c}`));

/** The element a node is drawn as, by default: a heading by its level, any other by its first parseDOM tag. */
export const defaultTagOf = (node) => {
  if (node.type.name === 'heading') return `h${node.attrs.level}`;
  const tag = node.type.spec.parseDOM?.[0]?.tag;
  return tag ? tag.replace(/[^a-z0-9].*$/i, '') : node.type.name;
};

/** @typedef {{ sectioning: string[], letters: Record<string, string>, plurals: Record<string, string>, tagOf: (node: import('prosemirror-model').Node) => string }} Conventions */
/** @type {Conventions} */
export const CONVENTIONS = {
  sectioning: ['section', 'article', 'nav'],
  letters: { section: 's', article: 's', nav: 'n', paragraph: 'p', heading: 'h', blockquote: 'q', bullet_list: 'l', ordered_list: 'l', list_item: 'i', footer: 'f', header: 'hd' },
  plurals: { paragraph: 'Paragraphs', heading: 'Headings', list_item: 'List items', footer: 'Footers' },
  tagOf: defaultTagOf
};
/** A host's conventions over the defaults. */
export const conventionsOf = (given = {}) => ({ ...CONVENTIONS, ...given, letters: { ...CONVENTIONS.letters, ...(given.letters ?? {}) }, plurals: { ...CONVENTIONS.plurals, ...(given.plurals ?? {}) } });

// ---------------------------------------------------------------- names and selectors

const classes = (node) => (node.attrs.class ?? '').split(/\s+/).filter(Boolean).map((c) => `.${escape(c)}`).join('');
/** The block's kind as a selector: its tag and its classes. */
const kindOf = (node, c) => c.tagOf(node) + classes(node);
export const idSel = (id) => `#${escape(id)}`;
/** The 1-based place of `parent`'s child at `index` among the children drawn with the same tag (what `:nth-of-type` counts). */
const nthOfType = (parent, index, c) => {
  const tag = c.tagOf(parent.child(index));
  let n = 1;
  for (let i = 0; i < index; i++) if (c.tagOf(parent.child(i)) === tag) n++;
  return n;
};
/** The 1-based place of `parent`'s child at `index` among the children of the same node type (the minted names count those). */
const nthOfNodeType = (parent, index) => {
  const type = parent.child(index).type;
  let n = 1;
  for (let i = 0; i < index; i++) if (parent.child(i).type === type) n++;
  return n;
};

/** Every id the document already uses: on nodes, on marks, and inside any node whose `html` attribute holds markup. */
export function idsOf(doc) {
  const ids = new Set();
  doc.descendants((node) => {
    if (node.attrs.id) ids.add(node.attrs.id);
    for (const m of node.marks) if (m.attrs.id) ids.add(m.attrs.id);
    if (typeof node.attrs.html === 'string') for (const [, id] of node.attrs.html.matchAll(/\sid="([^"]+)"/g)) ids.add(id);
  });
  return ids;
}

/**
 * A name for the node at depth `depth` of `$p`, from structure and content, unique in the doc: the nearest named ancestor's id followed by the path down to the node (`archive-s2` for the chapter's second subsection, `archive-s2-p3` for its third paragraph); with no named ancestor, a slug of the node's first words. A taken name gets `-2`, `-3`.
 *
 * @param {import('prosemirror-model').ResolvedPos} $p
 * @param {number} depth
 * @param {Set<string>} taken
 * @param {Conventions} [c]
 */
export function mintId($p, depth, taken, c = CONVENTIONS) {
  let named = depth - 1;
  while (named >= 1 && !$p.node(named).attrs.id) named--;
  let base;
  if (named >= 1) {
    const parts = [$p.node(named).attrs.id];
    for (let d = named + 1; d <= depth; d++) parts.push(`${c.letters[$p.node(d).type.name] ?? 'b'}${nthOfNodeType($p.node(d - 1), $p.index(d - 1))}`);
    base = parts.join('-');
  } else {
    const words = $p.node(depth).textContent.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9]+/g) ?? [];
    base = words.slice(0, 4).join('-') || $p.node(depth).type.name;
    if (!/^[a-z]/.test(base)) base = `${c.letters[$p.node(depth).type.name] ?? 'b'}-${base}`;
  }
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** A valid name for a node: a letter, then letters, digits, `-` and `_`. */
export const validId = (id) => /^[A-Za-z][\w-]*$/.test(id);

/**
 * What can be amended from the caret at `pos`: the block it is in and every extent with its candidate selector.
 *
 * @param {import('prosemirror-model').Node} doc
 * @param {number} pos
 * @param {Conventions} [c]
 * @returns {{ block: { pos: number, type: string, tag: string, id: string | null, text: string }, options: Option[] } | null} null outside a textblock
 * @typedef {{ key: string, extent: 'block' | 'section' | 'everywhere' | 'document', binding: 'identity' | 'role', label: string, selector: string, mint: { pos: number, id: string } | null }} Option
 */
export function candidates(doc, pos, c = CONVENTIONS) {
  const $p = doc.resolve(pos);
  let d = $p.depth;
  while (d > 0 && !$p.node(d).isTextblock) d--;
  if (d === 0) return null;
  const block = $p.node(d);
  const taken = idsOf(doc);
  const kind = kindOf(block, c);
  const plural = c.plurals[block.type.name] ?? 'Blocks';
  const options = [];
  // this block, by identity
  const bid = block.attrs.id ?? mintId($p, d, taken, c);
  options.push({ key: 'block', extent: 'block', binding: 'identity', label: 'This block', selector: idSel(bid), mint: block.attrs.id ? null : { pos: $p.before(d), id: bid } });
  // blocks of this kind in this section, one anchor per sectioning ancestor, nearest first: every block of the kind UNDER the anchor, not its own children only, so the last step, from the anchor to the kind, is a descendant combinator and the path down to the anchor keeps its child combinators
  for (let k = d - 1; k >= 1; k--) {
    const anchor = $p.node(k);
    if (!c.sectioning.includes(anchor.type.name)) continue;
    const word = anchor.type.name === 'article' ? 'chapter' : anchor.type.name === 'nav' ? 'navigation' : k > 1 ? 'subsection' : 'section';
    const aid = anchor.attrs.id ?? mintId($p, k, taken, c);
    options.push({ key: `section:${k}:identity`, extent: 'section', binding: 'identity', label: `${plural} in this ${word}, by name`, selector: `${idSel(aid)} ${kind}`, mint: anchor.attrs.id ? null : { pos: $p.before(k), id: aid } });
    // By place only below the top level, anchored to the nearest named ancestor: a selector that counts the root's children is never emitted (a top-level block a paged engine divides is one original and a fragment per page, all siblings of the root, so a count there dresses the first page only).
    let named = k - 1;
    while (named >= 1 && !$p.node(named).attrs.id) named--;
    if (k > 1 && named >= 1) {
      const path = [];
      for (let j = named + 1; j <= k; j++) path.push(`${c.tagOf($p.node(j))}:nth-of-type(${nthOfType($p.node(j - 1), $p.index(j - 1), c)})`);
      options.push({ key: `section:${k}:role`, extent: 'section', binding: 'role', label: `${plural} in this ${word}, by place`, selector: `${idSel($p.node(named).attrs.id)} > ${path.join(' > ')} ${kind}`, mint: null });
    }
  }
  // blocks of this kind everywhere, by role: the block's classes, or under its parent's when it has none
  const parent = $p.node(d - 1);
  const everywhere = classes(block) ? kind : `${classes(parent) || c.tagOf(parent)} > ${kind}`;
  options.push({ key: 'everywhere', extent: 'everywhere', binding: 'role', label: `${plural} like this, everywhere`, selector: everywhere, mint: null });
  options.push({ key: 'document', extent: 'document', binding: 'role', label: 'The whole document', selector: 'body', mint: null });
  return { block: { pos: $p.before(d), type: block.type.name, tag: c.tagOf(block), id: block.attrs.id, text: block.textContent.slice(0, 60) }, options };
}

// ---------------------------------------------------------------- transactions

const nextRuleId = (list) => `a${list.reduce((n, r) => Math.max(n, Number(r.id.slice(1)) || 0), 0) + 1}`;

/**
 * A rule added as one transaction: the node the option names gets its `id` first when it has none (`name` replaces the proposed one), then the doc's attribute takes the list with the new rule at its end. One rule per selector: an add whose selector a rule already has merges into it, a touched property replacing its declaration, and the rule keeps its id and its place in the sheet.
 *
 * @param {import('prosemirror-state').EditorState} state
 * @param {Option} option - one of `candidates(...).options`
 * @param {Record<string, string>} declarations - `{ property: value }`, already through the gate
 * @param {string | null} [name] - the id to give, when the option mints one (the proposal when absent)
 * @throws {RangeError} when the name is not valid or already taken, or the rule breaks the `contract`
 */
export function addTransaction(state, option, declarations, name = null) {
  const tr = state.tr;
  let selector = option.selector;
  if (option.mint) {
    const id = name || option.mint.id;
    if (!validId(id)) throw new RangeError(`veneer: "${id}" is not a name (a letter, then letters, digits, - and _)`);
    if (id !== option.mint.id && idsOf(state.doc).has(id)) throw new RangeError(`veneer: the name "${id}" is already taken`);
    selector = idSel(id) + option.selector.slice(idSel(option.mint.id).length);
    tr.setNodeAttribute(option.mint.pos, 'id', id);
  }
  const list = listOf(state.doc);
  const same = list.find((r) => r.selector === selector);
  const rule = same ? { ...same, declarations: { ...same.declarations, ...declarations } } : { id: nextRuleId(list), selector, binding: option.binding, extent: option.extent, declarations };
  contract(rule);
  return tr.setDocAttribute('veneer', JSON.stringify(same ? list.map((r) => (r === same ? rule : r)) : [...list, rule]));
}

/** A rule's declarations replaced by `declarations` (an edit): the rule keeps its id, its selector and its place; with no declaration left it is removed. */
export function rewriteTransaction(state, id, declarations) {
  const list = listOf(state.doc);
  const old = list.find((r) => r.id === id);
  if (!old) throw new RangeError(`veneer: no rule ${id}`);
  if (!Object.keys(declarations).length) return removeTransaction(state, id);
  const rule = { ...old, declarations };
  contract(rule);
  return state.tr.setDocAttribute('veneer', JSON.stringify(list.map((r) => (r === old ? rule : r))));
}

/** One declaration of a rule removed; the last one removes the rule. */
export function removeDeclarationTransaction(state, id, property) {
  const old = listOf(state.doc).find((r) => r.id === id);
  if (!old) throw new RangeError(`veneer: no rule ${id}`);
  const { [property]: _gone, ...rest } = old.declarations;
  return rewriteTransaction(state, id, rest);
}

/** The rule `id` deleted, as one transaction (the node keeps its name: a name is not taken back). */
export function removeTransaction(state, id) {
  const list = listOf(state.doc).filter((r) => r.id !== id);
  return state.tr.setDocAttribute('veneer', list.length ? JSON.stringify(list) : null);
}

/** A pasted slice with no node carrying an `id`: a copy is a new individual, and a twin of a name would be dressed by its rule too. */
export function stripIds(slice) {
  const strip = (fragment) => {
    const nodes = [];
    fragment.forEach((node) => {
      const content = node.isLeaf ? node.content : strip(node.content);
      nodes.push(node.attrs.id ? node.type.create({ ...node.attrs, id: null }, content, node.marks) : node.isLeaf ? node : node.copy(content));
    });
    return Fragment.from(nodes);
  };
  return new Slice(strip(slice.content), slice.openStart, slice.openEnd);
}
