import { Resvg } from '@resvg/resvg-js';
import type { RunRecord, TamperFlag } from '@contract';
import satori from 'satori';
import { fonts } from './fonts';

const META = {
  claude: { name: 'Claude Code', color: '#F59E6B' },
  codex: { name: 'Codex', color: '#5EC8CE' },
  opencode: { name: 'OpenCode', color: '#E58BC7' },
  gemini: { name: 'Gemini CLI', color: '#9BCB6E' },
  cursor: { name: 'Cursor', color: '#A99BF0' },
} satisfies Record<RunRecord['agents'][number]['driver'], { name: string; color: string }>;

const MUTED = 'rgba(255,255,255,.55)';
const FLAG_WORD: Record<TamperFlag['rule'], string> = {
  test_skipped: 'skipped test',
  test_deleted: 'deleted test',
  asserts_weakened: 'weakened asserts',
  config_write: 'edited config',
  hidden_path_write: 'wrote hidden path',
};

const cost = (value: number | null) =>
  value === null ? 'n/a' : `$${value.toFixed(2)}`;

const clock = (ms: number) => {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const testsOf = (agent: RunRecord['agents'][number]) =>
  agent.score?.components
    .find((component) => component.id === 'visible_tests')
    ?.detail.split(',')[0]
    ?.replace(' passed', '') ?? '—';

const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[
        character
      ]!,
  );

const stat = (label: string, value: string) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    <span style={{ fontSize: 16, fontWeight: 500, color: MUTED }}>{label}</span>
    <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em' }}>
      {value}
    </span>
  </div>
);

async function renderSvg(rec: RunRecord, embedFont: boolean): Promise<string> {
  const ranked = [...rec.agents].sort(
    (left, right) => (left.rank ?? 99) - (right.rank ?? 99),
  );
  const winner = ranked[0];
  if (!winner) throw new Error('Cannot render a card without agents');

  const winnerColor = META[winner.driver].color;
  const flags = ranked.flatMap((agent) =>
    (agent.score?.tamperFlags ?? []).map(
      (flag) =>
        `${META[agent.driver].name}: ${FLAG_WORD[flag.rule]} ${flag.file}`,
    ),
  );

  const svg = await satori(
    <div
      style={{
        width: 1200,
        height: 630,
        position: 'relative',
        overflow: 'hidden',
        background: '#0A0A0F',
        color: '#F4F4F7',
        padding: '56px 64px',
        display: 'flex',
        flexDirection: 'column',
        gap: 40,
        fontFamily: 'Geist',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: -80,
          top: 40,
          width: 820,
          height: 620,
          borderRadius: 400,
          background: `radial-gradient(ellipse at 40% 45%, ${winnerColor}2E 0%, ${winnerColor}12 35%, transparent 70%)`,
        }}
      />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
        <span style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-0.01em' }}>
          {rec.issue.title}
        </span>
        <span style={{ fontSize: 20, color: MUTED }}>
          {rec.repo.owner}/{rec.repo.name} #{rec.issue.number}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 40, flex: 1 }}>
        <div
          style={{
            flex: 1.25,
            border: '1px solid rgba(255,255,255,.1)',
            background: `radial-gradient(ellipse at 35% 40%, ${winnerColor}18 0%, rgba(255,255,255,.03) 72%)`,
            borderRadius: 16,
            padding: '32px 36px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                background: winnerColor,
                display: 'flex',
              }}
            />
            <span style={{ fontSize: 28, fontWeight: 500 }}>
              {META[winner.driver].name}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <span
              style={{
                fontSize: 180,
                lineHeight: 0.85,
                fontWeight: 700,
                letterSpacing: '-0.05em',
              }}
            >
              {winner.score ? String(winner.score.total) : winner.status}
            </span>
            <span style={{ fontSize: 28, color: MUTED }}>
              / {winner.score?.maxPossible ?? 0}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 40 }}>
            {stat('Cost', cost(winner.costUsd))}
            {stat('Duration', clock(winner.durationMs))}
            {stat('Tests', testsOf(winner))}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {ranked.slice(1, 4).map((agent, index) => (
            <div
              key={agent.driver}
              style={{
                flex: 1,
                border: '1px solid rgba(255,255,255,.1)',
                background: 'rgba(255,255,255,.025)',
                borderRadius: 16,
                padding: '0 28px',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <span
                style={{
                  width: 28,
                  fontSize: 18,
                  fontWeight: 500,
                  color: MUTED,
                }}
              >
                {agent.rank ?? index + 2}
              </span>
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      background: META[agent.driver].color,
                      display: 'flex',
                    }}
                  />
                  <span style={{ fontSize: 22, fontWeight: 500 }}>
                    {META[agent.driver].name}
                  </span>
                </div>
                <span style={{ fontSize: 16, color: MUTED }}>
                  {agent.score
                    ? `${cost(agent.costUsd)} · ${clock(agent.durationMs)}`
                    : agent.status.replace('_', ' ')}
                </span>
              </div>
              <span
                style={{
                  fontSize: 52,
                  fontWeight: 700,
                  letterSpacing: '-0.04em',
                  lineHeight: 1,
                }}
              >
                {agent.score ? String(agent.score.total) : '0'}
              </span>
            </div>
          ))}
        </div>
      </div>
      {flags.length > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 64,
            bottom: 40,
            display: 'flex',
            fontSize: 16,
            color: '#F87171',
          }}
        >
          {flags.join('   ')}
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          right: 64,
          bottom: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 2,
            background: '#F4F4F7',
            display: 'flex',
          }}
        />
        <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.02em' }}>
          bakeoff
        </span>
      </div>
    </div>,
    { width: 1200, height: 630, fonts: fonts(), embedFont },
  );
  const title = [
    rec.issue.title,
    ...ranked.map(
      (agent) =>
        `${META[agent.driver].name} ${agent.score?.total ?? agent.status}`,
    ),
    ...flags,
  ].join(' | ');
  return svg.replace('>', `><title>${escapeXml(title)}</title>`);
}

export function renderCardSvg(rec: RunRecord): Promise<string> {
  return renderSvg(rec, false);
}

export async function renderCardPng(rec: RunRecord): Promise<Uint8Array> {
  const svg = await renderSvg(rec, true);
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } })
    .render()
    .asPng();
  return new Uint8Array(png);
}
