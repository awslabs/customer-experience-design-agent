// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// LAYER: SUPPORT — deterministic cross-flow DESIGN FINDINGS. Companion to flowset-checks.ts. Every finding BLOCKS
// the FlowSpec build and the deploy pre-flight until the design is fixed or the finding is recorded as intended
// in flowset.json (with a reason), so a known issue never reaches deployment:
//
//   1) DEAD DATA — a data request's response (or a declared response field) is never read in the flow that
//      called it. Data-request output is flow-local and does not survive a Redirect, so an unread field is
//      fetched and then lost: it is neither used (split, message, prompt, payload) nor promoted to a context var.
//   2) DEAD STATE — a context var is set but no flow ever reads it (handoff vars set in a flow that escalates,
//      and vars listed in externalVars/externalReads, are exempt: Connect or the agent desktop reads them).
//   3) SHARED-TIER GENERATIVE JOURNEY (Architecture Principle 13) — a Generative Journey reachable both WITHOUT and
//      AFTER the auth flow may carry only tools an unauthenticated caller may use. A tool listed in `privilegedTools`
//      attached to it is a finding that cannot be accepted (redesign). A shared-tier journey with data-request tools
//      while `privilegedTools` is not declared is a finding (declare it). Journeys with safe tools are not reported.
//
// Recording an intended unused response field: flowset.json `unusedFields`:
//   { "<dataRequestId>": { "fields": ["productLine", "tier"], "reason": "echo of values the flow already holds" } }
//   ("*" = the whole response is intentionally unused, e.g. a write). A reason is required.
//   4) UNUSED GENERATIVE TEXT — a generative_text node is silent: it only writes its output to a local. If no
//      message, prompt, condition or state change in the same flow reads that local, the text is generated and
//      lost (the caller never sees it). This cannot be recorded as intended: show it or remove the node.
//
//   7) NEEDLESS COPY — a context var set from a data-request field but read only in the flow that set it.
//   6) THIN JOURNEY PROMPT — a Generative Journey prompt missing a required section tag (<use-case>,
//      <previous-context>, <task>, <exit>). The prompt is the journey's only instructions; cannot be recorded.
//   5) SPLIT CONVERSATION (Architecture Principle 14) — inside one flow, (a) a Generative Journey leads to another
//      with only message or state-setting (basic) nodes between them, or (b) a journey captures a slot that an
//      earlier journey on the same path already captured. Either means the caller crosses a handover with no
//      decision in between. Merge the journeys, or record the pair in flowset.json `separateJourneys` with a reason:
//      [{ "journeys": ["Greeting", "Sign-in capture"], "reason": "..." }].
//
// Pure, no AWS calls, never throws on shape. Flow-level granularity, same as flowset-checks.ts.
import { nodeTiers, type FlowSetOptions } from './flowset-checks';

export interface FlowSetWarningOptions extends FlowSetOptions {
  /** dataRequestId -> declared top-level response field names (from resources/data-requests.json responseSchema). */
  dataRequestFields?: Record<string, string[]>;
  /** Context vars read outside the flows. Each entry must name its reader, e.g.
   *  { "var": "escalationReason", "readBy": "Connect contact flow (queue routing)" }. A bare name, or an entry
   *  with no readBy, does NOT suppress the dead-state warning: the list documents real external consumers, it
   *  is not a way to silence the check. */
  externalReads?: Array<string | { var: string; readBy?: string }>;
  /** Data-request ids / knowledge-base names that return caller-privileged data (flowset.json). */
  privilegedTools?: string[];
  /** Response fields intentionally not used, per data request, each with a reason (flowset.json). */
  unusedFields?: Record<string, { fields?: string[]; reason?: string }>;
  /** Journey pairs kept apart on purpose, by node name, each with a reason (flowset.json). */
  separateJourneys?: Array<{ journeys?: string[]; reason?: string }>;
}

/** How to resolve each finding, appended to the build / pre-flight failure. */
export const FINDING_RESOLUTION =
  'Each finding is a design defect to fix in Flow Authoring (rebuild and re-run Build SIT), or, only when it is ' +
  'intended, record it in flows/flowset.json with a reason: unusedFields for response fields, externalReads ' +
  '(with readBy) for vars read outside the flows. A privileged tool or value on a journey an unauthenticated caller can reach cannot be recorded: ' +
  'give the authenticated path its own journey.';

