// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// LAYER: FLOW-DSL BUILDER — assembles factory nodes into a FlowDoc, wires exit handles, and enforces
// EDGE-COMPLETENESS before emit. The completeness check turns the "disconnected edge → Fallback" anti-pattern
// into a build-time error: emit() refuses while any node has an unwired exit handle (unless that handle was
// explicitly marked terminal via .exitApplication()/.terminate()).
//
// The builder PRODUCES the verified console wire format (top-level flowId + aiDescription + slots[] + the
// multilingual envelope + nodes{}). It is the authoring surface; the engine's create-flows.ts consumes it.
//
// redirect + escalate nodes return ZERO author-wireable exits (they are one-way / terminal). The builder
// emits their internal single { node_status eq 'continuation' } child edge automatically at assemble time.

import { type FlowNode, type NodeResult, type ChildNode, ExitHandle, uuid } from './core';
import { terminateNode } from './nodes';

export interface AttachedSlot { name: string; type: string; examples: string[]; sensitive: boolean; aiDescription: string; }

export interface FlowDoc {
  flowId: string;
  nodes: Record<string, FlowNode>;
  aiDescription: string;
  untrained: boolean;
  slots: AttachedSlot[];
  type: 'multilingual';
  masterLanguageCode: string;
  languageCodes: string[];
  mirroring: 'none';
}

/** Anything a factory returns, optionally carrying a slot to auto-attach (userChoice does). */
type Registrable = NodeResult & { attachSlot?: { name: string; type: string; examples?: string[]; sensitive?: boolean } };

// Node types that carry an internal { node_status eq 'continuation' } child edge and no author-wireable exits.
const CONTINUATION_NODES = new Set<FlowNode['type']>(['redirect', 'escalate']);

function continuationEdge(): ChildNode {
  return { name: '', conditions: [{ left: { type: 'node_status' }, operator: 'eq', right: { type: 'constant', value: 'continuation' } }] };
}

// Per-type node heights (approximate; matches the console's rendered card sizes closely enough for a tidy
// left-to-right layout). Width is always 240. The importer accepts any coordinates; these just avoid an
// all-at-origin pile-up so the canvas is readable. NOTE: user_choice and generative_journey render DYNAMICALLY
// taller as they gain exit paths — their values here carry headroom for ~3-4 exits (the common case). The
// vertical layout (assignCanvas) pitches siblings by THESE heights + a margin, so a taller type automatically
// claims more room; no per-type spacing rule is needed.
const NODE_HEIGHT: Partial<Record<FlowNode['type'], number>> = {
  start: 213, basic: 197, user_choice: 300, split: 143, redirect: 127,
  data_request: 237, define: 177, generative_journey: 360, generative_text: 234,
  knowledge_base: 234, escalate: 199, terminate: 84,
};
// Vertical margin between stacked siblings in a depth column (added to each node's own height).
const Y_MARGIN = 60;

/** Assign canvasMetadata to every node via a BFS from start over wired edges: x by depth (320 apart),
 *  y stacked HEIGHT-AWARE for multiple children (each sibling pitched by its own NODE_HEIGHT + Y_MARGIN,
 *  column centred on 0) so variable-height cards (user_choice, generative_journey) never overlap. Purely
 *  cosmetic — the importer needs the field present (every working export carries it) but does not require
 *  specific coordinates. */
