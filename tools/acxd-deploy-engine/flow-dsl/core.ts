// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// LAYER: FLOW-DSL CORE — the exit-handle model, typed refs, node-id/UUID helpers, and the shared node/edge
// primitives every factory builds on. Emits the CONSOLE IMPORT/EXPORT wire format (the shape a real ACXD
// console import accepts and export produces), verified against deployed flow exports. Authoring layer only:
// the DSL PRODUCES a FlowDoc; the engine's create-flows.ts consumes it unchanged.
//
// CORE IDEA — EXITS ARE DERIVED FROM CONFIG. A factory returns { node, exits }. `exits` is the set of typed
// exit handles the node's own config implies (status handles + per-named-exit handles). You wire a handle
// with .to(target) / .exitApplication() / .terminate(). You cannot invent an exit the node lacks, nor forget
// one it has — the handle set IS the config. This makes the Generative Journey named-exit desync and the disconnected-edge
// →Fallback classes unconstructible.

import { randomUUID } from 'node:crypto';

// ── SDK node-graph shapes (the console wire format; kept local so the DSL is self-contained) ───────────────
// A 'terminate' node (Exit Application) exists in the GA wire format (empty childNodes). [CONSOLE-VERIFIED]
// There is NO 'user_input' node in the verified console wire format — flows terminate via terminate/redirect/escalate
// and capture is a user_choice into a slot.

export type FlowNodeType =
  | 'start' | 'basic' | 'user_choice' | 'split' | 'redirect' | 'define' | 'loop'
  | 'data_request' | 'generative_text' | 'generative_journey' | 'knowledge_base' | 'escalate' | 'note'
  | 'terminate';

export type OperandType =
  | 'constant' | 'constant_id' | 'context' | 'local' | 'slot' | 'slot_value_id' | 'node_status'
  | 'system' | 'variable' | 'field' | 'recursive';

export type ConditionOperator =
  | 'exists' | 'not_exists' | 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte'
  | 'prefix' | 'suffix' | 'contains' | 'not_contains' | 'matches_regex' | 'similar';

export interface Operand { type: OperandType; name?: string; value?: unknown; }
export interface Condition { left: Operand; operator: ConditionOperator; right?: Operand; }
export interface ChildNode { nodeId?: string; name?: string; conditions: Condition[]; }
export interface FlowMessage {
  messageId: string;
  type: 'text' | 'ssml';
  body: string;
  skipTranslation: boolean;
  metadata: { alternatePhrasings: string[] };
}
export interface StateModification {
  type: 'context' | 'slot' | 'local' | 'variable' | 'system';
  name?: string;
  modification?: 'set' | 'clear' | 'increment' | 'decrement' | 'push' | 'pop';
  value?: Operand;
}
export interface NodeDataRequest {
  type: 'custom';
  variableId: string;
  name: string;                                       // MUST equal variableId (verified export)
  // JSON request BODY. `recursive` = an object whose members are operands; a member may itself be a nested
  // `recursive` object, so nested JSON bodies are expressible. Leaf operands are { type:'constant', value:
  // '<text or {ref:NLX.Kind} token>' } or a typed operand ({ type:'context'|'slot'|'local', name }).
  payload: { type: 'recursive'; value: Record<string, unknown> };
  urlParams?: Record<string, string>;
  headers?: Record<string, string>;
  alwaysRetrigger?: boolean;
}
export interface FlowNodeMetadata {
  name?: string;
  stateModifications?: StateModification[];
  [key: string]: unknown;                             // per-type config (choice/redirect/generativeJourney/…)
}
export interface FlowNode {
  nodeId: string;
  type: FlowNodeType;
  childNodes: ChildNode[];
  dataRequests?: NodeDataRequest[];
  messages?: FlowMessage[];
  modalities?: Record<string, unknown>;
  metadata: FlowNodeMetadata;
  canvasMetadata?: Record<string, unknown>;
}

// ── Typed refs — the ONLY way to reference a value. ────────────────────────────────────────────────────────
export const ctxRef = (name: string): Operand => ({ type: 'context', name });
export const localRef = (name: string): Operand => ({ type: 'local', name });
export const slotRef = (name: string): Operand => ({ type: 'slot', name });
export const fieldRef = (name: string): Operand => ({ type: 'field', name });   // "dataRequestVariableId.field"
// ^ WARNING [CONSOLE-VERIFIED]: do NOT use fieldRef to READ a data-request output into a context
// var or payload — type:'field' carries a redaction wrapper, so the value propagates as `<<<...||redact>>>`.
// Use variableRef (type:'variable') for reading a data-request output. fieldRef is retained only for the
// FlowSpec `field:` dispatch (spec.ts) and any case a type:'field' operand is specifically required.
export const variableRef = (name: string): Operand => ({ type: 'variable', name }); // "dataRequestVariableId.field" in split
export const systemRef = (name: string): Operand => ({ type: 'system', name });
// A string, or a real number/boolean for number/boolean context vars (console-verified: { type: 'constant', value: 0 }).
export const constant = (value: string | number | boolean): Operand => ({ type: 'constant', value });
export type ValueRef = Operand;

