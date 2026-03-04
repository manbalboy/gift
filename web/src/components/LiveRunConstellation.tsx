import { useMemo } from 'react';
import type { ConstellationData } from '../types';

const statusColor: Record<string, string> = {
  queued: 'var(--color-status-waiting)',
  running: 'var(--color-status-running)',
  done: 'var(--color-status-success)',
  failed: 'var(--color-status-failed)',
  review_needed: 'var(--color-status-review-needed)',
};

type Props = {
  data: ConstellationData | null;
};

export default function LiveRunConstellation({ data }: Props) {
  const { points, pointById, links } = useMemo(() => {
    if (!data || data.nodes.length === 0) {
      return {
        points: [],
        pointById: new Map<string, { id: string; x: number; y: number; status: string }>(),
        links: [] as Array<{ key: string; source: string; target: string }>,
      };
    }

    const cx = 280;
    const cy = 120;
    const radius = 78;
    const step = (Math.PI * 2) / data.nodes.length;
    const p = data.nodes.map((node, idx) => ({
      ...node,
      x: cx + Math.cos(idx * step - Math.PI / 2) * radius,
      y: cy + Math.sin(idx * step - Math.PI / 2) * radius,
    }));

    const byId = new Map(p.map((point) => [point.id, point]));
    const normalizedLinks = data.links
      .filter((link) => byId.has(link.source) && byId.has(link.target))
      .map((link) => ({ ...link, key: `${link.source}:${link.target}` }));
    return { points: p, pointById: byId, links: normalizedLinks };
  }, [data]);

  return (
    <section className="card constellation-card">
      <div className="card-header">
        <h2>Live Run Constellation</h2>
        <p>현재 실행 노드 흐름을 실시간으로 시각화합니다.</p>
      </div>
      <svg viewBox="0 0 560 240" className="constellation-svg" role="img" aria-label="실행 상태 미니맵">
        <defs>
          <radialGradient id="orbitGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1A2438" />
            <stop offset="100%" stopColor="#0B1020" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="560" height="240" fill="url(#orbitGlow)" rx="12" />
        <circle cx="280" cy="120" r="82" fill="none" stroke="#27324A" strokeDasharray="4 8" />
        {links.map((link) => {
          const sourcePoint = pointById.get(link.source);
          const targetPoint = pointById.get(link.target);
          if (!sourcePoint || !targetPoint) return null;

          const sourceStatus = sourcePoint.status ?? 'queued';
          const targetStatus = targetPoint.status ?? 'queued';
          const active = targetStatus !== 'queued' || sourceStatus !== 'queued';
          const isRunning = sourceStatus === "running" || targetStatus === "running";
          return (
            <line
              key={link.key}
              x1={sourcePoint.x}
              y1={sourcePoint.y}
              x2={targetPoint.x}
              y2={targetPoint.y}
              className={isRunning ? "constellation-link-running" : "constellation-link"}
              stroke={active ? statusColor[targetStatus] ?? '#7E8AA3' : '#27324A'}
              strokeWidth={active ? 2.4 : 1.2}
            />
          );
        })}
        {points.map((point) => (
          <g key={point.id}>
            {(point.status === 'running' || point.status === 'failed') && (
              <circle
                cx={point.x}
                cy={point.y}
                r="14"
                fill="none"
                stroke={statusColor[point.status] ?? '#7E8AA3'}
                strokeOpacity="0.45"
                strokeWidth="2"
              />
            )}
            <circle cx={point.x} cy={point.y} r="10" fill={statusColor[point.status] ?? '#7E8AA3'} />
            <text x={point.x} y={point.y + 28} textAnchor="middle" className="constellation-label">
              {point.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="constellation-legend mono" aria-label="상태 범례">
        <span>queued ○</span>
        <span>running ▶</span>
        <span>done ✓</span>
        <span>failed !</span>
      </div>
    </section>
  );
}
