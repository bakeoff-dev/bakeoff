import table from './pricing.json';
import { BudgetMeter, type Price } from './budget';

const MODELS: Record<string, Price> = table.models;

export function priceFor(model: string): Price | null {
  const m = model.toLowerCase();
  let best: string | null = null;
  for (const key of Object.keys(MODELS)) {
    if (m.startsWith(key) && (best === null || key.length > best.length)) best = key;
  }
  return best ? MODELS[best]! : null;
}

export function defaultMeter(capUsd: number): BudgetMeter {
  return new BudgetMeter(capUsd, priceFor);
}
