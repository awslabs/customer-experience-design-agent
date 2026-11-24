// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// LAYER: SUPPORT — deterministic path tracer over emitted flow docs (console shape).
//
// Given a SCENARIO (entry flow, starting context, the outcome of each data request, each user choice and each
// Generative Journey exit), walk the flows node by node exactly as the routing rules dictate, and return the
// path, every Redirect with the context carried across it, and the end state. No LLM, no AWS.
//
// It does NOT simulate conversation. A Generative Journey step reports what INFORMATION the node has (its
// {x:NLX.Context} tokens with their values at that moment, and its attached tools) so a reviewer can judge
// whether the node can satisfy an acceptance criterion: a yes/no question, not a dialogue.
//
// Emulation rules (verified behaviour):
//   - Redirect is one-way and carries ONLY context vars. Slots and data-request output are flow-local.
//   - data_request exits: success | timeout | failure (in_progress is never taken). On success the scenario's
//     response fields are readable as `<dataRequestId>.<field>` in that flow only.
//   - A child with no conditions is unconditional (basic/start/define, and a split's else branch).
//   - escalate and terminate end the trace.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

type Json = Record<string, unknown>;
export type FlowDocs = Record<string, Json>;

export interface Scenario {
  name?: string;
  entry: string;
  context?: Record<string, unknown>;
  /** dataRequestId -> outcome. Default: { status: 'success', response: {} }. */
  dataRequests?: Record<string, { status?: 'success' | 'timeout' | 'failure'; response?: Record<string, unknown> }>;
  /** slot name -> value id (user_choice) or captured value (Generative Journey dataCapture). */
  slots?: Record<string, unknown>;
  /** Generative Journey / knowledge_base node name (or "<flowId>/<node name>") -> exit taken: an exit name,
   *  'data_captured', 'timeout' or 'failure'. A LIST gives one exit per visit, in order, and the last one repeats
   *  (e.g. ["needsIntent", "data_captured"]: first visit routes back, later visits proceed).
   *  Default: 'data_captured' when the node captures data, else its first exit. */
  journeys?: Record<string, string | string[]>;
  maxSteps?: number;
}

export interface TraceStep { flow: string; node: string; type: string; outcome?: string }
export interface JourneyInfo {
  flow: string; node: string;
  contextTokens: Array<{ name: string; value: unknown }>;
  tools: string[];
  prompt: string;
}
export interface TraceResult {
  scenario: string;
  steps: TraceStep[];
  redirects: Array<{ from: string; to: string; context: Record<string, unknown> }>;
  journeys: JourneyInfo[];
  end: 'terminate' | 'escalate' | 'stuck' | 'max-steps';
  endDetail: string;
  context: Record<string, unknown>;
}

const CTX_TOKEN = /\{([A-Za-z0-9_]+):NLX\.Context\}/g;

export function loadFlowDocs(dir: string): FlowDocs {
  const docs: FlowDocs = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.flow.json'))) {
    const d = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Json;
    docs[String(d.flowId ?? f.replace(/\.flow\.json$/, ''))] = d;
  }
  return docs;
}

function meta(n: Json): Json { return (n.metadata ?? {}) as Json; }
function nameOf(n: Json): string { return String(meta(n).name || n.type || n.nodeId); }

/** Unknown keys in a scenario are silently ignored by the walk, which turns a typo into a false PASS. Reject them. */
export function checkScenario(sc: Scenario): string[] {
  const problems: string[] = [];
  const top = ['name', 'entry', 'context', 'dataRequests', 'slots', 'journeys', 'maxSteps'];
  for (const k of Object.keys(sc ?? {})) if (!top.includes(k)) problems.push(`unknown scenario key "${k}" (valid: ${top.join(', ')})`);
  for (const [id, o] of Object.entries(sc?.dataRequests ?? {})) {
    for (const k of Object.keys(o ?? {})) {
      if (k !== 'status' && k !== 'response') problems.push(`dataRequests.${id}: unknown key "${k}" (valid: status, response)`);
    }
    const st = (o as { status?: unknown })?.status;
    if (st !== undefined && !['success', 'timeout', 'failure'].includes(String(st))) {
      problems.push(`dataRequests.${id}.status "${String(st)}" is not success, timeout or failure`);
    }
  }
  return problems;
}

