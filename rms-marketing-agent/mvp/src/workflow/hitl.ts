// The human-in-the-loop workflow (BUILD_PROMPT step 5), on Mastra's suspend/resume:
//   signals (incl. visibility) -> recommend (rules + bandit) -> verifier (schema+guardrail+legal)
//   -> SUSPEND for human approval -> approve once -> push to ALL channels (dry-run -> live)
//   -> outcome logged (the learning loop picks it up from there).
// The LLM's role in this system is orchestration/explanation only — every number in every step
// below comes from deterministic tools; that boundary is enforced by construction here.
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { Mastra } from '@mastra/core/mastra';
import { InMemoryStore } from '@mastra/core/storage';
import { z } from 'zod';
import type { Recommendation, Signals } from '../types.ts';
import type { Runtime } from '../engine/engine.ts';
import { buildSignals } from '../engine/signalService.ts';
import { evaluateFindings, recommendMove } from '../rms/rules.ts';
import { applyBanditArm, assembleRecommendation, candidateSpecFor } from '../rms/policy.ts';
import { candidatesFor } from '../learning/arms.ts';
import { buildContext } from '../learning/featureStore.ts';
import { verifyRecommendation, type VerifierReport } from '../verifier/verifier.ts';
import { pushToAllChannels, type PushSummary } from '../orchestrator/orchestrator.ts';

export interface ApprovalDecision {
  approved: boolean;
  dryRun?: boolean;          // preview the push without writing
  approvalToken?: string;    // who approved (audit trail)
}

export interface HitlResult {
  status: 'executed' | 'dry_run' | 'rejected' | 'blocked' | 'no_action';
  rec: Recommendation | null;
  report: VerifierReport | null;
  push: PushSummary | null;
  detail: string;
}

/** Build the 5-step workflow bound to a runtime. Steps pass plain data; schemas stay loose
 *  (z.custom) because every payload is already produced and consumed by typed core functions. */
