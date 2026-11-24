// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Deterministic flow-reference validator — runs BEFORE CreateFlowCommand, fails loudly on a dangling
// LAYER: SUPPORT — author-time flow-reference validator (fails loudly before CreateFlow).
// reference so the operator gets an actionable authoring error instead of a post-deploy ACXD console
// notification ("... references the xxPin slot, but that slot is not attached to the flow").
//
// It cross-checks every reference a flow makes against what actually satisfies it:
//   - slot            → must be listed in the flow's own `slots[]` (that IS "attaching" it)
//   - context var     → must exist in resources/context-vars.json
//   - local           → must be produced by a `define` (or generative_text / KB / loop) node in THIS flow
//   - data-request    → node `dataRequests[].dataRequestId` (or legacy variableId) must exist in
//                        resources/data-requests.json,
//                        and a `{X.field:NLX.Variable}` reference must have a data_request node for X
//   - system/constant → never validated (built-in / literal)
//
// Reference detection is by the flow's own typed operands + state modifications + `user_choice.slotId` +
// `data_request` bindings, PLUS the `{name:NLX.<Kind>}` text tokens, where <Kind> disambiguates:
//   NLX.Context → context, NLX.Local → local, NLX.Variable → data-request field, NLX.System → system,
//   anything else (NLX.AlphaNumeric / NLX.Number / NLX.Date / a custom slot type) → slot.
// This is the slot-vs-context distinction the validated example flows proved (a `{customerId:NLX.Context}`
// token is a context var, not the `CustomerID` slot).

export interface FlowRefVocabulary {
  contextVarNames: Set<string>;   // from resources/context-vars.json (field: name)
  slotTypeNames: Set<string>;     // from resources/slot-types.json (field: slotTypeId) — custom slot TYPES
  dataRequestIds: Set<string>;    // from resources/data-requests.json (field: dataRequestId)
  numericVarNames: Set<string>;   // context vars whose schemaType is number/boolean (strict Set-value typing)
  // dataRequestId -> its URL {placeholder} names (secrets excluded) and its requestSchema top-level required /
  // declared property names. Used by checks 16-17 to confirm every value a node sends has somewhere to land.
  dataRequestContracts: Map<string, { urlParams: Set<string>; bodyFields: Set<string>; requiredBody: Set<string> }>;
  // Check 18: context var name -> declared schemaType (default string), and dataRequestId -> responseSchema
  // top-level property name -> JSON Schema type. Optional so hand-built vocabularies (tests) still compile.
  contextVarTypes?: Map<string, string>;
  dataRequestResponseTypes?: Map<string, Map<string, string>>;
  // Check 22: analytics tag names from resources/analytics-tags.json (field: name). Optional for hand-built vocabularies.
  analyticsTagNames?: Set<string>;
  // Check 25: dataRequestId -> requestSchema top-level property -> JSON Schema type.
  dataRequestBodyTypes?: Map<string, Map<string, string>>;
  // Check 26: custom slot type id -> the value ids it declares (deriveValueId of each value).
  slotTypeValueIds?: Map<string, Set<string>>;
}

/** Every analytics tag label a flow's nodes use that is not a defined tag (check 22). Shared with the FlowSpec build. */
export function undefinedAnalyticsTags(flow: Record<string, unknown>, tagNames: Set<string>): Array<{ node: string; tag: string }> {
  const out: Array<{ node: string; tag: string }> = [];
  for (const node of Object.values((flow.nodes ?? {}) as Record<string, { metadata?: { name?: string; tags?: Array<{ label?: string }> } }>)) {
    for (const t of node?.metadata?.tags ?? []) {
      if (typeof t?.label === 'string' && !tagNames.has(t.label)) out.push({ node: node?.metadata?.name ?? '?', tag: t.label });
    }
  }
  return out;
}

// Built-in NLX kinds that are never validated as authored resources.
const BUILTIN_KINDS = new Set(['System']);

/** Build the reference vocabulary from the already-loaded resource arrays. Tolerant of missing files. */
export function buildVocabulary(
  contextVars: Array<{ name?: string; schemaType?: string }> = [],
  slotTypes: Array<{ slotTypeId?: string; values?: Array<{ value?: string } | string> }> = [],
  dataRequests: Array<{ dataRequestId?: string; url?: string; method?: string; requestSchema?: unknown; responseSchema?: unknown }> = [],
  analyticsTags?: Array<{ name?: string }>,
): FlowRefVocabulary {
  const numeric = new Set(
    (contextVars ?? [])
      .filter((c) => c?.schemaType === 'number' || c?.schemaType === 'boolean')
      .map((c) => c?.name)
      .filter(Boolean) as string[],
  );
  return {
    contextVarNames: new Set((contextVars ?? []).map((c) => c?.name).filter(Boolean) as string[]),
    slotTypeNames: new Set((slotTypes ?? []).map((s) => s?.slotTypeId).filter(Boolean) as string[]),
    dataRequestIds: new Set((dataRequests ?? []).map((d) => d?.dataRequestId).filter(Boolean) as string[]),
    numericVarNames: numeric,
    dataRequestContracts: buildContracts(dataRequests ?? []),
    contextVarTypes: new Map(
      (contextVars ?? []).filter((c) => c?.name).map((c) => [c.name as string, c.schemaType ?? 'string']),
    ),
    dataRequestResponseTypes: buildResponseTypes(dataRequests ?? []),
    dataRequestBodyTypes: buildResponseTypes((dataRequests ?? []).map((d) => ({ dataRequestId: d?.dataRequestId, responseSchema: d?.requestSchema }))),
    slotTypeValueIds: new Map((slotTypes ?? []).filter((s) => s?.slotTypeId).map((s) => [s.slotTypeId as string,
      new Set((s.values ?? []).map((v) => (typeof v === 'string' ? v : v?.value)).filter(Boolean)
        .map((v) => deriveValueIdLocal(s.slotTypeId as string, v as string)))])),
    ...(analyticsTags ? { analyticsTagNames: new Set(analyticsTags.map((t) => t?.name).filter(Boolean) as string[]) } : {}),
  };
}

