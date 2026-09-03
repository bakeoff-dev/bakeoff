import type { DriverId } from '@contract';
import type { Driver } from './types';

const drivers = new Map<DriverId, Driver>();

export function registerDriver(d: Driver): void {
  drivers.set(d.id, d);
}
export function getDriver(id: DriverId): Driver {
  const d = drivers.get(id);
  if (!d) throw new Error(`Unknown driver "${id}". Registered: ${[...drivers.keys()].join(', ') || 'none'}`);
  return d;
}
export function allDrivers(): Driver[] {
  return [...drivers.values()];
}