type Json = Record<string, unknown>;
type AnyFlow = { flowId?: string; nodes?: Record<string, unknown> };

const CTX_TOKEN = /\{([A-Za-z0-9_]+):NLX\.Context\}/g;
const CTX_OPERAND = /"type":"context","name":"([A-Za-z0-9_]+)"/g;

function nodesOf(f: AnyFlow): Json[] { return Object.values(f.nodes ?? {}) as Json[]; }
function meta(n: Json): Json { return (n.metadata ?? {}) as Json; }
function nameOf(n: Json): string { return String(meta(n).name ?? n.nodeId ?? '?'); }

function drIdsOf(n: Json): string[] {
  if (n.type !== 'data_request') return [];
  return ((n.dataRequests ?? []) as Json[]).map((d) => String(d.dataRequestId ?? d.variableId ?? d.name ?? '')).filter(Boolean);
}

function redirectTarget(n: Json): string | undefined {
  const rd = meta(n).redirect as Json | undefined;
  const t = rd?.flowId ?? rd?.id ?? rd?.intentId;
  return n.type === 'redirect' && typeof t === 'string' ? t : undefined;
}

/** Every context var a flow reads (state-mod operands, conditions, {x:NLX.Context} tokens anywhere in the node). */
function contextReads(f: AnyFlow): Set<string> {
  const reads = new Set<string>();
  for (const n of nodesOf(f)) {
    const s = JSON.stringify(n);
    for (const m of s.matchAll(CTX_TOKEN)) reads.add(m[1]);
    // typed operands, e.g. a number/boolean data-request body value { type:'context', name }
    for (const m of s.matchAll(CTX_OPERAND)) reads.add(m[1]);
    for (const sm of (meta(n).stateModifications ?? []) as Json[]) {
      const v = sm.value as Json | undefined;
      if (v?.type === 'context' && typeof v.name === 'string') reads.add(v.name);
    }
    for (const c of (n.childNodes ?? []) as Json[]) for (const cond of (c.conditions ?? []) as Json[]) {
      for (const side of [cond.left, cond.right] as Json[]) {
        if (side?.type === 'context' && typeof side.name === 'string') reads.add(side.name);
      }
    }
  }
  return reads;
}

/** Context vars set in a flow, as state-mod targets. */
function contextSets(f: AnyFlow): Set<string> {
  const sets = new Set<string>();
  for (const n of nodesOf(f)) for (const sm of (meta(n).stateModifications ?? []) as Json[]) {
    if (sm.type === 'context' && typeof sm.name === 'string' && sm.modification === 'set') sets.add(sm.name);
  }
  return sets;
}

/** Context reads, excluding a var's appearance only as its own state-mod target. */
function trueContextReads(f: AnyFlow): Set<string> {
  const reads = new Set<string>();
  for (const n of nodesOf(f)) {
    const copy = JSON.parse(JSON.stringify(n)) as Json;
    const m = (copy.metadata ?? {}) as Json;
    // drop state-mod targets (keep their value operands) before scanning
    m.stateModifications = ((m.stateModifications ?? []) as Json[]).map((sm) => ({ value: sm.value }));
    for (const r of contextReads({ nodes: { x: copy } })) reads.add(r);
  }
  return reads;
}

/** Is a data-request field (or any field when field is undefined) read anywhere in the flow outside the DR node? */
function drFieldRead(f: AnyFlow, drId: string, drNodeId: unknown, field?: string): boolean {
  const needle = field ? `${drId}.${field}` : `${drId}.`;
  for (const n of nodesOf(f)) {
    if (n.nodeId === drNodeId) continue;
    const s = JSON.stringify(n);
    if (field ? new RegExp(`${drId}\\.${field}(?![A-Za-z0-9_])`).test(s) : s.includes(needle)) return true;
  }
  return false;
}

function graphOf(flows: AnyFlow[]): Map<string, Set<string>> {
  const g = new Map<string, Set<string>>();
  for (const f of flows) {
    if (!f.flowId) continue;
    const out = new Set<string>();
    for (const n of nodesOf(f)) { const t = redirectTarget(n); if (t) out.add(t); }
    g.set(f.flowId, out);
  }
  return g;
}