// Same rule as flow-dsl deriveValueId (slot type id + PascalCase value); kept local so this module has no DSL import.
function deriveValueIdLocal(slotTypeId: string, value: string): string {
  return slotTypeId + value.split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

// dataRequestId -> top-level responseSchema property -> JSON Schema type (string/number/integer/boolean/array/object).
function buildResponseTypes(
  defs: Array<{ dataRequestId?: string; responseSchema?: unknown }>,
): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const d of defs) {
    if (!d?.dataRequestId) continue;
    const props = ((d.responseSchema ?? {}) as { properties?: Record<string, { type?: unknown }> }).properties ?? {};
    const m = new Map<string, string>();
    for (const [k, v] of Object.entries(props)) {
      const t = Array.isArray(v?.type) ? v.type.find((x) => x !== 'null') : v?.type;
      if (typeof t === 'string') m.set(k, t);
    }
    out.set(d.dataRequestId, m);
  }
  return out;
}

function buildContracts(
  defs: Array<{ dataRequestId?: string; url?: string; requestSchema?: unknown }>,
): Map<string, { urlParams: Set<string>; bodyFields: Set<string>; requiredBody: Set<string> }> {
  const out = new Map<string, { urlParams: Set<string>; bodyFields: Set<string>; requiredBody: Set<string> }>();
  for (const d of defs) {
    if (!d?.dataRequestId) continue;
    const urlParams = new Set<string>();
    // {param} placeholders; a {name:NLX.Secret} token is a secret, not a node-supplied param.
    for (const m of String(d.url ?? '').matchAll(/\{([A-Za-z0-9_]+)(:[A-Za-z.]+)?\}/g)) {
      if (m[2]) continue;
      urlParams.add(m[1]);
    }
    const schema = (d.requestSchema ?? {}) as { properties?: Record<string, unknown>; required?: unknown };
    const bodyFields = new Set<string>(Object.keys(schema.properties ?? {}));
    const requiredBody = new Set<string>(Array.isArray(schema.required) ? (schema.required as string[]) : []);
    out.set(d.dataRequestId, { urlParams, bodyFields, requiredBody });
  }
  return out;
}

interface Refs {
  slots: Set<string>;      // slot NAMES referenced
  contexts: Set<string>;   // context var names referenced
  locals: Set<string>;     // local names referenced
  drFields: Set<string>;   // data-request ids referenced via {X.field} / type:variable X.field
  slotTokenTypes: Array<{ name: string; typeId: string }>;   // custom-type slot tokens {name:typeId}
}

function emptyRefs(): Refs {
  return { slots: new Set(), contexts: new Set(), locals: new Set(), drFields: new Set(), slotTokenTypes: [] };
}

// Walk any nested object/array, invoking cb on every plain object.
function walk(node: unknown, cb: (o: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    for (const n of node) walk(n, cb);
  } else if (node && typeof node === 'object') {
    cb(node as Record<string, unknown>);
    for (const v of Object.values(node as Record<string, unknown>)) walk(v, cb);
  }
}

// Collect every {name:NLX.Kind} token from any string value in the flow.
function collectTokens(flow: unknown, refs: Refs, slotTypeNames: Set<string> = new Set()): void {
  const json = JSON.stringify(flow);
  const re = /\{([A-Za-z0-9_.]+):NLX\.([A-Za-z]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(json)) !== null) {
    const [, name, kind] = m;
    if (kind === 'Context') refs.contexts.add(name);
    else if (kind === 'Local') refs.locals.add(name);
    else if (kind === 'Variable') refs.drFields.add(name.split('.')[0]); // X.field → X
    else if (BUILTIN_KINDS.has(kind)) { /* system — ignore */ }
    else refs.slots.add(name); // AlphaNumeric / Number / Date / custom slot type → slot
  }
  // ALSO catch the NON-NLX slot token form `{slotName:slotTypeId}` (e.g. `{confirmChoice:xxYesNo}` in a
  // data_request payload/urlParams). This is a slot reference where the second part is a CUSTOM slot type id
  // (xx-prefixed), NOT an NLX kind. Without this, a slot used only inside a payload token slips the
  // slot-attach check (check #6 only inspects user_choice.slotId). The slot NAME is the ref; the slot-attach
  // check then verifies it is listed in the flow's slots[]. We match `:xx...` to avoid colliding with the
  // NLX form above (already consumed) and with `{slotType:value}` value ids (right side lower-case value).
  // Any declared custom slot type id counts (e.g. `{productLine:productLineType}`), plus the legacy xx-prefixed form.
  const slotRe = /\{([A-Za-z][A-Za-z0-9_]*):([A-Za-z][A-Za-z0-9_]*)\}/g;
  while ((m = slotRe.exec(json)) !== null) {
    const [, name, typeId] = m;
    if (slotTypeNames.has(typeId) || /^xx[A-Za-z0-9_]+$/.test(typeId)) {
      refs.slots.add(name); // the slot NAME (left of the colon)
      refs.slotTokenTypes.push({ name, typeId });
    }
  }
}

// Collect typed operands, state modifications, user_choice.slotId, and data_request variableIds.
function collectTyped(flow: Record<string, unknown>, refs: Refs, declaredDrIds: Set<string>): void {
  walk(flow, (o) => {
    // typed operand or state-mod: { type: "slot"|"context"|"local"|"variable", name: "..." }
    const type = o['type'];
    const name = o['name'];
    if (typeof type === 'string' && typeof name === 'string' && name) {
      if (type === 'slot' || type === 'slot_value_id') refs.slots.add(name);
      else if (type === 'context') refs.contexts.add(name);
      else if (type === 'local') refs.locals.add(name);
      else if (type === 'variable') refs.drFields.add(name.split('.')[0]); // data-request field X.field → X
      // fieldRef produces {type:'field', name:'drId.field'} — used by buildAuthVerify + cross-flow
      // reads via setContext(x, fieldRef('drId.field')). Previously NOT collected here, so a fieldRef to a
      // missing/typo'd data request passed validation silently and only failed at deploy/runtime. Collect it too.
      else if (type === 'field') refs.drFields.add(name.split('.')[0]); // data-request field (state-mod read) X.field → X
    }
    // user_choice capture: metadata.choice.slotId
    const choice = o['choice'] as Record<string, unknown> | undefined;
    if (choice && typeof choice['slotId'] === 'string' && choice['slotId']) {
      refs.slots.add(choice['slotId'] as string);
    }
    // data_request node binding: dataRequests[].variableId
    const drs = o['dataRequests'];
    if (Array.isArray(drs)) {
      for (const dr of drs) {
        if (dr && typeof dr === 'object') {
          // The NodeDataRequest binding field is `dataRequestId`; older authoring may carry it as
          // `variableId` (the engine backfills dataRequestId from it). Accept either so the reference is
          // detected regardless of which field the author used.
          const rec = dr as Record<string, unknown>;
          const id = rec['dataRequestId'] ?? rec['variableId'];
          if (typeof id === 'string' && id) declaredDrIds.add(id);
        }
      }
    }
  });
}