// ── Exit handles ───────────────────────────────────────────────────────────────────────────────────────────
// An unwired handle carries the condition(s) that select it; wiring sets its target. The FlowBuilder refuses
// to emit while any handle is unwired (unless explicitly terminal) — the compile-time completeness check.

export type ExitKind = 'status' | 'value' | 'named' | 'unconditional' | 'catch';

export class ExitHandle {
  readonly label: string;
  readonly kind: ExitKind;
  private readonly conditions: Condition[];
  // Some node types wire ONE logical exit as SEVERAL edges to the same target. Each entry here is an extra
  // condition-set that produces an additional edge to the same wired target. Empty (common) = a single edge.
  private readonly extraConditionSets: Condition[][];
  private target: { nodeId?: string; terminal?: boolean } | null = null;

  constructor(label: string, kind: ExitKind, conditions: Condition[], extraConditionSets: Condition[][] = []) {
    this.label = label;
    this.kind = kind;
    this.conditions = conditions;
    this.extraConditionSets = extraConditionSets;
  }
  /** wire this exit to a target node. */
  to(node: NodeResult | string): ExitHandle {
    this.target = { nodeId: typeof node === 'string' ? node : node.node.nodeId };
    return this;
  }
  /** explicitly terminal (Exit Application / end of conversation) — a dangling edge with no target node. */
  exitApplication(): ExitHandle { this.target = { terminal: true }; return this; }
  terminate(): ExitHandle { this.target = { terminal: true }; return this; }

  isWired(): boolean { return this.target !== null; }
  /** true when this exit was marked terminal (.terminate()/.exitApplication()) and not yet retargeted. */
  isTerminal(): boolean { return this.target !== null && this.target.terminal === true && !this.target.nodeId; }
  /** retarget a terminal exit onto a real terminate node's id (the console-verified Exit Application shape:
   *  a dedicated type:"terminate" node the edge points INTO, NOT a dangling no-nodeId edge). */
  retargetTerminal(nodeId: string): void { if (this.isTerminal()) this.target = { nodeId }; }
  /** render to the SDK ChildNode edge(s); throws if still unwired. Returns one edge per condition-set. */
  toChildNodes(): ChildNode[] {
    if (!this.target) throw new Error(`exit "${this.label}" is unwired — call .to(node), .exitApplication(), or .terminate()`);
    const sets = [this.conditions, ...this.extraConditionSets];
    return sets.map((conds) => {
      const edge: ChildNode = { name: this.edgeName(), conditions: conds };
      if (this.target!.nodeId) edge.nodeId = this.target!.nodeId;   // terminal → omit nodeId (dangling catch)
      return edge;
    });
  }
  // Edge `name` in the wire format: ALL edges emit name "" — including the slot-absent no-match edge.
  // [CONSOLE-VERIFIED] A no-match edge emitted with name "no-match" triggers the console
  // "resolved placeholder must be filled in" warning on the user_choice node; selecting the Option in the
  // console rewrites that edge name to "" and clears it. Diff of a warning-free export vs our emit showed
  // the edge `name` was the ONLY substantive delta (choice block was already identical). The 'no-match'
  // HANDLE LABEL is unchanged — authors still wire via .exit('no-match'); only the emitted wire name blanks.
  private edgeName(): string { return ''; }
}

/** Every factory returns this: the built node + its derived exit handles. */
export interface NodeResult {
  node: FlowNode;
  exits: ExitHandle[];
  /** convenience lookup by handle label (e.g. exit('success'), exit('tierSelected')). */
  exit(label: string): ExitHandle;
}

export function makeNodeResult(node: FlowNode, exits: ExitHandle[]): NodeResult {
  return {
    node,
    exits,
    exit(label: string): ExitHandle {
      const h = exits.find((e) => e.label === label);
      if (!h) {
        throw new Error(
          `node "${node.metadata?.name ?? node.nodeId}" has no exit "${label}" — available: ` +
          `${exits.map((e) => e.label).join(', ') || '(none)'}`,
        );
      }
      return h;
    },
  };
}

// ── Standard exit-edge condition builders (the VERIFIED patterns from the console exports) ──────────────────

export const uuid = (): string => randomUUID();