function assignCanvas(nodes: Record<string, FlowNode>, startId: string): void {
  const depth = new Map<string, number>();
  const order: string[] = [];
  const queue: Array<{ id: string; d: number }> = [{ id: startId, d: 0 }];
  const seen = new Set<string>();
  while (queue.length) {
    const { id, d } = queue.shift()!;
    if (seen.has(id)) { if (d > (depth.get(id) ?? 0)) depth.set(id, d); continue; }
    seen.add(id); depth.set(id, d); order.push(id);
    const node = nodes[id];
    if (!node) continue;
    for (const c of node.childNodes) {
      if (c.nodeId && !seen.has(c.nodeId)) queue.push({ id: c.nodeId, d: d + 1 });
    }
  }
  // Exit nodes (redirect, escalate, terminate): the flow has at most ONE of each kind per target (merged in emit),
  // and all of them sit in a single column at the far right of the canvas, below nothing else.
  const EXIT_TYPES = new Set(['redirect', 'escalate', 'terminate']);
  const isExit = (id: string) => EXIT_TYPES.has(String(nodes[id]?.type));
  let maxDepth = 0;
  for (const id of order) if (!isExit(id)) maxDepth = Math.max(maxDepth, depth.get(id) ?? 0);
  for (const id of order) if (isExit(id)) depth.set(id, maxDepth + 1);
  // group nodes by depth to fan out y
  const byDepth = new Map<number, string[]>();
  for (const id of order) {
    const d = depth.get(id) ?? 0;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(id);
  }
  for (const [d, unsorted] of byDepth) {
    const ids = [...unsorted.filter((id) => !isExit(id)), ...unsorted.filter(isExit)];   // exits at the bottom
    // Height-aware vertical stacking: pitch each sibling by its OWN height + Y_MARGIN (cumulative), then
    // centre the whole column on y=0. Replaces the old fixed ±200 pitch, which overlapped whenever a card was
    // taller than 200 (user_choice 300, generative_journey 360). No per-type branching: taller types simply
    // take more room because their NODE_HEIGHT is larger. Single-child columns stay centred at y=0.
    const heights = ids.map((id) => NODE_HEIGHT[nodes[id]?.type as FlowNode['type']] ?? 200);
    const totalH = heights.reduce((a, h) => a + h, 0) + Y_MARGIN * (ids.length - 1);
    let cursorY = -totalH / 2;
    ids.forEach((id, i) => {
      const node = nodes[id];
      if (!node) return;
      const h = heights[i];
      node.canvasMetadata = {
        x: d * 320, y: Math.round(cursorY),
        width: 240, height: h, isMinimized: false,
      };
      cursorY += h + Y_MARGIN;
    });
  }
  // any node not reached by BFS (shouldn't happen post edge-completeness) gets a fallback slot
  let orphanX = 0;
  for (const [id, node] of Object.entries(nodes)) {
    if (!node.canvasMetadata) {
      node.canvasMetadata = { x: orphanX, y: 600, width: 240, height: NODE_HEIGHT[node.type] ?? 200, isMinimized: false };
      orphanX += 320;
    }
  }
}

export class FlowBuilder {
  private readonly registered: Registrable[] = [];
  private readonly slotMap = new Map<string, AttachedSlot>();
  private startResult: NodeResult | null = null;

  constructor(
    private readonly flowId: string,
    private readonly aiDescription: string,
    private readonly opts: { masterLanguageCode?: string; languageCodes?: string[] } = {},
  ) {}

  /** Register a node built by a factory. Returns the same NodeResult for fluent wiring. Auto-attaches any
   *  slot the node references (userChoice.attachSlot) into the flow's slots[]. */
  add<T extends NodeResult>(node: T): T {
    const r = node as Registrable;
    this.registered.push(r);
    if (r.attachSlot) {
      if (!this.slotMap.has(r.attachSlot.name)) {
        this.slotMap.set(r.attachSlot.name, {
          name: r.attachSlot.name, type: r.attachSlot.type,
          examples: r.attachSlot.examples ?? [], sensitive: r.attachSlot.sensitive ?? false, aiDescription: '',
        });
      }
    }
    if (node.node.type === 'start') this.startResult = node;
    return node;
  }

  /** Explicitly attach a slot not introduced by a userChoice node. */
  attachSlot(slot: { name: string; type: string; examples?: string[]; sensitive?: boolean; aiDescription?: string }): this {
    if (!this.slotMap.has(slot.name)) {
      this.slotMap.set(slot.name, {
        name: slot.name, type: slot.type, examples: slot.examples ?? [],
        sensitive: slot.sensitive ?? false, aiDescription: slot.aiDescription ?? '',
      });
    }
    return this;
  }

