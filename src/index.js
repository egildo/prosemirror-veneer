// prosemirror-veneer: a user's style exceptions over a ProseMirror document, as rules in a sheet of their own.
export { PROPERTIES, UNITS, declarationOf, gate } from './properties.js';
export { AUTHOR_LAYER, VENEER_LAYER, layersStatement, LAYERS_STATEMENT, sheetText, contract } from './sheet.js';
export { veneerKey, veneerPlugin, listOf, CONVENTIONS, conventionsOf, defaultTagOf, idSel, idsOf, mintId, validId, candidates, addTransaction, rewriteTransaction, removeDeclarationTransaction, removeTransaction, stripIds } from './model.js';
export { veneerCapabilities, veneerTypes, veneerTaste } from './verbs.js';
