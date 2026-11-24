// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// LAYER: FLOW-DSL SPEC INTERPRETER — builds a flow from a declarative FlowSpec (JSON) by calling the SAME
// node factories, component builders and FlowBuilder that hand-written authoring scripts use. //
// WHY: the per-flow authoring script was pure data (nodes + "this exit goes to that node"). Declaring that data
// as a FlowSpec means (1) no model-generated TypeScript is executed, (2) one authoring interface shared by the
// Kiro plugin and the standalone Strands agent, and (3) the WHOLE flow set is visible before build, so the
// cross-flow checks in flowset-checks.ts can enforce design-contract rules deterministically.
//
// A FlowSpec is NOT flow JSON. It is the authoring INPUT (`<flowId>.flowspec.json`); the emitted
// `<flowId>.flow.json` is still DSL OUTPUT. All structural guarantees (exit order, choice binding, unwired-exit
// check, continuation edges, slot attachment, canvas layout) come from the factories exactly as before.
// Format reference: FLOWSPEC.md.

import { flow, type FlowDoc } from './builder';
import {
  startNode, basicNode, define, userChoice, generativeJourney, dataRequest, redirect, split,
  generativeText, knowledgeBaseNode, escalate, terminateNode,
  setContext, clearContext, clearSlot, increment, decrement,
  type GenerativeModelType, type GenerativeJourneyTool, type SplitBranch,
} from './nodes';
import {
  type Operand, type Condition, type StateModification, type NodeResult, type ConditionOperator,
  ctxRef, localRef, slotRef, fieldRef, variableRef, systemRef, constant,
  slotExistsNamed, slotNotExistsNamed, variableExistsCondition, variableEqCondition,
} from './core';
import {
  buildAuthVerify, buildEscalation, buildWelcomeRouter, buildCallback, buildFaqLookup,
  type AuthVerifyParams, type EscalationParams, type WelcomeRouterParams, type CallbackParams, type FaqLookupParams,
} from './components';

// ── Spec types ──────────────────────────────────────────────────────────────────────────────────────────────

/** A value reference: "ctx:name" | "local:name" | "slot:name" | "field:dataRequest.field" |
 *  "var:dataRequest.field" | "sys:name" | "const:literal" (string). To set a NUMBER/BOOLEAN var from a literal,
 *  use the typed form { set, value: 0 | true } (emits a real number/boolean constant; a string constant into a
 *  number/boolean var is what ACXD rejects). A "define" local also works. */
export type SpecRef = string;

export type SpecMod =
  | { set: string; from: SpecRef }            // setContext(name, ref)
  | { set: string; value: number | boolean }  // setContext(name, typed constant) — number/boolean vars
  | { clear: string }                         // clearContext
  | { clearSlot: string }
  | { increment: string }
  | { decrement: string };

/** A split branch condition. Exactly one form per branch. */
export type SpecCondition =
  | { ctx: string; op?: ConditionOperator; value?: string | number }   // context var compare (exists/not_exists need no value)
  | { var: string; op?: ConditionOperator; value?: string }            // data-request output compare (e.g. "dr.field")
  | { slot: string; op: 'exists' | 'not_exists' };

export type SpecNode =
  | { id: string; type: 'start'; next: string }
  | { id: string; type: 'basic'; name?: string; messages?: string[]; set?: SpecMod[]; tags?: string[]; next: string | 'terminate' }
  | { id: string; type: 'define'; name?: string; local: string; value: string | number | boolean; next: string }
  | { id: string; type: 'user_choice'; name?: string; slot: string; slotType: string; values?: string[];
      elicit: string; examples?: string[]; sensitive?: boolean; exits: Record<string, string> }
  | { id: string; type: 'generative_journey'; name?: string; prompt: string;
      exits?: Array<{ name: string; prompt: string }>; dataCapture?: Array<{ slot: string; required?: boolean }>;
      tools?: Array<{ kb: string; prompt: string } | { dataRequest: string; prompt: string }>;
      model?: GenerativeModelType; maxTokens?: number; maxSteps?: number; temperature?: number;
      tags?: string[]; routes: Record<string, string> }
  | { id: string; type: 'data_request'; name?: string; dataRequest: string; params?: Record<string, string>;
      body?: Record<string, unknown>;   // JSON request body (nested objects allowed); see FLOWSPEC.md
      set?: SpecMod[]; alwaysRetrigger?: boolean;
      // in_progress is intentionally NOT listed: it must be left disconnected (builder auto-terminates it).
      exits: Record<'success' | 'timeout' | 'failure', string> }
  | { id: string; type: 'split'; name?: string; branches: Array<{ name: string; when: SpecCondition | SpecCondition[] }>;
      exits: Record<string, string> }  // exits keyed by branch name, plus "default"
  | { id: string; type: 'generative_text'; name: string; local?: string; prompt: string; model: GenerativeModelType;
      temperature?: number; maxTokens?: number; exits: Record<'success' | 'timeout' | 'failure', string> }
  | { id: string; type: 'knowledge_base'; name?: string; kb: string; question?: string;
      exits: Record<'match' | 'no_match' | 'timeout' | 'failure', string> }
  | { id: string; type: 'redirect'; name?: string; to: string; set?: SpecMod[] }
  | { id: string; type: 'escalate'; name?: string }
  | { id: string; type: 'terminate'; name?: string };