// Collect what THIS flow itself provides: declared slots[], define-node names, generative/local outputs.
function collectProvided(flow: Record<string, unknown>): { slots: Set<string>; locals: Set<string> } {
  const slots = new Set<string>();
  const locals = new Set<string>();
  const slotArr = flow['slots'];
  if (Array.isArray(slotArr)) {
    for (const s of slotArr) {
      const n = (s as Record<string, unknown>)?.['name'];
      if (typeof n === 'string' && n) slots.add(n);
    }
  }
  // A local can be produced by any of these node config blocks — each names its output in its own `name`
  // field (VERIFIED against the validated example flows: generativeText.name = "wrapUp"/"handoffSummary",
  // loop.name = "recover"), plus the older metadata.nodePayload form for generative_text. Detect them all so
  // a legitimately-produced local (e.g. an agentic Journey / generative-text output) is never false-flagged.
  const PRODUCER_BLOCKS = ['define', 'generativeText', 'generativeJourney', 'loop', 'knowledgeBase'];
  walk(flow, (o) => {
    for (const key of PRODUCER_BLOCKS) {
      const block = o[key] as Record<string, unknown> | undefined;
      if (block && typeof block['name'] === 'string' && block['name']) locals.add(block['name'] as string);
    }
    // legacy generative_text output naming
    const np = o['nodePayload'];
    if (typeof np === 'string' && np) locals.add(np);
  });
  return { slots, locals };
}

/** Data requests a Generative Journey node references in its prompt ({X.field:NLX.Variable}) and those attached
 *  to it as tools. Used by checks 5 and 24. */
function journeyDrRefs(node: { type?: string; metadata?: Record<string, any> }): { refs: Set<string>; tools: Set<string> } {
  const refs = new Set<string>();
  const tools = new Set<string>();
  if (node?.type !== 'generative_journey') return { refs, tools };
  const gj = node.metadata?.generativeJourney ?? {};
  for (const m of String(gj.prompt ?? '').matchAll(/\{([A-Za-z0-9_]+)\.[A-Za-z0-9_.]+:NLX\.Variable\}/g)) refs.add(m[1]);
  for (const t of (Array.isArray(gj.tools) ? gj.tools : [])) {
    const id = t?.dataRequest?.dataRequestId ?? t?.dataRequest?.variableId;
    if (t?.type === 'dataRequest' && typeof id === 'string' && id) tools.add(id);
  }
  return { refs, tools };
}

/**
 * Validate one flow against the resource vocabulary. Throws with an actionable, per-reference message
 * listing every unsatisfied reference. No-op (returns) when everything resolves.
 */
