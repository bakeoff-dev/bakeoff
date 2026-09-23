import type { AgentStatus, Caps, DriverId, TokenUsage } from '@contract';
import type { BudgetMeter, CacheWriteSplit } from '../budget';

export interface DriverDoctor { found: boolean; version: string | null; authOk: boolean; notes: string[] }

export type AgentEvent =
  | { kind: 'action'; text: string }
  | { kind: 'usage'; tokens: TokenUsage; model: string; cacheWrite?: CacheWriteSplit }
  | { kind: 'cost'; costUsd: number }
  | { kind: 'file'; path: string };

export interface LaunchInput {
  packet: string; packetPath: string; worktree: string; branch: string;
  /** Requested model, or null to let the CLI choose -- drivers pass no model flag then. */
  model: string | null;
  caps: Caps; meter: BudgetMeter; onEvent: (e: AgentEvent) => void; signal: AbortSignal;
  logPath: string;
}
export interface LaunchResult {
  exitCode: number | null; status: Exclude<AgentStatus, 'running'>;
  tokens: TokenUsage | null; costUsd: number | null; durationMs: number; raw: unknown;
  /** The model the CLI reported actually running, when it says; null when it does not. */
  model: string | null;
}
export interface Driver {
  id: DriverId; displayName: string; color: string;
  doctor(): Promise<DriverDoctor>;
  launch(input: LaunchInput): Promise<LaunchResult>;
}

export function helpHasFlags(helpText: string, flags: string[]): string[] {
  return flags.filter((f) => !helpText.includes(f));
}

export function addTokens(a: TokenUsage | null, b: TokenUsage): TokenUsage {
  return {
    input: (a?.input ?? 0) + b.input,
    output: (a?.output ?? 0) + b.output,
    cacheRead: (a?.cacheRead ?? 0) + b.cacheRead,
    cacheWrite: (a?.cacheWrite ?? 0) + b.cacheWrite,
  };
}
