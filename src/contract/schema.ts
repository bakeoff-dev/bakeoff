import { z } from 'zod';

/**
 * 2: agents and ladder entries carry the model that ran, and the ladder is keyed by
 * competitor (`driver` or `driver:model`) rather than by driver alone. Readers migrate
 * version 1 on load -- see `src/contract/migrate.ts`.
 */
export const SCHEMA_VERSION = 2 as const;

export const DriverIdSchema = z.enum(['claude', 'codex', 'opencode', 'gemini', 'cursor']); // opencode: schema slot, no driver yet
export const AgentStatusSchema = z.enum(['running', 'ok', 'timeout', 'crashed', 'budget_exceeded']);
export const ComponentIdSchema = z.enum(['visible_tests', 'hidden_tests', 'typecheck', 'lint', 'ci', 'diff', 'judge']);
export const TamperRuleSchema = z.enum(['test_deleted', 'test_skipped', 'asserts_weakened', 'config_write', 'hidden_path_write']);

export const TokenUsageSchema = z.object({
  input: z.number(), output: z.number(), cacheRead: z.number(), cacheWrite: z.number(),
});
export const CapsSchema = z.object({
  budgetUsd: z.number(), timeoutMs: z.number(), maxTurns: z.number().nullable(),
});
export const ScoreComponentSchema = z.object({
  id: ComponentIdSchema, max: z.number(), awarded: z.number().nullable(), detail: z.string(),
});
export const TamperFlagSchema = z.object({ rule: TamperRuleSchema, file: z.string(), detail: z.string() });
export const ScoreBreakdownSchema = z.object({
  components: z.array(ScoreComponentSchema),
  tamperFlags: z.array(TamperFlagSchema),
  tamperPenalty: z.number(),
  total: z.number(),
  maxPossible: z.number(),
});
export const AgentResultSchema = z.object({
  driver: DriverIdSchema,
  /** The model that actually ran, as the CLI reported it. null means the CLI's own default. */
  model: z.string().nullable(),
  /**
   * What the user asked for: null for a bare agent, the pinned id otherwise. This is
   * the ladder's identity, so an auto-routing agent stays one competitor however its
   * provider routes it run to run.
   */
  requestedModel: z.string().nullable(),
  status: AgentStatusSchema,
  branch: z.string(),
  exitCode: z.number().nullable(),
  durationMs: z.number(),
  costUsd: z.number().nullable(),
  tokens: TokenUsageSchema.nullable(),
  filesTouched: z.array(z.string()),
  linesAdded: z.number(),
  linesRemoved: z.number(),
  /**
   * The subset of `filesTouched` that are tests, and the lines they account for.
   * Diff discipline judges the product change, so writing the test that proves the
   * issue is fixed must not read as a bigger, sloppier diff.
   */
  testFilesTouched: z.array(z.string()),
  testLinesChanged: z.number(),
  prUrl: z.string().nullable(),
  prNumber: z.number().nullable(),
  score: ScoreBreakdownSchema.nullable(),
  rank: z.number().nullable(),
  logTail: z.string(),
});
export const BaselineSchema = z.object({
  testsGreen: z.boolean().nullable(), lintGreen: z.boolean().nullable(), typecheckGreen: z.boolean().nullable(),
  /** Why the install step failed, when it did. Null means it ran or was not configured. */
  setupError: z.string().nullable(),
});
export const RepoInfoSchema = z.object({
  owner: z.string(), name: z.string(), defaultBranch: z.string(), baseSha: z.string(),
});
export const IssueInfoSchema = z.object({ number: z.number(), title: z.string(), url: z.string() });
export const ConfiguredSchema = z.object({
  test: z.boolean(), lint: z.boolean(), typecheck: z.boolean(), hiddenTests: z.boolean(), ci: z.boolean(), judge: z.boolean(),
});
export const RunRecordSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  repo: RepoInfoSchema,
  issue: IssueInfoSchema,
  packetHash: z.string(),
  caps: CapsSchema,
  baseline: BaselineSchema,
  configured: ConfiguredSchema,
  agents: z.array(AgentResultSchema),
  winner: DriverIdSchema.nullable(),
  /**
   * Nothing in this race could tell whether the issue was actually solved: no hidden
   * tests were configured and the visible suite was already green at the base commit,
   * so every check only proved nothing broke.
   */
  noAcceptanceTest: z.boolean(),
});

const at = z.string();
export const RaceEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('race.started'), at, runId: z.string(), issue: IssueInfoSchema, repo: RepoInfoSchema, agents: z.array(DriverIdSchema), caps: CapsSchema, baseline: BaselineSchema }),
  z.object({ type: z.literal('agent.started'), at, driver: DriverIdSchema, branch: z.string(), model: z.string().nullable() }),
  z.object({ type: z.literal('agent.progress'), at, driver: DriverIdSchema, costUsd: z.number().nullable(), tokens: TokenUsageSchema.nullable(), lastAction: z.string(), filesTouched: z.number() }),
  z.object({ type: z.literal('agent.exited'), at, driver: DriverIdSchema, status: AgentStatusSchema, exitCode: z.number().nullable(), durationMs: z.number(), costUsd: z.number().nullable(), tokens: TokenUsageSchema.nullable() }),
  z.object({ type: z.literal('agent.pr_opened'), at, driver: DriverIdSchema, prUrl: z.string(), prNumber: z.number() }),
  z.object({ type: z.literal('agent.scored'), at, driver: DriverIdSchema, score: ScoreBreakdownSchema }),
  z.object({ type: z.literal('race.finished'), at, record: RunRecordSchema }),
]);

export const LadderEntrySchema = z.object({
  driver: DriverIdSchema, model: z.string().nullable(),
  mu: z.number(), sigma: z.number(), rating: z.number(),
  races: z.number(), wins: z.number(), avgCostUsd: z.number().nullable(), avgDurationMs: z.number(),
  history: z.array(z.object({ runId: z.string(), at: z.string(), rating: z.number() })),
});
export const LadderSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  /** Keyed by competitor: see `competitorKey`. A driver on two models rates separately. */
  entries: z.record(z.string(), LadderEntrySchema.optional()),
});

/**
 * Ladder identity. A driver is only comparable with itself on the same model, so the
 * model is part of the key; a null model (the CLI's own default) keys on the driver alone.
 */
export function competitorKey(driver: DriverId, model: string | null): string {
  return model === null ? driver : `${driver}:${model}`;
}

export type DriverId = z.infer<typeof DriverIdSchema>;
export type AgentStatus = z.infer<typeof AgentStatusSchema>;
export type ComponentId = z.infer<typeof ComponentIdSchema>;
export type TamperRule = z.infer<typeof TamperRuleSchema>;
export type TokenUsage = z.infer<typeof TokenUsageSchema>;
export type Caps = z.infer<typeof CapsSchema>;
export type ScoreComponent = z.infer<typeof ScoreComponentSchema>;
export type TamperFlag = z.infer<typeof TamperFlagSchema>;
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;
export type AgentResult = z.infer<typeof AgentResultSchema>;
export type Baseline = z.infer<typeof BaselineSchema>;
export type RepoInfo = z.infer<typeof RepoInfoSchema>;
export type IssueInfo = z.infer<typeof IssueInfoSchema>;
export type Configured = z.infer<typeof ConfiguredSchema>;
export type RunRecord = z.infer<typeof RunRecordSchema>;
export type RaceEvent = z.infer<typeof RaceEventSchema>;
export type LadderEntry = z.infer<typeof LadderEntrySchema>;
export type Ladder = z.infer<typeof LadderSchema>;