export function validateFlowRefs(
  flowId: string,
  flow: Record<string, unknown>,
  vocab: FlowRefVocabulary,
): void {
  const refs = emptyRefs();
  const declaredDrIds = new Set<string>();
  collectTokens(flow, refs, vocab.slotTypeNames);
  collectTyped(flow, refs, declaredDrIds);
  const provided = collectProvided(flow);

  const problems: string[] = [];

  // 24) A Generative Journey prompt that references a data request ({X.field:NLX.Variable}) must have X attached
  //     to that journey as a tool. [CONSOLE-VERIFIED] ACXD reports this only as an info message; treated as a failure.
  for (const node of Object.values((flow.nodes ?? {}) as Record<string, { type?: string; metadata?: Record<string, any> }>)) {
    const { refs: pr, tools } = journeyDrRefs(node);
    for (const x of pr) {
      if (!tools.has(x)) {
        problems.push(`Generative Journey "${node?.metadata?.name ?? '?'}" references data request "${x}" in its prompt ` +
          `but does not have it attached as a tool. Attach "${x}" to the journey's tools, or remove the reference.`);
      }
    }
  }

  // 23) A custom-type slot token {name:typeId} must name the type the slot is attached with.
  {
    const attachedType = new Map<string, string>();
    for (const sl of ((flow.slots ?? []) as Array<{ name?: string; type?: string }>)) {
      if (sl?.name && sl.type) attachedType.set(sl.name, sl.type);
    }
    for (const t of refs.slotTokenTypes) {
      const at = attachedType.get(t.name);
      if (at && at !== t.typeId) {
        problems.push(`token "{${t.name}:${t.typeId}}" names slot type "${t.typeId}", but slot "${t.name}" is attached ` +
          `with type "${at}" — use "{${t.name}:${at}}".`);
      }
    }
  }

  // 22) Every analytics tag a node uses must be defined in analytics-tags.json. [CONSOLE-VERIFIED] An undefined
  //     tag passes CreateFlow but fails the console build with "Unavailable reference ... analytics tags references
  //     <tag> ... no longer available".
  if (vocab.analyticsTagNames) {
    for (const u of undefinedAnalyticsTags(flow, vocab.analyticsTagNames)) {
      problems.push(`node "${u.node}" uses analytics tag "${u.tag}", which is not defined in analytics-tags.json — ` +
        `add it there (with its type and description) or remove the tag from the node.`);
    }
  }

  // 21) Variable names a node defines (Generative Text output, define local) must be legal: letters, digits and
  //     underscores, starting with a letter. [CONSOLE-VERIFIED] ACXD flags "Invalid variable name ... contains
  //     characters that cannot be used in a variable reference" (high severity, blocks the build).
  {
    const LEGAL = /^[A-Za-z][A-Za-z0-9_]*$/;
    for (const node of Object.values((flow.nodes ?? {}) as Record<string, { type?: string; metadata?: Record<string, any> }>)) {
      const md = node?.metadata ?? {};
      const label = md.name ? ` ("${md.name}")` : '';
      const defined: Array<[string, unknown]> = [];
      if (node?.type === 'generative_text') defined.push(['output variable', md.generativeText?.name]);
      if (node?.type === 'define') defined.push(['local', md.define?.name]);
      for (const [what, nm] of defined) {
        if (typeof nm === 'string' && !LEGAL.test(nm)) {
          problems.push(`a ${node.type} node${label} defines ${what} "${nm}", which is not a legal variable name ` +
            `(letters, digits and underscores only, starting with a letter). Use camelCase, e.g. "presentQuote".`);
        }
      }
    }
  }

  // 20) Every attached slot has a type, and it is a custom slot type or NLX.AlphaNumeric only. [CONSOLE-VERIFIED] ACXD deploys only
  //     NLX.AlphaNumeric of the built-in types; any other NLX.* type (e.g. NLX.FreeText) passes CreateFlow but fails
  //     the console build with "Unavailable reference ... slot ... is no longer available".
  for (const sl of ((flow.slots ?? []) as Array<{ name?: string; type?: string }>)) {
    if (typeof sl?.type !== 'string' || !sl.type.trim()) {
      problems.push(`slot "${sl?.name ?? '?'}" has no "type" — ACXD rejects it ("slots[n].type is required"). Set a ` +
        'custom slot type from slot-types.json, or "NLX.AlphaNumeric".');
      continue;
    }
    if (typeof sl?.type === 'string' && sl.type.startsWith('NLX.') && sl.type !== 'NLX.AlphaNumeric') {
      problems.push(
        `slot "${sl.name ?? '?'}" uses built-in type "${sl.type}", which ACXD does not provide (the build fails with ` +
        `"Unavailable reference"). Use "NLX.AlphaNumeric" for free text, or a custom slot type from slot-types.json.`,
      );
    }
  }

  // 1) Slots referenced must be attached (listed in this flow's slots[]).
  for (const s of refs.slots) {
    if (!provided.slots.has(s)) {
      problems.push(
        `slot "${s}" is referenced but not attached to the flow — add it to this flow's "slots[]" array ` +
        `(that is what attaches it).`,
      );
    }
  }
  // 2) Context vars referenced must exist as a created resource.
  for (const c of refs.contexts) {
    if (!vocab.contextVarNames.has(c)) {
      problems.push(
        `context variable "${c}" is referenced but is not defined in resources/context-vars.json — ` +
        `create it there (or correct the reference).`,
      );
    }
  }
  // 3) Locals referenced must be produced in THIS flow (define / generative_text / KB / loop output).
  for (const l of refs.locals) {
    if (!provided.locals.has(l)) {
      problems.push(
        `local variable "${l}" is referenced but is not defined in this flow — add a "define" node that ` +
        `declares it (or the generative_text/KB/loop node that produces it) before it is referenced.`,
      );
    }
  }
  // 4) Data-request node bindings must reference an existing data request.
  for (const vid of declaredDrIds) {
    if (!vocab.dataRequestIds.has(vid)) {
      problems.push(
        `data_request node binds variableId "${vid}" but no such data request exists in ` +
        `resources/data-requests.json — create it there (or correct the variableId).`,
      );
    }
  }
  // 4b) Each data_request node's dataRequests[] entry needs a bindable id. The NodeDataRequest binding field
  //     is `dataRequestId` (VERIFIED against the ACXD SDK model + example flow-template.js). Missing it →
  //     ACXD reports "data request must be filled in" (request not applied to the node). The engine backfills
  //     dataRequestId from dataRequestId ?? variableId ?? name, so we fail loudly only when NONE is present.
  //     `[VERIFIED]`
  {
    const nodes = (flow.nodes ?? {}) as Record<string, { type?: string; dataRequests?: Array<{ dataRequestId?: string; variableId?: string; name?: string }> }>;
    for (const node of Object.values(nodes)) {
      if (node?.type !== 'data_request') continue;
      if (!Array.isArray(node.dataRequests) || node.dataRequests.length === 0) {
        problems.push(
          `a data_request node has no dataRequests[] binding — add one with variableId (and name) referencing ` +
          `a data request in resources/data-requests.json.`,
        );
        continue;
      }
      for (const dr of node.dataRequests as Array<{ dataRequestId?: string; variableId?: string; name?: string }>) {
        const hasId = dr?.dataRequestId && dr.dataRequestId.trim() !== '';
        const hasVid = dr?.variableId && dr.variableId.trim() !== '';
        const hasName = dr?.name && dr.name.trim() !== '';
        // The engine backfills dataRequestId (the binding field) from dataRequestId ?? variableId ?? name,
        // so any one of them is enough to bind. Fail only when NONE is present (nothing to bind from).
        if (!hasId && !hasVid && !hasName) {
          problems.push(
            `a data_request node binding has no dataRequestId (nor variableId/name to derive it) — set ` +
            `dataRequestId to a data request in resources/data-requests.json.`,
          );
        }
      }
    }
  }
  // 5) {X.field:NLX.Variable} references must have a data_request node for X in THIS flow.
  // A journey prompt may reference a data request that is attached to that journey as a tool (check 24 covers
  // the unattached case), so those references do not need a data_request node.
  const promptOnlyViaTool = new Set<string>();
  {
    const nodes = Object.values((flow.nodes ?? {}) as Record<string, { type?: string; metadata?: Record<string, any> }>);
    const elsewhere = new Set<string>();
    for (const node of nodes) {
      if (node?.type === 'generative_journey') {
        const { refs: pr, tools } = journeyDrRefs(node);
        for (const x of pr) if (tools.has(x)) promptOnlyViaTool.add(x);
        const gj = node.metadata?.generativeJourney ?? {};
        const rest = JSON.stringify({ ...node, metadata: { ...node.metadata, generativeJourney: { ...gj, prompt: '' } } });
        for (const m of rest.matchAll(/\{([A-Za-z0-9_]+)\.[A-Za-z0-9_.]+:NLX\.Variable\}/g)) elsewhere.add(m[1]);
      } else {
        for (const m of JSON.stringify(node).matchAll(/\{([A-Za-z0-9_]+)\.[A-Za-z0-9_.]+:NLX\.Variable\}/g)) elsewhere.add(m[1]);
      }
    }
    for (const x of elsewhere) promptOnlyViaTool.delete(x);
  }
  for (const drf of refs.drFields) {
    if (!declaredDrIds.has(drf) && !promptOnlyViaTool.has(drf)) {
      problems.push(
        `data-request field reference "${drf}.*" is used, but this flow has no data_request node binding ` +
        `variableId "${drf}" — add the data_request node that calls it before referencing its fields.`,
      );
    }
  }
  // 6) user_choice slot capture must be bound to an attached slot. VERIFIED against deployed exports: voice
  //    capture uses source:"slot" with a BLANK slotId — the slot is attached via the flow's slots[] array, not
  //    via slotId. So a blank slotId is valid AS LONG AS the flow attaches at least one slot (that is what the
  //    capture binds to). Only a POPULATED slotId is cross-checked against slots[]. (associatedSlotIds may be
  //    empty — a working exported flow has it empty.) `[VERIFIED - deployed console exports]`
  {
    const nodes = (flow.nodes ?? {}) as Record<string, { type?: string; metadata?: Record<string, unknown> }>;
    for (const node of Object.values(nodes)) {
      if (node?.type !== 'user_choice') continue;
      const choice = (node.metadata?.choice ?? {}) as { source?: string; slotId?: string; associatedSlotIds?: string[] };
      if (choice.source !== 'slot') continue;
      const slotId = (choice.slotId ?? '').trim();
      if (slotId === '') {
        // Blank slotId is the verified voice-capture shape — valid as long as the flow attaches a slot.
        if (provided.slots.size === 0) {
          problems.push(
            `a user_choice node captures into a slot (source:"slot") but the flow attaches no slots — add the ` +
            `capture's slot to this flow's slots[] array (attachment is via slots[], not slotId).`,
          );
        }
      } else if (!provided.slots.has(slotId)) {
        problems.push(
          `a user_choice node captures into slot "${slotId}" but that slot is not attached — add it ` +
          `to this flow's slots[] array.`,
        );
      }
    }
  }

  // 7) user_choice value branches must reference a REAL deterministic valueId, not the old {slotType:value}
  //    placeholder. Slot value ids are set on the slot type at create time (deriveValueId), so a condition's
  //    constant_id must be a literal id (e.g. "xxYesNoYes"), never "{xxYesNo:yes}". The engine no longer
  //    resolves placeholders, so an unresolved one would deploy a dead branch. Fail loudly. `[VERIFIED]`
  {
    const nodes = (flow.nodes ?? {}) as Record<string, { type?: string; childNodes?: Array<{ conditions?: Array<{ right?: { type?: string; value?: unknown } }> }> }>;
    for (const node of Object.values(nodes)) {
      if (node?.type !== 'user_choice' || !Array.isArray(node.childNodes)) continue;
      for (const cn of node.childNodes) {
        for (const cond of cn.conditions ?? []) {
          const right = cond?.right;
          if (right?.type === 'constant_id' && typeof right.value === 'string' && /^\{.*:.*\}$/.test(right.value)) {
            problems.push(
              `a user_choice branch uses constant_id "${right.value}" — this is the OLD {slotType:value} ` +
              `placeholder form, which is no longer resolved. Use the deterministic valueId set at slot-type ` +
              `create time (e.g. "${'<slotTypeId><ValuePascalCase>'}", such as xxYesNoYes).`,
            );
          }
        }
      }
    }
  }

  // 8) State-modification type discipline (RC3 safety net). The engine auto-heals a `constant` wrapper that
  //    holds EXACTLY one {ref:NLX.Kind} token into a typed operand. Anything left as a `constant` string that
  //    targets a NUMBER/BOOLEAN context var will fail ACXD's create validation ("set modification has an
  //    incorrect type: expected number, but got string"). Fail loudly here with the fix, rather than at the
  //    opaque API error. (String-typed targets legitimately take a constant, so they are not flagged.)
  {
    const nodes = (flow.nodes ?? {}) as Record<string, { metadata?: { stateModifications?: Array<{ type?: string; name?: string; value?: { type?: string; value?: unknown } }> } }>;
    for (const node of Object.values(nodes)) {
      const mods = node?.metadata?.stateModifications;
      if (!Array.isArray(mods)) continue;
      for (const mod of mods) {
        if (mod?.type !== 'context' || !mod.name) continue;
        if (!vocab.numericVarNames.has(mod.name)) continue; // only number/boolean targets are strict
        const v = mod.value;
        // A constant holding a real number/boolean IS valid (console-verified: {type:"constant", value:0} sets a
        // number var). Only a constant holding a STRING fails ACXD ("expected number/boolean, but got string").
        if (v?.type === 'constant' && typeof v.value === 'string') {
          problems.push(
            `state modification sets number/boolean context var "${mod.name}" from a STRING constant ` +
            `(${JSON.stringify(v.value)}) — ACXD rejects this ("expected number/boolean, but got string"). Fix: ` +
            `set a typed constant directly, e.g. { type: "constant", value: 0 } or { type: "constant", value: true } ` +
            `(FlowSpec: { "set": "${mod.name}", "value": 0 }); or set from a typed reference (a data-request ` +
            `"var:" field, a context var or a local). Do not change the var or the API field to a string.`,
          );
        }
      }
    }
  }

  // 9) user_choice display format must be a valid ChoiceDisplayFormat. `[VERIFIED]` The SDK enum is a CLOSED
  //    set of exactly `default` | `dropdown`. A value the API rejects (e.g. "buttons") is NOT caught until
  //    mid-deploy (after the workspace, all resources, and earlier flows are already created), so fail loudly
  //    here. "default" = inline choice set (with showChoices:true); "dropdown" = dropdown picker.
  {
    const VALID_CHOICE_DISPLAY = new Set(['default', 'dropdown']);
    const nodes = (flow.nodes ?? {}) as Record<string, { type?: string; metadata?: { choice?: { choiceDisplayFormat?: string } } }>;
    for (const node of Object.values(nodes)) {
      if (node?.type !== 'user_choice') continue;
      const fmt = node.metadata?.choice?.choiceDisplayFormat;
      if (fmt !== undefined && !VALID_CHOICE_DISPLAY.has(fmt)) {
        problems.push(
          `a user_choice node has choiceDisplayFormat "${fmt}", which ACXD rejects — the only valid values ` +
          `are "default" (inline choice set) or "dropdown" (dropdown picker). Change it to one of those.`,
        );
      }
    }
  }

  // 10) Every user_choice must carry at least one message. `[CONSOLE-VERIFIED]` ACXD flags a user_choice with an
  //     empty messages:[] (showChoices true or false); with showChoices:true it also reports "resolved placeholder
  //     must be filled in". A basic node may have no message; a user_choice may not.
  {
    const nodes = (flow.nodes ?? {}) as Record<string, { type?: string; messages?: unknown[]; metadata?: { name?: string; choice?: { showChoices?: boolean } } }>;
    for (const node of Object.values(nodes)) {
      if (node?.type !== 'user_choice') continue;
      const msgs = node.messages;
      if (!Array.isArray(msgs) || msgs.length === 0) {
        const nm = node.metadata?.name ? ` ("${node.metadata.name}")` : '';
        problems.push(
          `a user_choice node${nm} has no message — add the ` +
          `eliciting question to its "messages" array, e.g. { "type": "text", "body": "Which option…?", ` +
          `"metadata": { "alternatePhrasings": [] } }. An empty messages:[] here fails with "needs at least ` +
          `one message set".`,
        );
      }
    }
  }

  // 11) A data_request PAYLOAD operand that targets a NUMBER/BOOLEAN backend field must be a TYPED operand,
  //     not a `constant`-wrapped token (a constant is a string → "payload.<field> has an incorrect type:
  //     expected number/boolean, but got string"). We can tell the operand SOURCES a number/boolean context
  //     var when its constant value is exactly one {ctxX:NLX.Context} token and ctxX is number/boolean-typed.
  //     `[VERIFIED]` (String payload fields may stay constant-wrapped — only number/boolean sources are strict.)
  {
    const TOKEN = /^\{([A-Za-z0-9_.]+):NLX\.Context\}$/;
    const nodes = (flow.nodes ?? {}) as Record<string, { type?: string; dataRequests?: Array<{ payload?: { value?: Record<string, { type?: string; value?: unknown }> } }> }>;
    for (const node of Object.values(nodes)) {
      if (node?.type !== 'data_request' || !Array.isArray(node.dataRequests)) continue;
      for (const dr of node.dataRequests) {
        const fields = dr?.payload?.value;
        if (!fields || typeof fields !== 'object') continue;
        for (const [fieldName, operand] of Object.entries(fields)) {
          if (operand?.type !== 'constant' || typeof operand.value !== 'string') continue;
          const m = TOKEN.exec(operand.value.trim());
          if (!m) continue;
          const ctxName = m[1];
          if (vocab.numericVarNames.has(ctxName)) {
            problems.push(
              `data_request payload field "${fieldName}" sources the number/boolean context var "${ctxName}" ` +
              `via a constant-wrapped token — ACXD rejects this ("payload.${fieldName} has an incorrect type: ` +
              `expected number/boolean, but got string"). Use a typed operand instead: ` +
              `{ "type": "context", "name": "${ctxName}" }.`,
            );
          }
        }
      }
    }
  }

  // 12) showChoices:true "resolved placeholder" guard. `[CONSOLE-VERIFIED]` A user_choice that shows choices
  //     (showChoices:true) but is CAPTURE-ONLY — empty idField/labelField AND no child edge that branches on a
  //     specific slot value (slot_value_id + constant_id) — triggers ACXD's "resolved placeholder must be filled
  //     in" console warning: the choice set has no resolved display source. Two valid fixes: (a) if the node is
  //     meant to PRESENT selectable choices, populate the choice display binding (idField/labelField, or branch
  //     per value with slot_value_id/constant_id so the values resolve); (b) if it is pure slot CAPTURE, set
  //     showChoices:false. We WARN (not hard-block) because the exact required binding is not fully pinned from
  //     ground truth — this flags the observed trigger so the author resolves it before the console warning.
  {
    const nodes = (flow.nodes ?? {}) as Record<string, { type?: string; childNodes?: Array<{ conditions?: Array<{ left?: { type?: string } }> }>; metadata?: { name?: string; choice?: { showChoices?: boolean; idField?: string; labelField?: string } } }>;
    for (const node of Object.values(nodes)) {
      if (node?.type !== 'user_choice') continue;
      const ch = node.metadata?.choice;
      if (ch?.showChoices !== true) continue;
      const hasDisplayBinding = !!(ch.idField && ch.idField.trim()) || !!(ch.labelField && ch.labelField.trim());
      const branchesPerValue = (node.childNodes ?? []).some((cn) =>
        (cn.conditions ?? []).some((c) => c?.left?.type === 'slot_value_id'));
      if (!hasDisplayBinding && !branchesPerValue) {
        const nm = node.metadata?.name ? ` ("${node.metadata.name}")` : '';
        problems.push(
          `a user_choice node${nm} sets showChoices:true but is capture-only (no idField/labelField and no ` +
          `per-value slot_value_id branch) — this triggers ACXD's "resolved placeholder must be filled in". ` +
          `Either present the choices (populate the choice display binding / branch per value with ` +
          `slot_value_id + constant_id) or set showChoices:false for pure slot capture.`,
        );
      }
    }
  }

  // 13) aiDescription must be ASCII-only. `[VERIFIED]` ACXD's aiDescription validator rejects non-ASCII with
  //     "aiDescription is not in the expected format." (A live deploy failed on a U+2014 em-dash in a flow's
  //     aiDescription; the same char in conversation MESSAGE bodies imported cleanly, so this hard check is
  //     scoped to aiDescription -- flow-level, node-level, and slot-level -- NOT message text.) Em-dashes, smart
  //     quotes and other non-ASCII are common AI-authored-content artifacts; use plain ASCII (hyphen, straight
  //     quotes) in aiDescription. The soft authoring rule (flow-build) steers ASCII everywhere; this check
  //     hard-fails where the platform actually rejects it, before any AWS call.
  {
    const firstNonAscii = (str: string): { ch: string; code: string; pos: number } | null => {
      for (let i = 0; i < str.length; i++) {
        const cp = str.codePointAt(i)!;
        if (cp > 127) return { ch: str[i], code: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`, pos: i };
      }
      return null;
    };
    const flag = (val: unknown, where: string): void => {
      if (typeof val !== 'string' || val === '') return;
      const na = firstNonAscii(val);
      if (na) {
        problems.push(
          `${where} aiDescription contains a non-ASCII character (${na.code} "${na.ch}" at position ${na.pos}) -- ` +
          `ACXD rejects this with "aiDescription is not in the expected format". Use plain ASCII: replace ` +
          `em-dashes with a hyphen (-), smart quotes with straight quotes, etc.`,
        );
      }
    };
    flag(flow.aiDescription, 'flow-level');
    const nodes13 = (flow.nodes ?? {}) as Record<string, { metadata?: { name?: string; aiDescription?: unknown } }>;
    for (const node of Object.values(nodes13)) {
      const nm = node?.metadata?.name ? ` ("${node.metadata.name}")` : '';
      flag(node?.metadata?.aiDescription, `a node${nm}`);
    }
    const slots13 = (flow.slots ?? []) as Array<{ name?: string; aiDescription?: unknown }>;
    for (const sl of slots13) {
      const nm = sl?.name ? ` ("${sl.name}")` : '';
      flag(sl?.aiDescription, `slot${nm}`);
    }
  }

  // 14) data_request exit ORDER. `[VERIFIED]` ACXD CreateFlow binds data_request status edges by
  //     POSITION, not condition value: edges must appear in_progress, success, timeout, failure. Out of order,
  //     CreateFlow silently re-points in_progress at the success target (no error), and in_progress fires
  //     before response fields are set. Fail loudly; the DSL dataRequest() factory emits the right order.
  {
    const DR_ORDER = ['in_progress', 'success', 'timeout', 'failure'];
    const nodes14 = (flow.nodes ?? {}) as Record<string, { type?: string; metadata?: { name?: string }; childNodes?: Array<{ conditions?: Array<{ left?: { type?: string }; right?: { value?: unknown } }> }> }>;
    for (const node of Object.values(nodes14)) {
      if (node?.type !== 'data_request' || !Array.isArray(node.childNodes)) continue;
      const seen = node.childNodes
        .map((cn) => cn.conditions?.[0])
        .filter((c) => c?.left?.type === 'node_status')
        .map((c) => String(c?.right?.value));
      const ranked = seen.filter((v) => DR_ORDER.includes(v));
      const expected = [...ranked].sort((a, b) => DR_ORDER.indexOf(a) - DR_ORDER.indexOf(b));
      if (ranked.join(',') !== expected.join(',')) {
        const nm = node.metadata?.name ? ` ("${node.metadata.name}")` : '';
        problems.push(
          `data_request node${nm} has exits in order [${ranked.join(', ')}] -- ACXD CreateFlow binds these by ` +
          `position and silently re-points in_progress to the success target. Reorder childNodes to ` +
          `[${expected.join(', ')}] (in_progress, success, timeout, failure).`,
        );
      }
    }
  }

  // 15) data_request `in_progress` MUST be disconnected. `[VERIFIED]` Async is out
  //     of scope this release; wiring in_progress is what the SDK collapses onto the success target. The edge is
  //     present (it carries the node_status condition, needed for the order check above) but MUST have no target
  //     nodeId. Fail if an author wired it.
  {
    const nodes15 = (flow.nodes ?? {}) as Record<string, { type?: string; metadata?: { name?: string }; childNodes?: Array<{ nodeId?: string; conditions?: Array<{ left?: { type?: string }; right?: { value?: unknown } }> }> }>;
    for (const node of Object.values(nodes15)) {
      if (node?.type !== 'data_request' || !Array.isArray(node.childNodes)) continue;
      for (const cn of node.childNodes) {
        const c = cn.conditions?.[0];
        if (c?.left?.type === 'node_status' && String(c?.right?.value) === 'in_progress' && cn.nodeId) {
          const nm = node.metadata?.name ? ` ("${node.metadata.name}")` : '';
          problems.push(
            `data_request node${nm} wires its in_progress exit to a target -- it MUST be left disconnected ` +
            `(async is out of scope this release; the SDK collapses a wired in_progress onto the success target). ` +
            `Remove the target so the in_progress edge is a dangling edge with no nodeId.`,
          );
        }
      }
    }
  }

  // 16) Every data_request node's urlParams key must match a {placeholder} in its data request's URL. A urlParams
  //     value with no matching placeholder is silently NOT delivered (the failure: three POSTs whose values
  //     never reached the backend). Fix by adding the {placeholder} to the URL, or by moving the value into the
  //     node `body` (the JSON request body) when the API expects a body.
  // 17) Every top-level `required` field in a data request's requestSchema must be supplied by the node, in its
  //     body or as a URL param, or the backend receives an incomplete request.
  {
    const nodes16 = (flow.nodes ?? {}) as Record<string, { type?: string; metadata?: { name?: string }; dataRequests?: Array<{ dataRequestId?: string; variableId?: string; name?: string; urlParams?: Record<string, unknown>; payload?: { value?: Record<string, unknown> } }> }>;
    for (const node of Object.values(nodes16)) {
      if (node?.type !== 'data_request' || !Array.isArray(node.dataRequests)) continue;
      const nm = node.metadata?.name ? ` ("${node.metadata.name}")` : '';
      for (const dr of node.dataRequests) {
        const id = dr?.dataRequestId ?? dr?.variableId ?? dr?.name;
        const contract = id ? vocab.dataRequestContracts?.get(id) : undefined;
        if (!contract) continue;   // unknown id is reported by check 4b
        const sentUrl = Object.keys(dr.urlParams ?? {});
        const sentBody = new Set(Object.keys(dr.payload?.value ?? {}));
        for (const k of sentUrl) {
          if (!contract.urlParams.has(k)) {
            problems.push(
              `data_request node${nm} sends urlParams "${k}" but the URL of data request "${id}" has no {${k}} ` +
              `placeholder, so the value is never delivered. Add {${k}} to the URL, or send it in the node "body" ` +
              `(JSON request body) if the API expects a body.`,
            );
          }
        }
        for (const req of contract.requiredBody) {
          if (!sentBody.has(req) && !sentUrl.includes(req)) {
            problems.push(
              `data_request node${nm} does not supply "${req}", a required field of data request "${id}"'s ` +
              `requestSchema. Add it to the node "body" (or as a URL param if the URL carries {${req}}).`,
            );
          }
        }
      }
    }
  }

  // 19) A data-request field copied into a context var must use the `variable` operand, never `field`.
  //     `[CONSOLE-VERIFIED]` A `type:"field"` read carries a redaction wrapper, so every downstream use of the
  //     context var gets the literal `<<<name:NLX.Context:...||redact>>>` instead of the value (counter-intuitive pattern 7).
  {
    const nodes19 = (flow.nodes ?? {}) as Record<string, { metadata?: { name?: string; stateModifications?: unknown } }>;
    for (const node of Object.values(nodes19)) {
      const mods = (node?.metadata?.stateModifications ?? []) as Array<{ type?: string; name?: string; value?: { type?: string; name?: unknown } }>;
      if (!Array.isArray(mods)) continue;
      for (const m of mods) {
        if (m?.type !== 'context' || m.value?.type !== 'field' || typeof m.value.name !== 'string') continue;
        if (!m.value.name.includes('.')) continue;
        const nm = node?.metadata?.name ? ` ("${node.metadata.name}")` : '';
        problems.push(
          `a node${nm} copies "${m.value.name}" into context var "${m.name}" with a "field" operand -- that ` +
          `carries a redaction wrapper, so downstream uses get "<<<...||redact>>>" instead of the value. Use the ` +
          `"variable" operand (FlowSpec "from": "var:${m.value.name}").`,
        );
      }
    }
  }

  // 18) Type match on data-request output -> context var copies. ACXD flags (in the canvas, after deploy)
  //     "set modification has an incorrect type: expected string, but got number|list" when a state
  //     modification copies a data-request response field into a context var of a different schemaType.
  //     Compare the field's responseSchema type with the var's declared schemaType, before deploy.
  if (vocab.contextVarTypes && vocab.dataRequestResponseTypes) {
    const ACXD_TYPE: Record<string, string> = {
      string: 'string', number: 'number', integer: 'number', boolean: 'boolean', array: 'list', object: 'object',
    };
    const nodes18 = (flow.nodes ?? {}) as Record<string, { metadata?: { name?: string; stateModifications?: unknown } }>;
    for (const node of Object.values(nodes18)) {
      const mods = (node?.metadata?.stateModifications ?? []) as Array<{
        type?: string; name?: string; value?: { type?: string; name?: unknown };
      }>;
      if (!Array.isArray(mods)) continue;
      for (const m of mods) {
        if (m?.type !== 'context' || !m.name) continue;
        const vt = m.value?.type;
        if ((vt !== 'variable' && vt !== 'field') || typeof m.value?.name !== 'string') continue;
        const [drId, field, ...rest] = m.value.name.split('.');
        if (!field || rest.length) continue;
        const srcRaw = vocab.dataRequestResponseTypes.get(drId)?.get(field);
        const varType = vocab.contextVarTypes.get(m.name);
        if (!srcRaw || !varType) continue;
        const src = ACXD_TYPE[srcRaw] ?? srcRaw;
        if (src !== varType) {
          const nm = node?.metadata?.name ? ` ("${node.metadata.name}")` : '';
          problems.push(
            `a node${nm} sets context variable "${m.name}" (schemaType ${varType}) from "${m.value.name}" ` +
            `(response type ${src}) -- ACXD flags "expected ${varType}, but got ${src}". ` +
            (src === 'list' || src === 'object'
              ? `A ${src} has no context-var type: do not copy it, or (generated API only) add a separate string ` +
                `summary field to the API and copy that.`
              : `Set the context var's schemaType to ${src} in resources/context-vars.json (set a typed default ` +
                `directly, e.g. { "set": var, "value": 0 }). Do NOT change the API field's type: API field types are fixed by the OpenAPI.`),
          );
        }
      }
    }
  }


  // 25) Each data_request payload member must match its requestSchema type. A string constant or a slot/text token
  //     is a string, so it cannot fill an object, array, number, integer or boolean field ("payload.<field> has an
  //     incorrect type: expected object, but got string"). An object field needs a nested body; number/boolean need
  //     a typed operand or a typed constant. [CONSOLE-VERIFIED]
  {
    const nodes25 = (flow.nodes ?? {}) as Record<string, { type?: string; metadata?: { name?: string }; dataRequests?: Array<{ dataRequestId?: string; variableId?: string; name?: string; payload?: { value?: Record<string, { type?: string; value?: unknown }> } }> }>;
    for (const node of Object.values(nodes25)) {
      if (node?.type !== 'data_request' || !Array.isArray(node.dataRequests)) continue;
      const nm = node.metadata?.name ? ` ("${node.metadata.name}")` : '';
      for (const dr of node.dataRequests) {
        // Same id resolution as checks 16-17: the FlowSpec build emits variableId; deploy backfills dataRequestId later.
        const drId = dr?.dataRequestId ?? dr?.variableId ?? dr?.name;
        const types = drId ? vocab.dataRequestBodyTypes?.get(drId) : undefined;
        if (!types) continue;
        for (const [field, op] of Object.entries(dr.payload?.value ?? {})) {
          const want = types.get(field);
          if (!want || want === 'string') continue;
          const isText = op?.type === 'constant' && typeof op.value === 'string';
          const isNested = op?.type === 'recursive' || op?.type === 'json';
          let bad = false;
          if (want === 'object' || want === 'array') bad = !isNested && op?.type !== 'context' && op?.type !== 'variable';
          else if (isText) bad = true;
          if (bad) {
            problems.push(
              `data_request node${nm} sends "${field}" as ${isText ? 'a string' : `a ${op?.type} operand`}, but data request ` +
              `"${drId}" declares it as ${want}. ${want === 'object' || want === 'array'
                ? 'Send it as a nested body (one typed field per value) and give the OpenAPI field its own typed properties.'
                : 'Use a typed operand ({ "type": "context", "name": ... }) or a typed constant.'}`,
            );
          }
        }
      }
    }
  }

  // 26) user_choice value branches must name a value the slot's custom type declares. A built-in slot type
  //     (NLX.*) has no values, so a value branch on it shows as "Unrecognized" in the canvas and never matches.
  {
    const slotTypeOf = new Map<string, string>();
    for (const s of ((flow as { slotTypes?: Array<{ name?: string; type?: string }> }).slotTypes ?? [])) if (s?.name && s?.type) slotTypeOf.set(s.name, s.type);
    const nodes26 = (flow.nodes ?? {}) as Record<string, { type?: string; metadata?: { name?: string }; childNodes?: Array<{ conditions?: Array<{ left?: { type?: string; name?: string }; right?: { type?: string; value?: unknown } }> }> }>;
    for (const node of Object.values(nodes26)) {
      if (node?.type !== 'user_choice') continue;
      const nm = node.metadata?.name ? ` "${node.metadata.name}"` : '';
      for (const cn of node.childNodes ?? []) {
        for (const c of cn.conditions ?? []) {
          if (c?.left?.type !== 'slot_value_id' || c?.right?.type !== 'constant_id') continue;
          const slot = String(c.left.name ?? '');
          const type = slotTypeOf.get(slot);
          const id = String(c.right.value ?? '');
          if (!type) continue;
          if (type.startsWith('NLX.')) {
            problems.push(`user_choice${nm} branches on value "${id}" of slot "${slot}", but its type ${type} has no values. ` +
              'Create a custom slot type with these values in resources/slot-types.json and use it for the slot.');
          } else {
            const ids = vocab.slotTypeValueIds?.get(type);
            if (ids && !ids.has(id)) problems.push(`user_choice${nm} branches on value id "${id}", which slot type "${type}" does not declare ` +
              `(declared: ${[...ids].join(', ') || 'none'}). Use a value listed in resources/slot-types.json.`);
          }
        }
      }
    }
  }

  if (problems.length) {
    throw new Error(
      `flow "${flowId}" has ${problems.length} unresolved resource reference(s) — fix before deploy:\n` +
        problems.map((p) => `  • ${p}`).join('\n'),
    );
  }
}