function entriesOf(g: Map<string, Set<string>>, opts: FlowSetOptions): string[] {
  if (opts.entryFlows?.length) return opts.entryFlows;
  const inbound = new Set<string>();
  for (const outs of g.values()) for (const t of outs) inbound.add(t);
  return [...g.keys()].filter((id) => !inbound.has(id));
}

/** Flows reachable from `starts` along redirects, never entering any flow in `blocked`. */
function reach(g: Map<string, Set<string>>, starts: string[], blocked: Set<string>): Set<string> {
  const seen = new Set<string>();
  const q = starts.filter((s) => !blocked.has(s));
  while (q.length) {
    const at = q.shift()!;
    if (seen.has(at)) continue;
    seen.add(at);
    for (const nx of g.get(at) ?? []) if (!blocked.has(nx)) q.push(nx);
  }
  return seen;
}

/** Caller tiers per flow: `unauth` = reachable without passing the auth flow; `auth` = reachable after it. */
export function callerTiers(flows: AnyFlow[], opts: FlowSetOptions = {}): Map<string, Set<'unauth' | 'auth'>> {
  const g = graphOf(flows);
  const tiers = new Map<string, Set<'unauth' | 'auth'>>();
  for (const id of g.keys()) tiers.set(id, new Set());
  const entries = entriesOf(g, opts);
  const auth = opts.authFlowId;
  if (!auth || !g.has(auth)) {
    for (const id of reach(g, entries, new Set())) tiers.get(id)?.add('unauth');
    return tiers;
  }
  for (const id of reach(g, entries, new Set([auth]))) tiers.get(id)?.add('unauth');
  for (const id of reach(g, [...(g.get(auth) ?? [])], new Set())) tiers.get(id)?.add('auth');
  return tiers;
}