export function buildHitlWorkflow(rt: Runtime) {
  const fetchSignalsStep = createStep({
    id: 'fetch-signals',
    description: 'Deterministic read tool: all RMS + visibility math happens here (tool 1 of 3).',
    inputSchema: z.object({ listingId: z.string(), start: z.string().optional(), end: z.string().optional() }),
    outputSchema: z.custom<{ listingId: string; signals: Signals }>(),
    execute: async ({ inputData }) => {
      const window = inputData.start && inputData.end
        ? { start: inputData.start, end: inputData.end }
        : undefined;
      const signals = await buildSignals(rt.store, rt.visibility, inputData.listingId, window);
      return { listingId: inputData.listingId, signals };
    },
  });

  const recommendStep = createStep({
    id: 'recommend',
    description: 'Pure propose tool: rules pick the lever, the contextual bandit picks type+depth (tool 2 of 3).',
    inputSchema: z.custom<{ listingId: string; signals: Signals }>(),
    // bail() short-circuits the no-rec path, so the flowing type is always non-null
    outputSchema: z.custom<{ signals: Signals; rec: Recommendation; reason: string }>(),
    execute: async ({ inputData, bail }) => {
      const { signals } = inputData;
      const state = rt.store.getState();
      const listing = state.listings.find((l) => l.id === inputData.listingId);
      if (!listing) return bail({ status: 'no_action', rec: null, report: null, push: null, detail: 'unknown listing' });

      const findings = evaluateFindings(signals);
      const primary = findings[0];
      let move = recommendMove(primary, signals, { channel: 'booking' });
      if (primary.signal === 'healthy' || move.type === 'none' || signals.missing.length > 0) {
        // NO_ACTION is a first-class outcome (the #1 hallucination guardrail, docs 07)
        return bail({
          status: 'no_action', rec: null, report: null, push: null,
          detail: signals.missing.length > 0 ? `missing inputs: ${signals.missing.join(', ')}` : 'no action indicated',
        } satisfies HitlResult);
      }

      let banditChoice;
      const spec = candidateSpecFor(primary, signals);
      if (spec && spec.anchorDepth > 0) {
        const candidates = candidatesFor(spec.types, spec.anchorDepth);
        if (candidates.length > 0) {
          banditChoice = await rt.bandit.choose(buildContext(signals), candidates, `${state.simDate}:${listing.id}:hitl`);
          move = applyBanditArm(move, banditChoice);
        }
      }
      const rec = assembleRecommendation({
        recommendationId: rt.store.nextId('rec'),
        signals, finding: primary, move: { ...move, window: signals.window },
        banditChoice, listing, settings: state.settings, asOf: state.simDate,
      });
      rt.store.addRecommendation(rec);
      return { signals, rec, reason: primary.rationale };
    },
  });

  const verifyStep = createStep({
    id: 'verify',
    description: 'Independent verifier: schema + grounding + double-discount guardrail + legal checks.',
    inputSchema: z.custom<{ signals: Signals; rec: Recommendation; reason: string }>(),
    outputSchema: z.custom<{ signals: Signals; rec: Recommendation; report: VerifierReport }>(),
    execute: async ({ inputData, bail }) => {
      const { rec, signals } = inputData;
      const state = rt.store.getState();
      const listing = state.listings.find((l) => l.id === rec.listingId)!;
      const report = verifyRecommendation({
        rec, signals, listing, settings: state.settings, activePromos: state.promotions,
      });
      if (!report.pass) {
        rt.store.setRecommendationStatus(rec.recommendationId, 'blocked');
        rt.store.appendAudit({
          ts: state.simDate, actor: 'workflow', kind: 'verifier_block',
          listingId: rec.listingId, recommendationId: rec.recommendationId,
          detail: `Verifier blocked: ${report.checks.filter((c) => !c.pass).map((c) => c.detail).join('; ')}`,
          payload: report,
        });
        return bail({ status: 'blocked', rec, report, push: null, detail: 'verifier blocked the recommendation' } satisfies HitlResult);
      }
      rt.store.appendAudit({
        ts: state.simDate, actor: 'workflow', kind: 'verifier_pass',
        listingId: rec.listingId, recommendationId: rec.recommendationId,
        detail: `Verifier passed: ${report.checks.map((c) => c.name).join(', ')} all green`,
      });
      return { signals, rec, report };
    },
  });

  const approvalStep = createStep({
    id: 'approval',
    description: 'HUMAN GATE: the workflow suspends here until the operator approves/rejects (Mastra suspend/resume).',
    inputSchema: z.custom<{ signals: Signals; rec: Recommendation; report: VerifierReport }>(),
    outputSchema: z.custom<{ signals: Signals; rec: Recommendation; report: VerifierReport; decision: ApprovalDecision }>(),
    suspendSchema: z.custom<{ rec: Recommendation; report: VerifierReport }>(),
    resumeSchema: z.custom<ApprovalDecision>(),
    execute: async ({ inputData, resumeData, suspend }) => {
      if (!resumeData) {
        // Execute-after-approval is structural: side effects live in the NEXT step,
        // so a resume can never double-write.
        return await suspend({ rec: inputData.rec, report: inputData.report });
      }
      return { ...inputData, decision: resumeData };
    },
  });

  const executeStep = createStep({
    id: 'execute-everywhere',
    description: 'Gated write tool (tool 3 of 3): approve ONCE -> guarded push to ALL connected channels; outcome row opens.',
    inputSchema: z.custom<{ signals: Signals; rec: Recommendation; report: VerifierReport; decision: ApprovalDecision }>(),
    outputSchema: z.custom<HitlResult>(),
    execute: async ({ inputData }) => {
      const { rec, signals, report, decision } = inputData;
      const state = rt.store.getState();
      if (!decision.approved) {
        rt.store.setRecommendationStatus(rec.recommendationId, 'rejected');
        rt.store.appendAudit({
          ts: state.simDate, actor: 'operator', kind: 'rejected',
          listingId: rec.listingId, recommendationId: rec.recommendationId,
          detail: `Operator rejected ${rec.move.type} ${(rec.move.depthPct * 100).toFixed(0)}% via workflow`,
        });
        return { status: 'rejected', rec, report, push: null, detail: 'operator rejected' } satisfies HitlResult;
      }
      const dryRun = decision.dryRun ?? false;
      if (!dryRun) {
        rt.store.setRecommendationStatus(rec.recommendationId, 'approved');
        rt.store.appendAudit({
          ts: state.simDate, actor: 'operator', kind: 'approved',
          listingId: rec.listingId, recommendationId: rec.recommendationId,
          detail: `Operator approved ${rec.move.type} ${(rec.move.depthPct * 100).toFixed(0)}% -> pushing to ${(rec.targetChannels ?? []).join(', ')}`,
        });
      }
      const push = await pushToAllChannels(
        { store: rt.store, adapter: rt.adapter, signals },
        rec,
        { dryRun, actor: 'operator', approvalToken: decision.approvalToken ?? 'workflow-operator' },
      );
      return {
        status: dryRun ? 'dry_run' : 'executed',
        rec, report, push,
        detail: dryRun
          ? `dry run: would push to ${push.executedChannels.join(', ')}`
          : `pushed to ${push.executedChannels.join(', ')}${push.blockedChannels.length ? `; guardrail blocked ${push.blockedChannels.join(', ')}` : ''}`,
      } satisfies HitlResult;
    },
  });

  return createWorkflow({
    id: 'revpilot-hitl',
    inputSchema: z.object({ listingId: z.string(), start: z.string().optional(), end: z.string().optional() }),
    outputSchema: z.custom<HitlResult>(),
  })
    .then(fetchSignalsStep)
    .then(recommendStep)
    .then(verifyStep)
    .then(approvalStep)
    .then(executeStep)
    .commit();
}

