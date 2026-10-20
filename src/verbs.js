// The verbs, as plain data: capabilities in prosemirror-verbs' entry shape (a command, or a factory of one for an argument verb), a type for the declarations argument, and the taste a host seats or ignores. Nothing here is imported from prosemirror-verbs or verbr: a plugin declares by exporting plain objects.
import { gate } from './properties.js';
import { candidates, addTransaction, rewriteTransaction, removeDeclarationTransaction, removeTransaction, CONVENTIONS } from './model.js';

/** The argument type for a bag of declarations, for a host's vocabulary (`compose([...], { types: veneerTypes })`): an object of property to value, every value a string. */
export const veneerTypes = {
  declarations: {
    check: (v) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'string'),
    schema: { type: 'object', additionalProperties: { type: 'string' } }
  }
};

/**
 * The capabilities.
 *
 * - `veneer:add` `{ key, declarations, name? }`: the option `key` of the caret's candidates gets a rule with these declarations (merging into the rule that has its selector); `name` replaces a proposed id.
 * - `veneer:rewrite` `{ id, declarations }`: the rule's declarations replaced; none left removes it.
 * - `veneer:remove` `{ id, property? }`: the rule, or one of its declarations.
 *
 * Each takes its declarations through the gate (`declarationOf`), so a refusal is a RangeError at the run, in words.
 *
 * @param {{ conventions?: Partial<import('./model.js').Conventions>, families?: () => string[] | null }} [options] - the schema's conventions, and the face families the document declares (for `font-family`; any name when absent)
 */
export const veneerCapabilities = ({ conventions = CONVENTIONS, families = () => null } = {}) => [
  {
    id: 'veneer:add', label: 'Add a rule', section: 'veneer',
    args: [{ name: 'key', type: 'string', required: true }, { name: 'declarations', type: 'declarations', required: true }, { name: 'name', type: 'string' }],
    command: ({ key, declarations, name }) => (state, dispatch) => {
      const option = candidates(state.doc, state.selection.from, conventions)?.options.find((o) => o.key === key);
      if (!option) return false;
      if (!dispatch) return true;
      if (!Object.keys(declarations).length) throw new RangeError('veneer: nothing was changed, so there is nothing to add');
      dispatch(addTransaction(state, option, gate(declarations, families()), name?.trim() || null));
      return true;
    }
  },
  {
    id: 'veneer:rewrite', label: 'Rewrite a rule', section: 'veneer',
    args: [{ name: 'id', type: 'string', required: true }, { name: 'declarations', type: 'declarations', required: true }],
    command: ({ id, declarations }) => (state, dispatch) => {
      if (!dispatch) return true;
      dispatch(rewriteTransaction(state, id, gate(declarations, families())));
      return true;
    }
  },
  {
    id: 'veneer:remove', label: 'Remove a rule', section: 'veneer',
    args: [{ name: 'id', type: 'string', required: true }, { name: 'property', type: 'string' }],
    command: ({ id, property }) => (state, dispatch) => {
      if (!dispatch) return true;
      dispatch(property ? removeDeclarationTransaction(state, id, property) : removeTransaction(state, id));
      return true;
    }
  }
];

/** What this package would call its verbs: a taste document a host seats or ignores. */
export const veneerTaste = {
  name: 'veneer',
  verbs: { 'veneer:add': { keywords: ['style', 'rule', 'amend'] }, 'veneer:rewrite': { keywords: ['style', 'rule', 'edit'] }, 'veneer:remove': { keywords: ['style', 'rule', 'delete'] } },
  sections: [{ id: 'veneer', label: 'Veneer' }]
};