export function checkFlowSetWarnings(flows: AnyFlow[], opts: FlowSetWarningOptions = {}): string[] {
  const out: string[] = [];
  const external = new Set<string>(opts.externalVars ?? []);
  const unnamedReads: string[] = [];
  for (const e of opts.externalReads ?? []) {
    if (typeof e === 'object' && e?.var && typeof e.readBy === 'string' && e.readBy.trim()) external.add(e.var);
    else unnamedReads.push(typeof e === 'string' ? e : String(e?.var ?? '?'));
  }
  for (const v of unnamedReads) {
    out.push(`externalReads: "${v}" does not name its reader, so it does not suppress dead-state checks. Use ` +
      `{ "var": "${v}", "readBy": "<the Connect flow, agent desktop or system that reads it>" } only if something ` +
      `outside the flows really reads it; otherwise fix or remove the var.`);
  }

  // Accepted unused fields (need a reason).
  const accepted = new Map<string, Set<string>>();
  for (const [dr, e] of Object.entries(opts.unusedFields ?? {})) {
    if (!e || typeof e.reason !== 'string' || !e.reason.trim() || !Array.isArray(e.fields) || !e.fields.length) {
      out.push(`unusedFields: "${dr}" needs "fields" and a "reason", e.g. { "fields": ["tier"], "reason": "echo of ` +
        'the request" }; without a reason it does not record anything.');
      continue;
    }
    accepted.set(dr, new Set(e.fields));
  }
  const isAccepted = (dr: string, fd?: string) => {
    const a = accepted.get(dr);
    return !!a && (a.has('*') || (fd !== undefined && a.has(fd)));
  };

  // 1) dead data
  for (const f of flows) {
    for (const n of nodesOf(f)) {
      for (const drId of drIdsOf(n)) {
        const fields = opts.dataRequestFields?.[drId];
        if (fields?.length) {
          const unread = fields.filter((fd) => !drFieldRead(f, drId, n.nodeId, fd) && !isAccepted(drId, fd));
          if (unread.length && unread.length === fields.length) {
            out.push(`dead data: flow "${f.flowId}" calls "${drId}" ("${nameOf(n)}") but reads none of its response ` +
              `fields. Data-request output does not survive a Redirect: use it here or promote what later flows ` +
              `need to a context var (a deliberate write: record unusedFields "${drId}": ["*"] with a reason).`);
          } else if (unread.length) {
            out.push(`dead data: flow "${f.flowId}" calls "${drId}" but never reads field(s) ${unread.join(', ')} ` +
              `(not used here, not promoted to a context var, lost at the next Redirect). Use them, or record them in ` +
              `unusedFields with a reason if the flow really does not need them.`);
          }
        } else if (!drFieldRead(f, drId, n.nodeId) && !isAccepted(drId)) {
          out.push(`dead data: flow "${f.flowId}" calls "${drId}" ("${nameOf(n)}") but never reads its response ` +
            `(a deliberate write: record unusedFields "${drId}": ["*"] with a reason).`);
        }
      }
    }
  }

  // 2) dead state
  const readAnywhere = new Set<string>();
  for (const f of flows) for (const r of trueContextReads(f)) readAnywhere.add(r);
  for (const f of flows) {
    const escalates = nodesOf(f).some((n) => n.type === 'escalate');
    for (const v of contextSets(f)) {
      if (readAnywhere.has(v) || external.has(v) || escalates) continue;
      out.push(`dead state: context var "${v}" is set in flow "${f.flowId}" but no flow reads it ` +
        `(if Connect or the agent desktop really reads it, list it in flowset.json externalReads with its readBy; otherwise fix or remove it).`);
    }
  }

  // 3) shared-tier Generative Journeys (Architecture Principle 13)
  // With authFlagVar, tiers are per NODE (works inside one flow); otherwise per flow along redirects.
  const nTiers = opts.authFlagVar ? nodeTiers(flows, entriesOf(graphOf(flows), opts), opts.authFlagVar) : undefined;
  const tiers = callerTiers(flows, opts);
  const privilegedDeclared = Array.isArray(opts.privilegedTools);
  const privileged = new Set(opts.privilegedTools ?? []);
  const identity = new Set<string>(opts.identityVars ?? []);
  for (const f of flows) {
    const t = tiers.get(f.flowId ?? '');
    if (!nTiers && (!t || !(t.has('unauth') && t.has('auth')))) continue;
    for (const n of nodesOf(f)) {
      if (n.type !== 'generative_journey') continue;
      if (nTiers) {
        const key = `${f.flowId}#${String(n.nodeId ?? '')}`;
        if (!(nTiers.pre.has(key) && nTiers.post.has(key))) continue;
      }
      const gj = (meta(n).generativeJourney ?? {}) as Json;
      const toolList = (gj.tools ?? []) as Json[];
      const tools = toolList.map((x) => {
        const dr = x.dataRequest as Json | undefined;
        return String(dr?.dataRequestId ?? dr?.variableId ?? x.knowledgeBaseId ?? x.name ?? '');
      }).filter(Boolean);
      const bad = tools.filter((x) => privileged.has(x) || privileged.has(x.replace(/^\{|\}$/g, '')));
      // privileged values passed in: a context token in the prompt for an identity var (set only after sign-in)
      const prompt = String(gj.prompt ?? '');
      const passed = [...new Set([...prompt.matchAll(CTX_TOKEN)].map((m) => m[1]).filter((v) => identity.has(v)))];
      if (passed.length) {
        out.push(`shared-tier: Generative Journey "${nameOf(n)}" in flow "${f.flowId}" is reachable by unauthenticated ` +
          `callers and its prompt reads value(s) set only after sign-in: ${passed.join(', ')} (Architecture Principle 13). ` +
          'Give the authenticated path its own journey for these, and merge the paths again for deterministic nodes.');
      }
      const hasDrTool = toolList.some((x) => x.type === 'dataRequest');
      if (bad.length) {
        out.push(`shared-tier: Generative Journey "${nameOf(n)}" in flow "${f.flowId}" is reachable by both ` +
          `unauthenticated and authenticated callers (Architecture Principle 13) and has PRIVILEGED TOOL(S) ATTACHED: ` +
          `${bad.join(', ')}. Remove them from this journey and give the authenticated path its own journey with ` +
          `these tools attached; merge the paths again for deterministic nodes.`);
      } else if (hasDrTool && !privilegedDeclared) {
        out.push(`shared-tier: Generative Journey "${nameOf(n)}" in flow "${f.flowId}" is reachable before and after ` +
          `sign-in and has data-request tools (${tools.join(', ')}), but flowset.json does not declare ` +
          `"privilegedTools". List every data request or knowledge base that returns caller-privileged data ` +
          `(use [] if none) so the check can confirm this journey is safe.`);
      }
    }
  }

  // 4) unused Generative Text output (the node is silent; something must show or use its local)
  for (const f of flows) {
    for (const n of nodesOf(f)) {
      if (n.type !== 'generative_text') continue;
      const local = String(((meta(n).generativeText ?? {}) as Json).name ?? '');
      if (!local) continue;
      const token = new RegExp(`\\{${local}:NLX\\.Local\\}`);
      const operand = new RegExp(`"type":"local","name":"${local}"`);
      const used = nodesOf(f).some((o) => {
        const s = JSON.stringify(o === n ? { ...o, metadata: { ...meta(o), generativeText: { prompt: (meta(o).generativeText as Json)?.prompt } } } : o);
        return token.test(s) || operand.test(s);
      });
      if (!used) {
        out.push(`unused Generative Text: "${nameOf(n)}" in flow "${f.flowId}" writes "${local}" but nothing shows or ` +
          `uses it. A Generative Text node is silent (it only writes a local), so the caller never sees this text. ` +
          `Show it in the next message, e.g. "{${local}:NLX.Local} Would you like to go ahead?", or use it in a ` +
          `state change; otherwise remove the node.`);
      }
    }
  }
  // 6) thin journey prompt
  const REQUIRED_SECTIONS = ['use-case', 'previous-context', 'task', 'exit'];
  for (const f of flows) {
    for (const n of nodesOf(f)) {
      if (n.type !== 'generative_journey') continue;
      const prompt = String(((meta(n).generativeJourney ?? {}) as Json).prompt ?? '');
      const missing = REQUIRED_SECTIONS.filter((t) => !(prompt.includes(`<${t}>`) && prompt.includes(`</${t}>`)));
      if (missing.length) {
        out.push(`thin journey prompt: Generative Journey "${nameOf(n)}" in flow "${f.flowId}" is missing ` +
          `${missing.map((t) => `<${t}>`).join(', ')}. Copy the full prompt from acxd-prompt-specs.md with all eight ` +
          'sections (Flow Design Step 5); the prompt is the journey\'s only instructions.');
      }
    }
  }
  // 5) split conversation
  const keptApart = new Set<string>();
  for (const e of opts.separateJourneys ?? []) {
    const j = e?.journeys ?? [];
    if (j.length !== 2 || typeof e.reason !== 'string' || !e.reason.trim()) {
      out.push('separateJourneys: each entry needs two journey names and a "reason", e.g. { "journeys": ["Greeting", ' +
        '"Sign-in capture"], "reason": "..." }; without a reason it does not record anything.');
      continue;
    }
    keptApart.add(`${j[0]}|${j[1]}`); keptApart.add(`${j[1]}|${j[0]}`);
  }
  for (const f of flows) {
    const byId = new Map<string, Json>();
    for (const [k, raw] of Object.entries(f.nodes ?? {})) { const n = raw as Json; byId.set(String(n.nodeId ?? k), n); }
    const kids = (n: Json) => ((n.childNodes ?? []) as Json[]).map((c) => byId.get(String(c.nodeId ?? ''))).filter(Boolean) as Json[];
    const captures = (n: Json) => new Set((((meta(n).generativeJourney as Json)?.dataCapture as Json)?.data as Json[] ?? [])
      .map((d) => String(d.name ?? d.slotName ?? '')).filter(Boolean));
    const reported = new Set<string>();
    const report = (a: Json, b: Json, why: string) => {
      const key = `${nameOf(a)}|${nameOf(b)}`;
      if (keptApart.has(key) || reported.has(key)) return;
      reported.add(key);
      out.push(`split conversation: in flow "${f.flowId}", Generative Journey "${nameOf(b)}" follows "${nameOf(a)}" ${why}. ` +
        'The caller crosses a handover with no decision in between (Architecture Principle 14). Merge them into one ' +
        'journey, or record the pair in flowset.json separateJourneys with a reason.');
    };
    for (const a of byId.values()) {
      if (a.type !== 'generative_journey') continue;
      // (a) next journey reached through basic nodes only
      const seen = new Set<Json>(); let frontier = kids(a);
      while (frontier.length) {
        const next: Json[] = [];
        for (const n of frontier) {
          if (seen.has(n) || n === a) continue; seen.add(n);
          if (n.type === 'generative_journey') report(a, n, 'with only message or state-setting nodes between them');
          else if (n.type === 'basic') next.push(...kids(n));
        }
        frontier = next;
      }
      // (b) a later journey on any path re-captures a slot
      const capA = captures(a);
      if (!capA.size) continue;
      const seen2 = new Set<Json>([a]); const stack = kids(a);
      while (stack.length) {
        const n = stack.pop() as Json;
        if (seen2.has(n)) continue; seen2.add(n);
        if (n.type === 'generative_journey') {
          const dup = [...captures(n)].filter((x) => capA.has(x));
          if (dup.length) report(a, n, `and captures ${dup.join(', ')} again`);
        }
        stack.push(...kids(n));
      }
    }
  }
  // 7) needless copy: a context var set from a data-request field but read only in the flow that set it. Within a
  //    flow, later nodes read {dataRequestId.field:NLX.Variable} directly; a context var is for leaving the flow
  //    (another flow after a Redirect, or Connect / the agent desktop, declared in externalReads).
  {
    const readsByFlow = new Map<string, Set<string>>();
    for (const f of flows) readsByFlow.set(String(f.flowId), trueContextReads(f));
    for (const f of flows) {
      const fid = String(f.flowId);
      const fromDr = new Map<string, string>();
      const setters = new Map<string, number>();   // nodes that set the var by any means
      for (const n of nodesOf(f)) for (const sm of (meta(n).stateModifications ?? []) as Json[]) {
        const v = sm.value as Json | undefined;
        if (sm.type === 'context' && sm.modification === 'set' && typeof sm.name === 'string') setters.set(sm.name, (setters.get(sm.name) ?? 0) + 1);
        if (sm.type === 'context' && sm.modification === 'set' && v?.type === 'variable' && typeof sm.name === 'string') fromDr.set(sm.name, nameOf(n));
      }
      for (const [v, setter] of fromDr) {
        // Set on more than one node: the var carries one value from mutually exclusive branches (a looked-up loyalty
        // level or a default; three pricing calls feeding one read-back), which a direct field reference cannot do.
        if ((setters.get(v) ?? 0) > 1) continue;
        // identityVars are not exempt: listing a value there does not make a same-flow copy necessary.
        if (external.has(v) || v === opts.authFlagVar) continue;
        const elsewhere = [...readsByFlow].some(([other, r]) => other !== fid && r.has(v));
        if (elsewhere) continue;
        out.push(`needless copy: context var "${v}" is set from a data-request field on "${setter}" in flow "${fid}" but is ` +
          `read only in that flow. Later nodes in the same flow read the field directly as {dataRequestId.field:NLX.Variable}; ` +
          `remove the context var and the copy. A context var is only for a value that leaves the flow (a Redirect, or ` +
          `Connect via externalReads with readBy).`);
      }
    }
  }

  // 8) unbounded re-prompt: a user_choice no-match path that returns to the same choice without changing a counter.
  //    A caller who never gives a valid answer would loop forever. Bound it: increment a counter on the re-prompt,
  //    split on it, and escalate after the bound (or escalate on the first miss).
  for (const f of flows) {
    const byId = new Map<string, Json>();
    for (const n of nodesOf(f)) byId.set(String(n.nodeId), n);
    for (const uc of nodesOf(f)) {
      if (uc.type !== 'user_choice') continue;
      const ucId = String(uc.nodeId);
      for (const c of (uc.childNodes ?? []) as Json[]) {
        const conds = JSON.stringify(c.conditions ?? []);
        if (!conds.includes('"not_exists"') || typeof c.nodeId !== 'string') continue;
        // walk the no-match path until it reaches the same choice, or leaves through a split/journey/exit
        const seen = new Set<string>();
        let cur = c.nodeId as string; let counted = false; let loops = false;
        while (cur && !seen.has(cur)) {
          if (cur === ucId) { loops = true; break; }
          seen.add(cur);
          const n = byId.get(cur);
          if (!n || n.type !== 'basic') break;
          if (((meta(n).stateModifications ?? []) as Json[]).some((sm) => sm.type === 'context' &&
            (sm.modification === 'increment' || sm.modification === 'decrement'))) counted = true;
          const kids = (n.childNodes ?? []) as Json[];
          if (kids.length !== 1) break;
          cur = String(kids[0].nodeId ?? '');
        }
        if (loops && !counted) {
          out.push(`unbounded re-prompt: in flow "${f.flowId}", the no-match path of "${nameOf(uc)}" returns to the same ` +
            'choice without a counter, so a caller who never gives a valid answer loops forever. Increment a counter on ' +
            'the re-prompt node, split on it before returning, and escalate after the bound (one or two re-prompts).');
        }
      }
    }
  }

  return out;
}