export interface HitlHandle {
  runId: string;
  status: 'suspended' | 'success' | 'failed' | string;
  /** present while suspended: what the operator must review */
  pending?: { rec: Recommendation; report: VerifierReport };
  result?: HitlResult;
}

/** In-process run registry: start() -> suspended at approval; resume() -> executes/rejects.
 *  (Prod would configure Mastra storage so runs survive restarts; dev keeps them in-memory.) */
export class HitlRunner {
  private rt: Runtime;
  private workflow: ReturnType<typeof buildHitlWorkflow>;
  private runs = new Map<string, Awaited<ReturnType<ReturnType<typeof buildHitlWorkflow>['createRun']>>>();

  constructor(rt: Runtime) {
    this.rt = rt;
    const workflow = buildHitlWorkflow(rt);
    // Registering through a Mastra instance wires run-snapshot storage — suspend/resume
    // needs it. In-memory for the demo; prod swaps a persistent store (e.g. @mastra/libsql).
    const mastra = new Mastra({
      workflows: { 'revpilot-hitl': workflow },
      storage: new InMemoryStore(),
      logger: false,
    });
    this.workflow = mastra.getWorkflow('revpilot-hitl') as ReturnType<typeof buildHitlWorkflow>;
  }

  async start(listingId: string, window?: { start: string; end: string }): Promise<HitlHandle> {
    const run = await this.workflow.createRun();
    this.runs.set(run.runId, run);
    const result = await run.start({
      inputData: { listingId, start: window?.start, end: window?.end },
    });
    return this.toHandle(run.runId, result);
  }

  async resume(runId: string, decision: ApprovalDecision): Promise<HitlHandle> {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`unknown or expired workflow run ${runId}`);
    const result = await run.resume({ step: 'approval', resumeData: decision });
    return this.toHandle(runId, result);
  }

  private toHandle(runId: string, result: { status: string; [k: string]: unknown }): HitlHandle {
    const handle: HitlHandle = { runId, status: result.status };
    if (result.status === 'suspended') {
      const fromStep = (result as { steps?: Record<string, { suspendPayload?: unknown }> }).steps?.approval?.suspendPayload;
      const topLevel = (result as { suspendPayload?: { rec?: unknown } }).suspendPayload;
      handle.pending = (fromStep ?? (topLevel?.rec ? topLevel : undefined)) as HitlHandle['pending'];
    }
    if (result.status === 'success') {
      handle.result = (result as { result?: HitlResult }).result;
    }
    // bail() surfaces as success with the bailed value; failed runs carry their error status
    return handle;
  }
}