  /** Assemble + validate + emit the FlowDoc. Throws (with ALL problems) if any exit handle is unwired. */
  emit(): FlowDoc {
    if (this.registered.length === 0) throw new Error(`flow "${this.flowId}": no nodes registered`);
    if (!this.startResult) throw new Error(`flow "${this.flowId}": no start node — add(startNode())`);

    // data_request `in_progress` MUST be left disconnected for this release (async is out of
    // scope; wiring it is what the SDK silently collapses). The author leaves it unwired; here we auto-terminate
    // it (emit a dangling edge, no target) so it does NOT trip the edge-completeness check — and we FAIL if an
    // author wired it to a target. This is the SINGLE exception to "every exit is wired"; it is scoped to
    // data_request/in_progress only.
    const wiredInProgress: string[] = [];
    for (const r of this.registered) {
      if (r.node.type !== 'data_request') continue;
      for (const h of r.exits) {
        if (h.label !== 'in_progress') continue;
        if (h.isWired()) {
          const nm = r.node.metadata?.name ?? r.node.type;
          wiredInProgress.push(`node "${nm}" (data_request) exit "in_progress" is wired to a target — it MUST be ` +
            `left disconnected (async operations are out of scope this release; the SDK collapses a wired ` +
            `in_progress onto the success target). Remove its .to(...) wiring.`);
        } else {
          h.terminate();   // dangling edge, no target — satisfies edge-completeness without a destination
        }
      }
    }
    if (wiredInProgress.length) {
      throw new Error(
        `flow "${this.flowId}" has ${wiredInProgress.length} data_request in_progress exit(s) wired to a target:\n  • ` +
        wiredInProgress.join('\n  • '),
      );
    }

    // EDGE-COMPLETENESS: every exit handle on every node must be wired or explicitly terminal.
    // (redirect/escalate have zero handles by design — their continuation edge is emitted internally.)
    const unwired: string[] = [];
    for (const r of this.registered) {
      for (const h of r.exits) {
        if (!h.isWired()) {
          const nm = r.node.metadata?.name ?? r.node.type;
          unwired.push(`node "${nm}" (${r.node.type}) exit "${h.label}" is unwired — wire it with ` +
            `.to(target), or mark it terminal with .exitApplication()/.terminate()`);
        }
      }
    }
    if (unwired.length) {
      throw new Error(
        `flow "${this.flowId}" has ${unwired.length} unwired exit(s) — every exit must reach a handler or an ` +
        `explicit terminal (this is what prevents a silent route to the app Fallback):\n  • ` +
        unwired.join('\n  • '),
      );
    }

    // TERMINAL WIRING (CONSOLE-VERIFIED): an "Exit Application" terminal is a dedicated
    // type:"terminate" node that the terminal edge points INTO — NOT a dangling no-nodeId edge (ACXD canvas
    // validation rejects a dangling edge as a disconnected node). So if ANY exit is terminal, inject ONE shared
    // terminate node for this flow and retarget every terminal exit onto it. (Prior to this, .terminate()/
    // next:"terminate" emitted the dangling shape — the regression that broke billingCallback/billingOutcome.)
    // Exclude data_request `in_progress`: it is deliberately left as a dangling terminal (must be
    // DISCONNECTED, not pointed at a terminate node) — see the in_progress block above.
    const terminalHandles = this.registered.flatMap((r) => r.exits.filter((h) => h.isTerminal() && h.label !== 'in_progress'));
    if (terminalHandles.length > 0) {
      const term = terminateNode({ name: '' });
      this.registered.push(term as Registrable);   // terminateNode() returns a full NodeResult (exits: [])
      for (const h of terminalHandles) h.retargetTerminal(term.node.nodeId);
    }

    // Render each node's wired handles into childNodes edges. redirect/escalate get the internal continuation
    // edge; terminate (Exit Application) has zero exits so its childNodes stays [] (CONSOLE-VERIFIED).
    const nodes: Record<string, FlowNode> = {};
    for (const r of this.registered) {
      if (CONTINUATION_NODES.has(r.node.type)) {
        r.node.childNodes = [continuationEdge()];
      } else {
        r.node.childNodes = r.exits.flatMap((h: ExitHandle) => h.toChildNodes());
      }
      nodes[r.node.nodeId] = r.node;
    }

    mergeExitNodes(nodes);

    // REGRESSION GUARD (canvas-validation parity): after rendering, no node may carry a childNode edge that has
    // NO nodeId unless it is a legitimate dangling case — the redirect/escalate internal continuation edge, or a
    // data_request `in_progress`. A terminal must point INTO a type:"terminate" node (injected above), never a
    // bare dangling edge. This catches the billingCallback/billingOutcome regression at emit time (ACXD canvas
    // validation would otherwise reject it as a disconnected node only AFTER a 3-hour PoC deploy).
    const danglers: string[] = [];
    for (const n of Object.values(nodes)) {
      if (n.type === 'redirect' || n.type === 'escalate' || n.type === 'terminate') continue;
      for (const edge of n.childNodes ?? []) {
        const isInProgress = n.type === 'data_request' &&
          (edge.conditions ?? []).some((c: any) => c?.left?.type === 'node_status' && c?.right?.value === 'in_progress');
        if (!edge.nodeId && !isInProgress) {
          danglers.push(`node "${n.metadata?.name ?? n.nodeId}" (${n.type}) has a childNode edge with no target ` +
            `nodeId — a terminal must point into a type:"terminate" node, not dangle.`);
        }
      }
    }
    if (danglers.length) {
      throw new Error(
        `flow "${this.flowId}" has ${danglers.length} dangling non-terminal edge(s) that ACXD canvas validation ` +
        `will reject:\n  • ` + danglers.join('\n  • '),
      );
    }

    assignCanvas(nodes, this.startResult.node.nodeId);

    return {
      flowId: this.flowId,
      nodes,
      aiDescription: this.aiDescription,
      untrained: true,
      slots: [...this.slotMap.values()],
      type: 'multilingual',
      masterLanguageCode: this.opts.masterLanguageCode ?? 'en-US',
      languageCodes: this.opts.languageCodes ?? ['en-US'],
      mirroring: 'none',
    };
  }
}

