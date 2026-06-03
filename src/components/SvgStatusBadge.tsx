import React from 'react';
import { TagData } from '@/contexts/ScadaContext';

interface SvgStatusBadgeProps {
  tag?: TagData;
  x: number;
  y: number;
  /** Scale factor — bumps text/dot sizes for larger SVGs. Default 1. */
  scale?: number;
}

const isLive = (tag?: TagData): boolean => {
  if (!tag) return false;
  if (tag.status === 'disconnected') return false;
  if (tag.lastDataTime) {
    const elapsed = Date.now() - new Date(tag.lastDataTime).getTime();
    return elapsed <= 30000;
  }
  return tag.source === 'mqtt';
};

/**
 * Tiny ON/OFF pill drawn directly in SVG, anchored at (x, y).
 * Green = MQTT data flowing, Red = no data.
 */
const SvgStatusBadge: React.FC<SvgStatusBadgeProps> = ({ tag, x, y, scale = 1 }) => {
  const live = isLive(tag);
  const fill = live ? 'hsl(var(--success))' : 'hsl(var(--destructive))';
  const bg = live ? 'hsl(var(--success) / 0.15)' : 'hsl(var(--destructive) / 0.15)';
  const w = 32 * scale;
  const h = 14 * scale;
  const r = 3 * scale;
  const dotR = 2.5 * scale;
  const fontSize = 8 * scale;

  return (
    <g transform={`translate(${x - w / 2}, ${y - h / 2})`} style={{ pointerEvents: 'none' }}>
      <rect x={0} y={0} width={w} height={h} rx={r} ry={r} fill={bg} stroke={fill} strokeWidth={0.8 * scale} />
      <circle cx={4 * scale} cy={h / 2} r={dotR} fill={fill}>
        {live && <animate attributeName="opacity" values="1;0.4;1" dur="1.5s" repeatCount="indefinite" />}
        {!live && <animate attributeName="opacity" values="1;0.3;1" dur="0.9s" repeatCount="indefinite" />}
      </circle>
      <text
        x={w / 2 + 3 * scale}
        y={h / 2 + fontSize / 3}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight={800}
        fill={fill}
        fontFamily="ui-monospace, monospace"
        letterSpacing={0.5}
      >
        {live ? 'ON' : 'OFF'}
      </text>
    </g>
  );
};

export default SvgStatusBadge;