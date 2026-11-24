// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// LAYER: SUPPORT — cross-flow (flow-SET) checks.
// validate-flow-refs.ts checks ONE flow at a time, so it cannot see the design-contract bugs that span flows:
//   • a context var read in flow F that no flow sets,
//   • a context var read in F that is NOT set on every redirect path into F (e.g. a value set only on the
//     new-customer path but read by a flow both customer types reach),
//   • identity/account data set before the auth flow has run (a pre-auth lookup leaking identity),
//   • a redirect to a flow that isn't in the set.
// Works on EMITTED flow docs (console shape), so it covers both authoring paths (FlowSpec and TS scripts).
//
// GRANULARITY (deliberate approximation): ordering is modelled at FLOW level along redirect edges. A var set
// anywhere in a flow counts as set for every flow reached by redirect from it. Order WITHIN a flow is not
// modelled (a read before a same-flow setter is not flagged). Context vars that arrive from outside ACXD
// (e.g. Connect contact attributes) must be listed in `externalVars` or they are reported as "never set".

export interface FlowSetOptions {
  /** Context vars set outside the flows (Connect attributes, system-provided) — never reported as unset. */
  externalVars?: string[];
  /** Flow ids that are entry points. Default: flows with no inbound redirect. */
  entryFlows?: string[];
  /** Identity/account context vars that may only be set by, or after, the auth flow. */
  identityVars?: string[];
  /** The flow that verifies identity (e.g. billingMain). Required for the identity check. */
  authFlowId?: string;
  /** The context var set ONLY when the caller is verified (e.g. "authStatus"). When given, sign-in is modelled at
   *  NODE level: the node(s) that set it are the sign-in gate, so a single flow holding both the pre- and
   *  post-sign-in journey is checked correctly. Without it, the gate is the whole `authFlowId` flow. */
  authFlagVar?: string;
  /** Flows DECLARED as terminal sinks (opt-in; see "Terminal sink flows" in the flow-design knowledge). A sink
   *  must NEVER redirect onward (loop-prevention) and every path must end in a terminal node (escalate or
   *  terminate). A sink MAY legitimately mix terminals — e.g. terminate on the happy path and escalate on an
   *  error/capture-fail path. `variant` is an OPTIONAL intent label (the primary/happy-path exit kind); it is
   *  documentation, not a single-kind constraint. Enforced by checkFlowSet. */
  sinks?: Array<{ flowId: string; variant?: 'escalate' | 'terminate' }>;
}

type AnyFlow = { flowId?: string; nodes?: Record<string, unknown> };
type AnyNode = {
  type?: string;
  metadata?: {
    redirect?: { id?: string; intentId?: string; flowId?: string };
    stateModifications?: Array<{ type?: string; name?: string; modification?: string; value?: { type?: string; name?: string } }>;
  };
  childNodes?: Array<{ conditions?: Array<{ left?: { type?: string; name?: string }; right?: { type?: string; name?: string } }> }>;
  dataRequests?: Array<{ urlParams?: Record<string, string> }>;
  messages?: Array<{ body?: string }>;
};

const CTX_TOKEN = /\{([A-Za-z0-9_]+):NLX\.Context\}/g;

interface FlowFacts { sets: Set<string>; reads: Set<string>; redirectsTo: Set<string> }

