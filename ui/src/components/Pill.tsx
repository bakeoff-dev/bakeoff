import type { AgentStatus } from '@contract';
import { PILL, pill } from '../theme';

export function Pill({ status, size = 12, label }: { status: AgentStatus; size?: 12 | 11; label?: string }) {
  return <span style={pill(status, size)}>{label ?? PILL[status].label}</span>;
}