export function traceScenario(docs: FlowDocs, sc: Scenario): TraceResult {
  const bad = checkScenario(sc);
  if (bad.length) throw new Error(`scenario "${sc?.name ?? '?'}": ${bad.join('; ')}`);
  const ctx: Record<string, unknown> = { ...(sc.context ?? {}) };
  const steps: TraceStep[] = [];
  const redirects: TraceResult['redirects'] = [];
  const journeys: JourneyInfo[] = [];
  const max = sc.maxSteps ?? 300;

  let flowId = sc.entry;
  let local: Record<string, unknown> = {};
  let slots: Record<string, unknown> = { ...(sc.slots ?? {}) };
  let status: string | undefined;
  const visits = new Map<string, number>();
  // The exit a scenario sets for a node on THIS visit (a list advances one entry per visit; the last repeats).
  const journeyExit = (fid: string, nm: string): string | undefined => {
    const key = `${fid}/${nm}`;
    const v = sc.journeys?.[key] ?? sc.journeys?.[nm];
    if (v === undefined) return undefined;
    if (!Array.isArray(v)) return v;
    const k = visits.get(key) ?? 0;
    visits.set(key, k + 1);
    return v.length ? v[Math.min(k, v.length - 1)] : undefined;
  };
  let gjIndex: number | undefined;

  const done = (end: TraceResult['end'], endDetail: string): TraceResult =>
    ({ scenario: sc.name ?? sc.entry, steps, redirects, journeys, end, endDetail, context: { ...ctx } });

  const startOf = (fid: string): Json | undefined => {
    const nodes = (docs[fid]?.nodes ?? {}) as Record<string, Json>;
    return Object.values(nodes).find((n) => n.type === 'start');
  };
  const nodeById = (fid: string, id: unknown): Json | undefined =>
    ((docs[fid]?.nodes ?? {}) as Record<string, Json>)[String(id)];

  const resolveText = (v: unknown): unknown => {
    if (typeof v !== 'string') return v;
    const whole = v.match(/^\{([A-Za-z0-9_]+):NLX\.Context\}$/);
    if (whole) return ctx[whole[1]];
    return v.replace(CTX_TOKEN, (_m, k: string) => String(ctx[k] ?? ''));
  };
  const operand = (o: Json | undefined): unknown => {
    if (!o) return undefined;
    switch (o.type) {
      case 'constant': case 'constant_id': return resolveText(o.value);
      case 'context': return ctx[String(o.name)];
      case 'variable': case 'field': return local[String(o.name)];
      case 'slot': case 'slot_value_id': return slots[String(o.name)];
      case 'node_status': return status;
      case 'system': return String(o.name) === 'System.gjConditionIndex' ? gjIndex : undefined;
      default: return undefined;
    }
  };
  const holds = (c: Json): boolean => {
    const l = operand(c.left as Json), r = operand(c.right as Json);
    switch (c.operator) {
      case 'eq': return l === r || (l != null && r != null && String(l) === String(r));
      case 'neq': return !(l === r || (l != null && r != null && String(l) === String(r)));
      case 'exists': return l !== undefined && l !== null && l !== '';
      case 'not_exists': return l === undefined || l === null || l === '';
      case 'gt': return Number(l) > Number(r);
      case 'gte': return Number(l) >= Number(r);
      case 'lt': return Number(l) < Number(r);
      case 'lte': return Number(l) <= Number(r);
      case 'contains': return String(l ?? '').includes(String(r ?? ''));
      default: return false;
    }
  };
  const pick = (n: Json): Json | undefined => {
    for (const ch of (n.childNodes ?? []) as Json[]) {
      const conds = (ch.conditions ?? []) as Json[];
      if (conds.every(holds)) return ch;
    }
    return undefined;
  };
  const applyMods = (n: Json): void => {
    for (const sm of (meta(n).stateModifications ?? []) as Json[]) {
      if (sm.type === 'context' && typeof sm.name === 'string') {
        if (sm.modification === 'set') ctx[sm.name] = operand(sm.value as Json);
        else if (sm.modification === 'clear' || sm.modification === 'reset') delete ctx[sm.name];
        else if (sm.modification === 'increment') ctx[sm.name] = (Number(ctx[sm.name]) || 0) + 1;
        else if (sm.modification === 'decrement') ctx[sm.name] = (Number(ctx[sm.name]) || 0) - 1;
      } else if (sm.type === 'slot' && typeof sm.name === 'string' && sm.modification === 'clear') {
        // A cleared slot falls back to the scenario's value on the next capture (re-prompt in a retry loop).
        slots[sm.name] = sc.slots?.[sm.name];
      }
    }
    const def = meta(n).define as Json | undefined;
    if (n.type === 'define' && def?.name) local[String(def.name)] = operand(def.value as Json);
  };

  let node = startOf(flowId);
  if (!node) return done('stuck', `entry flow "${flowId}" not found or has no start node`);

  for (let i = 0; i < max; i++) {
    status = undefined;
    gjIndex = undefined;
    const type = String(node.type);
    const step: TraceStep = { flow: flowId, node: nameOf(node), type };
    steps.push(step);
    applyMods(node);

    if (type === 'terminate') return done('terminate', `${flowId} / ${nameOf(node)}`);
    if (type === 'escalate') return done('escalate', `${flowId} / ${nameOf(node)}`);
    if (type === 'redirect') {
      const rd = meta(node).redirect as Json | undefined;
      const to = String(rd?.flowId ?? rd?.id ?? rd?.intentId ?? '');
      redirects.push({ from: flowId, to, context: { ...ctx } });
      step.outcome = `redirect -> ${to}`;
      flowId = to; local = {}; slots = { ...(sc.slots ?? {}) };
      node = startOf(flowId);
      if (!node) return done('stuck', `redirect target "${to}" not found`);
      continue;
    }
    if (type === 'data_request') {
      const dr = ((node.dataRequests ?? []) as Json[])[0] ?? {};
      const id = String(dr.dataRequestId ?? dr.variableId ?? dr.name ?? '');
      const o = sc.dataRequests?.[id] ?? {};
      status = o.status ?? 'success';
      if (status === 'success') for (const [k, v] of Object.entries(o.response ?? {})) local[`${id}.${k}`] = v;
      step.outcome = `${id}: ${status}`;
    } else if (type === 'generative_journey') {
      const gj = (meta(node).generativeJourney ?? {}) as Json;
      const prompt = String(gj.prompt ?? '');
      const tokens = [...new Set([...JSON.stringify(gj).matchAll(CTX_TOKEN)].map((m) => m[1]))];
      journeys.push({
        flow: flowId, node: nameOf(node), prompt,
        contextTokens: tokens.map((t) => ({ name: t, value: ctx[t] })),
        tools: ((gj.tools ?? []) as Json[]).map((t) =>
          String((t.dataRequest as Json | undefined)?.dataRequestId ?? (t.dataRequest as Json | undefined)?.variableId ?? t.knowledgeBaseId ?? t.type ?? '')),
      });
      const capture = (gj.dataCapture as Json | undefined)?.data as Json[] | undefined;
      const exits = ((gj.exitConditions ?? []) as Json[]).map((e) => String(e.name));
      status = journeyExit(flowId, nameOf(node))
        ?? (capture?.length ? 'data_captured' : exits[0] ?? 'success');
      if (status && exits.includes(status)) gjIndex = exits.indexOf(status);
      step.outcome = `exit: ${status}`;
    } else if (type === 'knowledge_base') {
      status = journeyExit(flowId, nameOf(node)) ?? 'match';
      step.outcome = status;
    } else if (type === 'generative_text') {
      status = 'success';
    } else if (type === 'user_choice') {
      const choice = meta(node).choice as Json | undefined;
      const slot = String(choice?.slotId ?? choice?.slotTypeId ?? '');
      step.outcome = slot ? `${slot} = ${String(slots[slot] ?? '(none)')}` : undefined;
    }

    const next = pick(node);
    if (!next) return done('stuck', `${flowId} / ${nameOf(node)}: no exit matches (status ${status ?? '-'})`);
    if (!next.nodeId) return done('stuck', `${flowId} / ${nameOf(node)}: exit "${status ?? ''}" is unwired`);
    if (type === 'split' || type === 'user_choice') step.outcome = (step.outcome ? step.outcome + ' ' : '') +
      `-> ${nameOf(nodeById(flowId, next.nodeId) ?? {})}`;
    const nn = nodeById(flowId, next.nodeId);
    if (!nn) return done('stuck', `${flowId}: exit points at missing node ${String(next.nodeId)}`);
    node = nn;
  }
  return done('max-steps', `stopped after ${max} steps (likely a loop the scenario never leaves)`);
}