function factsOf(flow: AnyFlow): FlowFacts {
  const sets = new Set<string>(), reads = new Set<string>(), redirectsTo = new Set<string>();
  const scanText = (t: unknown) => {
    if (typeof t !== 'string') return;
    for (const m of t.matchAll(CTX_TOKEN)) reads.add(m[1]);
  };
  for (const raw of Object.values(flow.nodes ?? {})) {
    const n = raw as AnyNode;
    const rd = n.metadata?.redirect;
    const target = rd?.flowId ?? rd?.id ?? rd?.intentId;
    if (n.type === 'redirect' && target) redirectsTo.add(target);
    for (const m of n.metadata?.stateModifications ?? []) {
      if (m.type === 'context' && m.name && m.modification === 'set') sets.add(m.name);
      if (m.value?.type === 'context' && m.value.name) reads.add(m.value.name);
    }
    for (const c of n.childNodes ?? []) {
      for (const cond of c.conditions ?? []) {
        if (cond.left?.type === 'context' && cond.left.name) reads.add(cond.left.name);
        if (cond.right?.type === 'context' && cond.right.name) reads.add(cond.right.name);
      }
    }
    for (const dr of n.dataRequests ?? []) for (const v of Object.values(dr.urlParams ?? {})) scanText(v);
    for (const msg of n.messages ?? []) scanText(msg.body);
    // Generative Journey prompts and generative_text prompts can carry {x:NLX.Context} tokens too.
    scanText(JSON.stringify((n.metadata as unknown as Record<string, unknown> | undefined)?.generativeJourney ?? ''));
    scanText(JSON.stringify((n.metadata as unknown as Record<string, unknown> | undefined)?.generativeText ?? ''));
  }
  return { sets, reads, redirectsTo };
}

/** Can `target` be reached from any entry flow WITHOUT passing through a flow in `blockers`?
 *  (A blocker flow that is itself an entry blocks its own paths.) Returns an example path if so. */
function reachableAvoiding(
  graph: Map<string, Set<string>>, entries: string[], target: string, blockers: Set<string>,
): string[] | null {
  const queue: string[][] = entries.filter((e) => !blockers.has(e) || e === target).map((e) => [e]);
  const seen = new Set<string>();
  while (queue.length) {
    const path = queue.shift()!;
    const at = path[path.length - 1];
    if (at === target) return path;
    if (seen.has(at)) continue;
    seen.add(at);
    for (const nx of graph.get(at) ?? []) {
      if (nx === target) return [...path, nx];
      if (!blockers.has(nx)) queue.push([...path, nx]);
    }
  }
  return null;
}


// ── Node-level sign-in tiers ───────────────────────────────────────────────────────────────────────────────
// Every node across the flow set, keyed "flowId#nodeId". Edges: childNodes inside a flow, and a redirect node to
// the target flow's start node. The sign-in gate is any node that SETS `authFlagVar`. `pre` = nodes reachable
// from an entry flow without passing a gate node; `post` = the gate nodes and everything reachable from them.
export interface NodeTiers { pre: Set<string>; post: Set<string>; gates: Set<string> }
type GNode = { nodeId?: string; type?: string; childNodes?: Array<{ nodeId?: string }>;
  metadata?: { redirect?: { id?: string; intentId?: string; flowId?: string }; stateModifications?: Array<{ type?: string; name?: string; modification?: string }> } };

export function nodeTiers(flows: AnyFlow[], entryFlows: string[], authFlagVar: string): NodeTiers {
  const nodes = new Map<string, GNode>();
  const startOf = new Map<string, string>();
  for (const f of flows) {
    if (!f.flowId) continue;
    for (const [k, raw] of Object.entries(f.nodes ?? {})) {
      const n = raw as GNode;
      const key = `${f.flowId}#${n.nodeId ?? k}`;
      nodes.set(key, n);
      if (n.type === 'start') startOf.set(f.flowId, key);
    }
  }
  const flowOf = (key: string) => key.split('#')[0];
  const next = (key: string): string[] => {
    const n = nodes.get(key)!;
    const out: string[] = [];
    for (const c of n.childNodes ?? []) if (c.nodeId) out.push(`${flowOf(key)}#${c.nodeId}`);
    const rd = n.metadata?.redirect;
    const t = rd?.flowId ?? rd?.id ?? rd?.intentId;
    if (n.type === 'redirect' && t && startOf.has(t)) out.push(startOf.get(t)!);
    return out.filter((x) => nodes.has(x));
  };
  const gates = new Set<string>();
  for (const [key, n] of nodes) {
    if ((n.metadata?.stateModifications ?? []).some((m) => m.type === 'context' && m.name === authFlagVar && m.modification === 'set')) gates.add(key);
  }
  const walk = (starts: string[], stopAtGates: boolean): Set<string> => {
    const seen = new Set<string>(); const q = [...starts];
    while (q.length) {
      const at = q.shift()!;
      if (seen.has(at)) continue;
      if (stopAtGates && gates.has(at)) continue;
      seen.add(at);
      for (const nx of next(at)) q.push(nx);
    }
    return seen;
  };
  const pre = walk(entryFlows.map((e) => startOf.get(e)).filter(Boolean) as string[], true);
  const post = walk([...gates], false);
  return { pre, post, gates };
}

