import type { TokenUsage } from '@contract';

/** USD per million tokens. `cacheWrite` is the 5-minute-TTL rate; `cacheWrite1h` the hourly one. */
export interface Price {
  input: number; output: number; cacheRead: number; cacheWrite: number; cacheWrite1h?: number;
}

/**
 * How a message's cache writes split across TTLs. Anthropic bills a 5-minute write at
 * 1.25x the input rate and a 1-hour write at 2x, so a driver that reports the split
 * lets us meter it correctly; one that does not falls back to the 5-minute rate.
 */
export interface CacheWriteSplit { m5: number; h1: number }
export type PriceLookup = (model: string) => Price | null;

export class BudgetMeter {
  costUsd: number | null = null;
  readonly unknownModels = new Set<string>();
  constructor(readonly capUsd: number, private readonly price: PriceLookup) {}

  /** Add a usage delta (one turn / one message). Deltas, never cumulative totals. */
  addUsage(t: TokenUsage, model: string, cacheWrite?: CacheWriteSplit): void {
    const p = this.price(model);
    if (!p) {
      this.unknownModels.add(model);
      return;
    }
    const write5m = cacheWrite ? cacheWrite.m5 : t.cacheWrite;
    const write1h = cacheWrite ? cacheWrite.h1 : 0;
    const usd =
      (t.input * p.input +
        t.output * p.output +
        t.cacheRead * p.cacheRead +
        write5m * p.cacheWrite +
        write1h * (p.cacheWrite1h ?? p.cacheWrite)) /
      1_000_000;
    this.costUsd = (this.costUsd ?? 0) + usd;
  }

  /** Overwrite with an absolute cost the CLI reported itself. */
  setCost(usd: number): void {
    this.costUsd = usd;
  }

  get exceeded(): boolean {
    return this.costUsd !== null && this.costUsd >= this.capUsd;
  }
}