/** One-line-per-step rendering for chat and results files. */
export function formatTrace(t: TraceResult): string {
  const lines = [`Scenario: ${t.scenario} -> ${t.end.toUpperCase()} (${t.endDetail})`];
  let flow = '';
  for (const s of t.steps) {
    if (s.flow !== flow) { flow = s.flow; lines.push(`  [${flow}]`); }
    lines.push(`    ${s.type.padEnd(18)} ${s.node}${s.outcome ? `  (${s.outcome})` : ''}`);
  }
  for (const j of t.journeys) {
    lines.push(`  Generative Journey "${j.node}" in ${j.flow}: tools [${j.tools.join(', ') || 'none'}]; context ` +
      (j.contextTokens.map((c) => `${c.name}=${c.value === undefined ? 'UNSET' : JSON.stringify(c.value)}`).join(', ') ||
        'none'));
  }
  return lines.join('\n');
}

/** Every input a scenario can set, listed from the flows themselves, so scenarios bind to real names:
 *  user_choice slots with their value ids, Generative Journey exits and captured slots, split conditions,
 *  data-request ids per flow, and the response fields each flow reads from them. */
export interface BranchInputs {
  flow: string;
  choices: Array<{ node: string; slot: string; values: string[] }>;
  journeys: Array<{ node: string; exits: string[]; captures: string[]; tools: string[] }>;
  splits: Array<{ node: string; branches: string[] }>;
  dataRequests: Array<{ node: string; id: string; fieldsRead: string[] }>;
}

