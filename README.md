# prosemirror-veneer

A user's **style exceptions** over a ProseMirror document, as **rules in a sheet of their own** — never as presentation on a node. The stored document takes identity (`id`) and nothing else for them; each choice is a selector that follows the document's structure and a declaration. The veneer is the thin layer over the author's style: it dresses what the theme drew, in a cascade layer after the theme's, and comes off without a trace.

Extracted on 2026-10-20 from the amendments rounds of the BelType studio experiment, where it was built and proved (`notes/amendments-plan.md`, `notes/amendments-synthesis.md`, `notes/amendments-results.md`, `notes/layers-results.md` there). What is here is the ProseMirror half; the host keeps the sheet on its page, its paged engine's runs, its print and its pane.

## The model

The veneer rides in the state as the doc's `veneer` attribute, a JSON string: a list of `{ id, selector, binding: 'identity' | 'role', extent, declarations }`. A change is ONE `DocAttrStep` (with, when a node had to be named first, one `AttrStep` setting its `id` before it), so it is in the history, crosses a collab protocol like any step, and sits outside the body. `veneerPlugin()` keeps the parsed list as its state; `listOf(doc)` reads it.

```js
import { veneerPlugin, candidates, addTransaction, listOf } from 'prosemirror-veneer'

const { block, options } = candidates(state.doc, state.selection.from)
// options: this block (#id, minted when it has none); blocks of this kind in each sectioning ancestor,
// by name (#anchor p) and by place (#named > section:nth-of-type(2) p); the kind everywhere; the document
state.apply(addTransaction(state, options[0], { 'font-size': '14pt' }))
```

**Extents and selectors.** From the caret's block: *this block* (`#id`), *blocks of this kind in this section* for each sectioning ancestor (by name `#anchor p`, every block of the kind under it; by place, anchored to the nearest named ancestor, only below the top level, so a selector never counts the root's children — a top-level block a paged engine divides is one original and a fragment per page), *blocks like this everywhere* (the block's classes, or its parent's kind over its own), *the whole document* (`body`). One rule per selector: an add whose selector a rule already has merges into it.

**Names.** A node with no `id` is named when a rule needs it: the nearest named ancestor's id and the path down (`archive-s2-p3`: the archive's second subsection's third paragraph), or a slug of its first words; a taken name gets `-2`. A pasted copy is a new individual: `stripIds(slice)` takes every id off a slice, so a twin of a name is never dressed by its rule.

**The schema's conventions** are a parameter, with defaults for a document of sections, headings and paragraphs: which node types section it, the letter each type gives a minted name, the plural a kind is called by, and the element a node is drawn as (`conventionsOf({ tagOf, sectioning, letters, plurals })`).

## The properties and the gate

`PROPERTIES` are the seventeen a rule may set, in the three groups the paragraph-style dialogs of InDesign and Word have taught (Type, Paragraph, Page), each with the kind of value its control writes. `declarationOf(property, value, families)` is the gate: a length with a unit, a colour as `#rrggbb`, a keyword of the property's, a family the document declares; `!important` is refused (a rule never insists). `contract(rule)` is what a rule keeps with a paged engine: no `:has()`, no paged-media form a rewriter would have to rewrite.

## The sheet

`sheetText(list)` is the rules as CSS: the author's sheets are in a cascade layer the host names (`author`), the veneer in `veneer` after it, so a rule outranks the theme whatever the theme's specificity; inside, each extent is a sublayer, the wider first (`veneer.document`, `veneer.kind`, `veneer.section`, `veneer.block`). `layersStatement()` is the line a page carries at the top of its head. The sheet itself — a constructed `CSSStyleSheet`, adopted, replaced by `replaceSync` — is the host's.

## The verbs

Plain data in [prosemirror-verbs](../prosemirror-verbs)' entry shape, nothing imported: `veneerCapabilities({ conventions, families })` declares `veneer:add { key, declarations, name? }`, `veneer:rewrite { id, declarations }` and `veneer:remove { id, property? }`; `veneerTypes` is the `declarations` argument type for the host's vocabulary; `veneerTaste` what this package would call them.

```js
const register = compose([...others, fromCommands(veneerCapabilities({ families }))], { types: veneerTypes })
const taste = applyTaste(register, [veneerTaste, hostTaste])
```

## Status

Proved in its host (73 checks of real clicks and keys, two mutants) before the extraction; here, unit tests over the pure parts (`npm test`). Not on npm: it installs from GitHub (`github:egildo/prosemirror-veneer#<commit>`).