/** ONE exit node per kind and target: every redirect to the same flow, every escalate, and every terminate in a flow
 *  is merged into a single shared node that all uses connect to. A redirect or escalate that carried state
 *  modifications (e.g. setting escalationReason) keeps its id and becomes a basic node holding those
 *  modifications, with one edge into the shared exit, so each path still sets its own values. */
function mergeExitNodes(nodes: Record<string, FlowNode>): void {
  const keyOf = (n: FlowNode): string | undefined => {
    if (n.type === 'escalate' || n.type === 'terminate') return n.type;
    if (n.type === 'redirect') {
      const r = (n.metadata as { redirect?: { id?: string; flowId?: string; intentId?: string } }).redirect ?? {};
      return `redirect:${r.id ?? r.flowId ?? r.intentId ?? ''}`;
    }
    return undefined;
  };
  const groups = new Map<string, FlowNode[]>();
  for (const n of Object.values(nodes)) {
    const k = keyOf(n);
    if (k) { if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(n); }
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // the shared exit: the first node with no state modifications, else a fresh copy of the first
    const plain = group.find((n) => !(n.metadata.stateModifications ?? []).length);
    const keep: FlowNode = plain ?? {
      ...JSON.parse(JSON.stringify(group[0])),
      nodeId: uuid(),
      metadata: { ...JSON.parse(JSON.stringify(group[0].metadata)), name: group[0].metadata.name ?? '', stateModifications: [] },
    };
    if (!plain) nodes[keep.nodeId] = keep;
    for (const n of group) {
      if (n === keep) continue;
      const mods = n.metadata.stateModifications ?? [];
      if (mods.length) {
        // keep the node (and every edge into it); it now sets its values and continues into the shared exit
        const label = mods.map((m: { name?: string; value?: { value?: unknown } }) =>
          `${m.name ?? ''}${m.value?.value !== undefined ? ` ${String(m.value.value)}` : ''}`).join(', ');
        nodes[n.nodeId] = {
          nodeId: n.nodeId, type: 'basic', messages: n.messages ?? [], modalities: {},
          metadata: { name: n.metadata.name || `Set ${label}`, stateModifications: mods },
          childNodes: [{ name: '', conditions: [], nodeId: keep.nodeId }],
        } as FlowNode;
      } else {
        // no values to set: point every edge at the shared exit and drop the duplicate
        for (const p of Object.values(nodes)) for (const c of p.childNodes ?? []) if (c.nodeId === n.nodeId) c.nodeId = keep.nodeId;
        delete nodes[n.nodeId];
      }
    }
  }
}

/** Convenience constructor. */
export function flow(flowId: string, aiDescription: string, opts?: { masterLanguageCode?: string; languageCodes?: string[] }): FlowBuilder {
  return new FlowBuilder(flowId, aiDescription, opts);
}