function condText(c: Json): string {
  const side = (o: Json | undefined): string => {
    if (!o) return '?';
    if (o.type === 'constant' || o.type === 'constant_id') return JSON.stringify(o.value);
    return `${String(o.type)}:${String(o.name ?? '')}`;
  };
  return `${side(c.left as Json)} ${String(c.operator)} ${side(c.right as Json)}`;
}

export function listBranchInputs(docs: FlowDocs): BranchInputs[] {
  const out: BranchInputs[] = [];
  for (const [flow, doc] of Object.entries(docs)) {
    const nodes = Object.values((doc.nodes ?? {}) as Record<string, Json>);
    const bi: BranchInputs = { flow, choices: [], journeys: [], splits: [], dataRequests: [] };
    for (const n of nodes) {
      const nm = nameOf(n);
      if (n.type === 'user_choice') {
        const ch = meta(n).choice as Json | undefined;
        const slot = String(ch?.slotId ?? ch?.slotTypeId ?? '');
        const values = ((n.childNodes ?? []) as Json[]).flatMap((c) => ((c.conditions ?? []) as Json[])
          .filter((x) => (x.right as Json | undefined)?.type === 'constant_id').map((x) => String((x.right as Json).value)));
        bi.choices.push({ node: nm, slot, values });
      } else if (n.type === 'generative_journey') {
        const gj = (meta(n).generativeJourney ?? {}) as Json;
        const exits = ((gj.exitConditions ?? []) as Json[]).map((e) => String(e.name));
        const captures = (((gj.dataCapture as Json | undefined)?.data ?? []) as Json[]).map((d) => String(d.name));
        if (captures.length) exits.unshift('data_captured');
        exits.push('timeout', 'failure');
        const tools = ((gj.tools ?? []) as Json[]).map((t) =>
          String((t.dataRequest as Json | undefined)?.dataRequestId ?? (t.dataRequest as Json | undefined)?.variableId ?? t.knowledgeBaseId ?? t.type ?? ''));
        bi.journeys.push({ node: nm, exits, captures, tools });
      } else if (n.type === 'split') {
        const branches = ((n.childNodes ?? []) as Json[]).map((c) => {
          const conds = (c.conditions ?? []) as Json[];
          return conds.length ? conds.map(condText).join(' and ') : '(else)';
        });
        bi.splits.push({ node: nm, branches });
      } else if (n.type === 'data_request') {
        const dr = ((n.dataRequests ?? []) as Json[])[0] ?? {};
        const id = String(dr.dataRequestId ?? dr.variableId ?? dr.name ?? '');
        const rest = JSON.stringify(nodes.filter((x) => x !== n));
        const fieldsRead = [...new Set([...rest.matchAll(new RegExp(`${id}\\.([A-Za-z0-9_]+)`, 'g'))].map((m) => m[1]))];
        bi.dataRequests.push({ node: nm, id, fieldsRead });
      }
    }
    out.push(bi);
  }
  return out;
}
