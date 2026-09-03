import { dot } from '../theme';

export const Dot = ({ color, px }: { color: string; px: number }) => <span style={dot(color, px)} />;
