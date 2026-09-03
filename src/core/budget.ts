import type { TokenUsage } from '@contract';

/** USD per million tokens. */
export interface Price { input: number; output: number; cacheRead: number; cacheWrite: number }
export type PriceLookup = (model: string) => Price | null;

export class BudgetMeter {
  costUsd: number | null = null;
  readonly unknownModels = new Set<string>();
  constructor(readonly capUsd: number, private readonly price: PriceLookup) {}

  /** Add a usage delta (one turn / one message). */
  addUsage(t: TokenUsage, model: string): void {
    const p = this.price(model);
    if (!p) {
      this.unknownModels.add(model);
      return;
    }
    const usd =
      (t.input * p.input + t.output * p.output + t.cacheRead * p.cacheRead + t.cacheWrite * p.cacheWrite) / 1_000_000;
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