export interface NodesFlowSpec {
  flowId: string;
  aiDescription: string;
  /** Slots used only by Generative Journey dataCapture (user_choice nodes attach their own). */
  slots?: Array<{ name: string; type: string; examples?: string[]; sensitive?: boolean; aiDescription?: string }>;
  nodes: SpecNode[];
  masterLanguageCode?: string;
  languageCodes?: string[];
}

export type ComponentFlowSpec =
  | { flowId: string; component: 'authVerify'; params: Omit<AuthVerifyParams, 'flowId'> }
  | { flowId: string; component: 'escalation'; params: Omit<EscalationParams, 'flowId'> }
  | { flowId: string; component: 'welcomeRouter'; params: Omit<WelcomeRouterParams, 'flowId'> }
  | { flowId: string; component: 'callback'; params: Omit<CallbackParams, 'flowId'> }
  | { flowId: string; component: 'faqLookup'; params: Omit<FaqLookupParams, 'flowId'> };

export type FlowSpec = NodesFlowSpec | ComponentFlowSpec;

/** Thrown with EVERY problem found in a spec (not just the first). */
export class FlowSpecError extends Error {
  constructor(readonly flowId: string, readonly problems: string[]) {
    super(`flowspec "${flowId}" has ${problems.length} problem(s):\n  • ${problems.join('\n  • ')}`);
    this.name = 'FlowSpecError';
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────────────────

export function parseRef(ref: SpecRef): Operand {
  const i = ref.indexOf(':');
  if (i <= 0) throw new Error(`reference "${ref}" needs a prefix: ctx: / local: / slot: / field: / var: / sys: / const:`);
  const kind = ref.slice(0, i), name = ref.slice(i + 1);
  switch (kind) {
    case 'ctx': return ctxRef(name);
    case 'local': return localRef(name);
    case 'slot': return slotRef(name);
    case 'field': return fieldRef(name);
    case 'var': return variableRef(name);
    case 'sys': return systemRef(name);
    case 'const': return constant(name);
    default: throw new Error(`reference "${ref}": unknown prefix "${kind}:"`);
  }
}

/** Convert spec mods → state modifications. */
function toMods(mods: SpecMod[] | undefined): StateModification[] {
  const stateMods: StateModification[] = [];
  for (const m of mods ?? []) {
    if ('value' in m) {
      if (typeof m.value !== 'number' && typeof m.value !== 'boolean') {
        throw new Error(`set "${m.set}": "value" must be a number or boolean (use "from": "const:..." for a string)`);
      }
      stateMods.push(setContext(m.set, constant(m.value)));
    } else if ('set' in m) stateMods.push(setContext(m.set, parseRef(m.from)));
    else if ('clear' in m) stateMods.push(clearContext(m.clear));
    else if ('clearSlot' in m) stateMods.push(clearSlot(m.clearSlot));
    else if ('increment' in m) stateMods.push(increment(m.increment));
    else if ('decrement' in m) stateMods.push(decrement(m.decrement));
    else throw new Error(`unknown state modification ${JSON.stringify(m)} — valid: set/from, clear, clearSlot, increment, decrement`);
  }
  return stateMods;
}

function toCondition(c: SpecCondition): Condition {
  if ('slot' in c) return c.op === 'exists' ? slotExistsNamed(c.slot) : slotNotExistsNamed(c.slot);
  if ('ctx' in c) {
    const op = c.op ?? 'eq';
    if (op === 'exists' || op === 'not_exists') return { left: { type: 'context', name: c.ctx }, operator: op };
    if (c.value === undefined) throw new Error(`condition on ctx "${c.ctx}" with op "${op}" needs a value`);
    return { left: { type: 'context', name: c.ctx }, operator: op, right: { type: 'constant', value: c.value } };
  }
  const op = c.op ?? 'eq';
  if (op === 'exists') return variableExistsCondition(c.var);
  if (op === 'not_exists') return { left: { type: 'variable', name: c.var }, operator: 'not_exists' };
  if (c.value === undefined) throw new Error(`condition on var "${c.var}" with op "${op}" needs a value`);
  return variableEqCondition(c.var, c.value, op);
}

// ── interpreter ─────────────────────────────────────────────────────────────────────────────────────────────

/** Build one flow from its FlowSpec. Component specs call the component builder; node specs call the factories
 *  and FlowBuilder. Throws FlowSpecError listing every problem; emit() still enforces edge-completeness. */
export function buildFromSpec(spec: FlowSpec): FlowDoc {
  if (!spec || typeof spec !== 'object' || !spec.flowId) throw new FlowSpecError('(unknown)', ['spec has no flowId']);
  if ('component' in spec) return buildComponent(spec);
  return buildNodes(spec);
}

function buildComponent(spec: ComponentFlowSpec): FlowDoc {
  const p = { ...(spec.params as object), flowId: spec.flowId } as never;
  switch (spec.component) {
    case 'authVerify': return buildAuthVerify(p);
    case 'escalation': return buildEscalation(p);
    case 'welcomeRouter': return buildWelcomeRouter(p);
    case 'callback': return buildCallback(p);
    case 'faqLookup': return buildFaqLookup(p);
    default: {
      const s = spec as unknown as { flowId: string; component: string };
      throw new FlowSpecError(s.flowId, [
        `unknown component "${s.component}" — valid: authVerify, escalation, welcomeRouter, callback, faqLookup`,
      ]);
    }
  }
}

function buildNodes(spec: NodesFlowSpec): FlowDoc {
  const problems: string[] = [];
  if (!spec.aiDescription || !spec.aiDescription.trim()) problems.push('aiDescription is empty (the flow would be unreachable)');
  if (!Array.isArray(spec.nodes) || spec.nodes.length === 0) problems.push('nodes[] is empty');
  if (problems.length) throw new FlowSpecError(spec.flowId, problems);

  const f = flow(spec.flowId, spec.aiDescription, { masterLanguageCode: spec.masterLanguageCode, languageCodes: spec.languageCodes });
  const SLOT_KEYS = new Set(['name', 'type', 'examples', 'sensitive', 'aiDescription']);
  for (const s of spec.slots ?? []) {
    // Every slot needs a name and a type; an unknown key (e.g. "slotType") is dropped silently by the builder and
    // the flow then fails at deploy with "slots[n].type is required", so reject it here.
    const extra = Object.keys(s ?? {}).filter((k) => !SLOT_KEYS.has(k));
    if (extra.length) {
      problems.push(`slot "${s?.name ?? '?'}" has unknown key(s) ${extra.map((k) => `"${k}"`).join(', ')} — slot keys are ` +
        'name, type, examples, sensitive, aiDescription (the slot type key is "type")');
      continue;
    }
    if (!s?.name || typeof s.type !== 'string' || !s.type.trim()) {
      problems.push(`slot "${s?.name ?? '?'}" needs a name and a "type" (a custom slot type from slot-types.json, or ` +
        '"NLX.AlphaNumeric")');
      continue;
    }
    // ACXD deploys only NLX.AlphaNumeric of the built-in slot types; other NLX.* types fail the console build.
    if (typeof s?.type === 'string' && s.type.startsWith('NLX.') && s.type !== 'NLX.AlphaNumeric') {
      problems.push(`slot "${s.name}" uses built-in type "${s.type}", which ACXD does not provide — use ` +
        '"NLX.AlphaNumeric" for free text, or a custom slot type from slot-types.json');
      continue;
    }
    f.attachSlot(s);
  }

  // Pass 1: create every node via its factory, keyed by spec id.
  const byId = new Map<string, NodeResult>();
  const ids = new Set<string>();
  const starts = spec.nodes.filter((n) => n.type === 'start');
  if (starts.length !== 1) problems.push(`exactly one start node is required (found ${starts.length})`);

  for (const n of spec.nodes) {
    if (!n.id) { problems.push(`a ${n.type} node has no id`); continue; }
    if (ids.has(n.id)) { problems.push(`duplicate node id "${n.id}"`); continue; }
    ids.add(n.id);
    try {
      const made = makeNode(n, f);
      byId.set(n.id, made);
    } catch (e) {
      problems.push(`node "${n.id}": ${(e as Error).message}`);
    }
  }

  // Pass 2: wire every exit by label to its target id.
  const wire = (from: string, label: string, target: string | undefined) => {
    const src = byId.get(from);
    if (!src) return;
    if (target === undefined || target === '') { problems.push(`node "${from}" exit "${label}" has no target`); return; }
    let h;
    try { h = src.exit(label); } catch (e) { problems.push(`node "${from}": ${(e as Error).message}`); return; }
    if (target === 'terminate') { h.terminate(); return; }
    const dst = byId.get(target);
    if (!dst) { problems.push(`node "${from}" exit "${label}" targets unknown node "${target}"`); return; }
    h.to(dst);
  };

  for (const n of spec.nodes) {
    const src = byId.get(n.id);
    if (!src) continue;
    const declared = exitMap(n);
    const available = src.exits.map((e) => e.label);
    for (const [label, target] of Object.entries(declared)) {
      if (!available.includes(label)) {
        problems.push(`node "${n.id}" (${n.type}) has no exit "${label}" — valid exits: ${available.join(', ') || '(none)'}`);
        continue;
      }
      wire(n.id, label, target);
    }
    for (const label of available) {
      // data_request `in_progress` is intentionally not declared in a spec — it is left disconnected and the
      // builder auto-terminates it. Every other exit must be declared.
      if (n.type === 'data_request' && label === 'in_progress') continue;
      if (!(label in declared)) problems.push(`node "${n.id}" (${n.type}) exit "${label}" is not wired — add it to the node's exits`);
    }
  }

  if (problems.length) throw new FlowSpecError(spec.flowId, problems);
  try {
    return f.emit();
  } catch (e) {
    throw new FlowSpecError(spec.flowId, [(e as Error).message]);
  }
}

/** The exits a spec node declares, normalised to { label: targetId }. */
function exitMap(n: SpecNode): Record<string, string> {
  switch (n.type) {
    case 'start': case 'define': return { next: n.next };
    case 'basic': return { next: n.next };
    case 'user_choice': case 'split': case 'generative_text': case 'knowledge_base':
      return { ...n.exits };
    case 'data_request':
      return { ...n.exits };   // success/timeout/failure only; in_progress is left disconnected
    case 'generative_journey': return { ...n.routes };
    case 'redirect': case 'escalate': case 'terminate': return {};
  }
}

function makeNode(n: SpecNode, f: ReturnType<typeof flow>): NodeResult {
  switch (n.type) {
    case 'start': return f.add(startNode());
    case 'basic':
      return f.add(basicNode({ name: n.name, messages: n.messages, stateMods: toMods(n.set), tags: n.tags }));
    case 'define': {
      const v: Operand = { type: 'constant', value: n.value };
      return f.add(define(n.local, v, { name: n.name }));
    }
    case 'user_choice':
      return f.add(userChoice({
        name: n.name, slotName: n.slot, slotType: n.slotType,
        values: n.values?.map((value) => ({ value })), elicit: n.elicit, examples: n.examples, sensitive: n.sensitive,
      }));
    case 'generative_journey': {
      const tools: GenerativeJourneyTool[] | undefined = n.tools;
      return f.add(generativeJourney({
        name: n.name, prompt: n.prompt, exits: n.exits,
        dataCapture: n.dataCapture?.map((d) => ({ slotName: d.slot, required: d.required })),
        tools, model: n.model, maxTokens: n.maxTokens, maxSteps: n.maxSteps, temperature: n.temperature, tags: n.tags,
      }));
    }
    case 'data_request':
      return f.add(dataRequest({ name: n.name, variableId: n.dataRequest, urlParams: n.params, body: n.body as never, stateMods: toMods(n.set), alwaysRetrigger: n.alwaysRetrigger }));
    case 'split': {
      const branches: SplitBranch[] = n.branches.map((b) => {
        const conds = Array.isArray(b.when) ? b.when : [b.when];
        if (conds.length !== 1) throw new Error(`split branch "${b.name}": exactly one condition per branch is supported`);
        return { name: b.name, condition: toCondition(conds[0]) };
      });
      return f.add(split({ name: n.name, branches }));
    }
    case 'generative_text':
      return f.add(generativeText({ name: n.name, producesLocal: n.local, prompt: n.prompt, model: n.model, temperature: n.temperature, maxTokens: n.maxTokens }));
    case 'knowledge_base':
      return f.add(knowledgeBaseNode({ name: n.name, kbName: n.kb, question: n.question }));
    case 'redirect':
      return f.add(redirect({ name: n.name, toFlowId: n.to, stateMods: toMods(n.set) }));
    case 'escalate': return f.add(escalate({ name: n.name }));
    case 'terminate': return f.add(terminateNode({ name: n.name }));
    default: throw new Error(`unknown node type "${(n as { type: string }).type}"`);
  }
}