/** node-status edge: { node_status eq <status> }. */
export const statusCondition = (status: string): Condition => ({
  left: { type: 'node_status' }, operator: 'eq', right: { type: 'constant', value: status },
});
/** capture forward edge: { slot exists } with a BLANK slot name. VERIFIED: every working capture export uses
 *  { type:'slot', name:'' } on both edges — the slot is identified by the node's attachment (slots[]), NOT by
 *  naming it in the edge condition. A POPULATED name triggers ACXD's "resolved placeholder must be filled in"
 *  warning. The slotName param is accepted for call-site clarity but intentionally not emitted. */
export const slotExistsCondition = (_slotName: string): Condition => ({
  left: { type: 'slot', name: '' }, operator: 'exists',
});
/** capture retry edge: { slot not_exists } — the "no-match" edge. Blank slot name (same reason as above). */
export const slotMissingCondition = (_slotName: string): Condition => ({
  left: { type: 'slot', name: '' }, operator: 'not_exists',
});

/** VERIFIED enumerated-slot capture: the per-VALUE branch on a bound user_choice node — one per slot value:
 *  { slot_value_id(<slotName>) eq constant_id(<valueId>) }. valueId = deriveValueId(slotTypeId, value). The
 *  slot name here is the REAL slot name (populated), matching the console-validated bound export. */
export const valueCondition = (slotName: string, valueId: string): Condition => ({
  left: { type: 'slot_value_id', name: slotName }, operator: 'eq', right: { type: 'constant_id', value: valueId },
});
/** the bound-node no-match fallback edge: { slot(<slotName>) not_exists } with the REAL slot name populated
 *  (the bound export uses the populated name here, unlike the unbound placeholder shape). */
export const slotNotExistsNamed = (slotName: string): Condition => ({
  left: { type: 'slot', name: slotName }, operator: 'not_exists',
});
/** free-text capture forward edge: { slot(<slotName>) exists } with the REAL slot name populated (VERIFIED
 *  from the NLX.AlphaNumeric console export — the captured edge mirrors the no-match edge's populated name). */
export const slotExistsNamed = (slotName: string): Condition => ({
  left: { type: 'slot', name: slotName }, operator: 'exists',
});
/** context-branch edge: { context(<ctx>) <op> <value> } (default op eq). */
export const ctxCondition = (ctxName: string, value: string, operator: ConditionOperator = 'eq'): Condition => ({
  left: { type: 'context', name: ctxName }, operator, right: { type: 'constant', value },
});
export const ctxContainsCondition = (ctxName: string, value: string): Condition =>
  ctxCondition(ctxName, value, 'contains');
/** variable-exists edge (data-request output): { variable(<dr.field>) exists }. */
export const variableExistsCondition = (variablePath: string): Condition => ({
  left: { type: 'variable', name: variablePath }, operator: 'exists',
});
/** variable-equality edge (data-request output): { variable(<dr.field>) <op> <constant> }.  *  Use to branch on a data-request field's VALUE inside the owning flow (e.g. a nonStandard flag).
 *  [CONSOLE-VERIFIED] ACXD compares a JSON boolean response field to a BOOLEAN constant
 *  correctly (verified/nonStandard): pass `true`/`false`, NOT the string 'true'. Comparing a boolean field to
 *  the STRING 'true' FAILS (never equal). So `value` accepts a
 *  boolean (or number) as well as a string; match the constant's type to the response field's type. */
export const variableEqCondition = (variablePath: string, value: string | number | boolean, operator: ConditionOperator = 'eq'): Condition => ({
  left: { type: 'variable', name: variablePath }, operator, right: { type: 'constant', value },
});
/** numeric gte edge on a context counter: { context(<ctx>) gte <n> }. */
export const ctxGteCondition = (ctxName: string, n: number): Condition => ({
  left: { type: 'context', name: ctxName }, operator: 'gte', right: { type: 'constant', value: n },
});
/** generative_journey named-exit edge: { System.gjConditionIndex eq <index> } (0-based, prompt order). */
export const gjIndexCondition = (index: number): Condition => ({
  left: { type: 'system', name: 'System.gjConditionIndex' }, operator: 'eq', right: { type: 'constant', value: index },
});

/** deterministic, workspace-stable valueId from a slotTypeId + value: xxYesNo + "yes" → xxYesNoYes. */
export function deriveValueId(slotTypeId: string, value: string): string {
  const pascal = value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  return `${slotTypeId}${pascal}`;
}

/** build a wire-format message with a generated messageId + envelope fields. */
export function makeMessage(body: string, kind: 'text' | 'ssml' = 'text'): FlowMessage {
  return { messageId: uuid(), type: kind, body, skipTranslation: false, metadata: { alternatePhrasings: [] } };
}