/** Run every cross-flow check. Returns problems (empty = clean). Never throws on shape. */
/** The sign-in flag must be declared whenever identity vars are: without it the identity and shared-tier checks
 *  fall back to whole flows and miss a sign-in node inside one flow. Used by build-specs and deploy pre-flight. */
export function requireAuthFlagVar(opts: FlowSetOptions): string[] {
  if (opts.identityVars?.length && !opts.authFlagVar) {
    return ['flowset.json declares identityVars but no authFlagVar. Add "authFlagVar": "<the context var the ' +
      'sign-in node sets, e.g. authStatus>" so sign-in is checked at node level.'];
  }
  return [];
}

export function checkFlowSet(flows: AnyFlow[], opts: FlowSetOptions = {}): string[] {
  const problems: string[] = [];
  const facts = new Map<string, FlowFacts>();
  for (const f of flows) if (f.flowId) facts.set(f.flowId, factsOf(f));
  const ids = new Set(facts.keys());
  const external = new Set(opts.externalVars ?? []);

  const graph = new Map<string, Set<string>>();
  const inbound = new Map<string, number>();
  for (const id of ids) inbound.set(id, 0);
  for (const [id, fx] of facts) {
    graph.set(id, fx.redirectsTo);
    for (const t of fx.redirectsTo) {
      if (!ids.has(t)) problems.push(`flow "${id}" redirects to "${t}", which is not in the flow set`);
      else inbound.set(t, (inbound.get(t) ?? 0) + 1);
    }
  }
  const entries = opts.entryFlows?.length ? opts.entryFlows : [...ids].filter((id) => (inbound.get(id) ?? 0) === 0);
  for (const e of entries) if (!ids.has(e)) problems.push(`entry flow "${e}" is not in the flow set`);

  // 1) every context var read somewhere is set somewhere (or is external).
  const setters = new Map<string, Set<string>>();
  for (const [id, fx] of facts) for (const v of fx.sets) {
    if (!setters.has(v)) setters.set(v, new Set());
    setters.get(v)!.add(id);
  }
  for (const [id, fx] of facts) {
    for (const v of fx.reads) {
      if (external.has(v)) continue;
      const by = setters.get(v);
      if (!by || by.size === 0) {
        problems.push(`flow "${id}" reads context var "${v}", but no flow sets it (add a setter, or list it in externalVars if Connect/system provides it)`);
        continue;
      }
      // 2) reachability: set on EVERY redirect path into the reading flow. The reading flow itself counts
      //    as a setter (intra-flow order is not modelled).
      if (by.has(id)) continue;
      const path = reachableAvoiding(graph, entries, id, by);
      if (path) {
        problems.push(
          `flow "${id}" reads context var "${v}", but it can be reached without "${v}" being set ` +
          `(path: ${path.join(' -> ')}; setters: ${[...by].join(', ')})`,
        );
      }
    }
  }

  // 3) identity data only from, or after, sign-in.
  if (opts.identityVars?.length && opts.authFlagVar) {
    // Node level: a node that sets an identity var must not be reachable before the sign-in gate.
    const tiers = nodeTiers(flows, entries, opts.authFlagVar);
    if (tiers.gates.size === 0) {
      problems.push(`identity check: no node sets the sign-in flag "${opts.authFlagVar}" (authFlagVar)`);
    } else {
      for (const f of flows) {
        for (const [k, raw] of Object.entries(f.nodes ?? {})) {
          const n = raw as GNode;
          const key = `${f.flowId}#${n.nodeId ?? k}`;
          if (!tiers.pre.has(key)) continue;
          for (const v of opts.identityVars) {
            const sets = (n.metadata?.stateModifications ?? []).some((m) => m.type === 'context' && m.name === v && m.modification === 'set');
            if (sets) {
              const label = (n.metadata as { name?: string } | undefined)?.name ?? n.nodeId ?? k;
              problems.push(`flow "${f.flowId}" node "${label}" sets identity var "${v}" before sign-in (it is reachable ` +
                `without passing the node that sets "${opts.authFlagVar}"). Identity/account data must come only from the verify response.`);
            }
          }
        }
      }
    }
  } else if (opts.identityVars?.length) {
    if (!opts.authFlowId || !ids.has(opts.authFlowId)) {
      problems.push(`identity check: authFlowId "${opts.authFlowId ?? ''}" is not in the flow set`);
    } else {
      const auth = new Set([opts.authFlowId]);
      for (const [id, fx] of facts) {
        if (id === opts.authFlowId) continue;
        for (const v of opts.identityVars) {
          if (!fx.sets.has(v)) continue;
          const path = reachableAvoiding(graph, entries, id, auth);
          if (path) {
            problems.push(
              `flow "${id}" sets identity var "${v}" but is reachable before auth (${opts.authFlowId}) has run ` +
              `(path: ${path.join(' -> ')}). Identity/account data must come only from the verify response.`,
            );
          }
        }
      }
    }
  }

  // SINK ENFORCEMENT (opt-in): a declared terminal sink must (a) contain NO redirect node (never redirect
  // onward — the loop-prevention property and the DEFINING rule), and (b) contain at least one terminal node
  // (escalate OR terminate), so every path ends by terminating rather than dangling on a non-terminal node.
  // A sink MAY mix terminate + escalate (e.g. terminate on success, escalate on an error/capture-fail path) —
  // `variant` is an intent label, NOT a single-kind constraint. The per-flow edge-completeness / no-dangling
  // checks already guarantee no path dangles; here we enforce the sink-specific topology (no onward redirect).
  for (const sink of opts.sinks ?? []) {
    const flow = flows.find((f) => f.flowId === sink.flowId);
    if (!flow) { problems.push(`declared sink "${sink.flowId}" is not in the flow set.`); continue; }
    const types = (Object.values(flow.nodes ?? {}) as Array<{ type?: string }>).map((n) => n.type);
    // (a) loop-prevention: a sink MUST NOT redirect onward to another flow.
    if (types.includes('redirect')) {
      problems.push(
        `sink "${sink.flowId}" contains a redirect node — a terminal sink MUST NOT redirect onward to another ` +
        `flow (loop-prevention). Converge every path on a terminal node (escalate or terminate) instead.`,
      );
    }
    // (b) every path must END in a terminal: the flow must contain at least one escalate or terminate node.
    //     (The per-flow edge-completeness check already guarantees no path dangles; this ensures the sink
    //     actually terminates rather than, say, ending on a basic node with nowhere to go.)
    if (!types.includes('escalate') && !types.includes('terminate')) {
      problems.push(
        `sink "${sink.flowId}" has no terminal node — a sink must end every path on an escalate or terminate ` +
        `node. (A sink may mix the two: e.g. terminate on success, escalate on an error/capture-fail path.)`,
      );
    }
    // Note: a sink MAY contain BOTH escalate and terminate (mixed terminals are valid). `variant` is an intent
    // label only and is intentionally NOT enforced as a single-kind constraint.
  }
  return problems;
}
