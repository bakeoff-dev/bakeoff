/**
 * Geometry for the 140x28 rating trend, transcribed from Bakeoff Ladder.dc.html:
 * x runs 4..136, y runs 24 (domain low) up to 4 (domain high).
 *
 * `domain` is the rating range shared by every row, so a rising agent sits above a
 * falling one. Normalizing per row instead would push every line to full height and
 * strand the reader with four identical-looking trends.
 */
export function sparklinePoints(values: number[], domain: [number, number] | null): [number, number][] {
  if (values.length < 2) return [];
  const [lo, hi] = domain ?? [Math.min(...values), Math.max(...values)];
  const span = hi - lo || 1;
  return values.map((v, i) => [
    4 + (i / (values.length - 1)) * 132,
    24 - ((v - lo) / span) * 20,
  ]);
}

const box = { display: 'block', justifySelf: 'end' } as const;

export function Sparkline({ values, color, domain = null }: {
  values: number[];
  color: string;
  domain?: [number, number] | null;
}) {
  const pts = sparklinePoints(values, domain);
  const last = pts[pts.length - 1];
  return (
    <svg viewBox="0 0 140 28" width="140" height="28" style={box} aria-hidden>
      {last && (
        <>
          <polyline
            points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
            fill="none" stroke={color} strokeWidth="1.5"
            strokeLinejoin="round" strokeLinecap="round" opacity=".85"
          />
          <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r="2.5" fill={color} />
        </>
      )}
    </svg>
  );
}
