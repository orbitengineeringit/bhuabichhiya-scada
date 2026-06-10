import React, { useMemo } from 'react';
import { useScada } from '@/contexts/ScadaContext';
import SensorStatusStrip from './SensorStatusStrip';

/**
 * WTP Process Simulation – Realistic Water Treatment Plant Mimic
 * 
 * Flow: Raw Water In → Flash Mixer → Flocculator → Settling Tank → 
 *       Filter Beds (Backwash Tank) → Clear Water Reservoir → HT Pumps → Out to OHTs
 * 
 * Cross-logic for process unit ON/OFF status:
 *  - Flash Mixer / Flocculator / Settling Tank / Filters: ON when Flow IN > 0.1
 *  - Chlorination: ON when Flow IN > 0.1 OR any pump running OR CW level > 5
 */

// ────────────────────────────────────────────────────────────
// CIRCULAR GAUGE (matching Intake/OHT quality)
// ────────────────────────────────────────────────────────────
interface GaugeProps { cx: number; cy: number; r: number; value: number; min: number; max: number; label: string; unit: string; }

const Gauge: React.FC<GaugeProps> = ({ cx, cy, r, value, min, max, label, unit }) => {
  const pNorm = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const pct = pNorm * 100;
  const nAngle = -135 + pNorm * 270;
  const nLen = r - 14;

  const getCol = () => {
    if (pct > 85) return 'hsl(var(--destructive))';
    if (pct > 65) return 'hsl(var(--warning))';
    return 'hsl(var(--success))';
  };

  const arc = (s: number, e: number, radius: number) => {
    const sr = (s - 90) * Math.PI / 180, er = (e - 90) * Math.PI / 180;
    const x1 = cx + radius * Math.cos(sr), y1 = cy + radius * Math.sin(sr);
    const x2 = cx + radius * Math.cos(er), y2 = cy + radius * Math.sin(er);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${e - s > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };

  const arcR = r - 10;
  const arcStroke = Math.max(8, r * 0.2);
  const activeStroke = arcStroke + 2;
  const uid = label.replace(/[\s\/()#+]/g, '');

  return (
    <g>
      <defs>
        <filter id={`gg-w-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b" />
          <feComposite in="SourceGraphic" in2="b" operator="over" />
        </filter>
        <radialGradient id={`hub-w-${uid}`}>
          <stop offset="0%" stopColor={getCol()} />
          <stop offset="100%" stopColor={getCol()} stopOpacity="0.6" />
        </radialGradient>
      </defs>

      {/* Outer metallic case */}
      <circle cx={cx} cy={cy} r={r + 8} fill="#475569" />
      <circle cx={cx} cy={cy} r={r + 6} fill="#64748b" />
      <circle cx={cx} cy={cy} r={r + 4} fill="#334155" />

      {/* Inner gauge face */}
      <circle cx={cx} cy={cy} r={r} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="3" />
      <circle cx={cx} cy={cy} r={r - 2} fill="none" stroke="hsl(var(--muted))" strokeWidth="4" opacity="0.3" />

      {/* Zone arcs */}
      <path d={arc(-135, 135, arcR)} fill="none" stroke="hsl(var(--border))" strokeWidth={arcStroke} strokeLinecap="round" />
      <path d={arc(-135, -135 + 270 * 0.65, arcR)} fill="none" stroke="hsl(var(--success) / 0.35)" strokeWidth={arcStroke} strokeLinecap="round" />
      <path d={arc(-135 + 270 * 0.65, -135 + 270 * 0.85, arcR)} fill="none" stroke="hsl(var(--warning) / 0.45)" strokeWidth={arcStroke} strokeLinecap="round" />
      <path d={arc(-135 + 270 * 0.85, 135, arcR)} fill="none" stroke="hsl(var(--destructive) / 0.45)" strokeWidth={arcStroke} strokeLinecap="round" />

      {pct > 2 && (
        <path d={arc(-135, -135 + 270 * (pct / 100), arcR)} fill="none"
          stroke={getCol()} strokeWidth={activeStroke} strokeLinecap="round" filter={`url(#gg-w-${uid})`} />
      )}

      {/* Ticks */}
      {Array.from({ length: 11 }, (_, i) => {
        const a = (-135 + 270 * (i / 10) - 90) * Math.PI / 180;
        const iR = arcR - 10, oR = arcR - 3, lR = arcR - 22;
        const tv = min + (i / 10) * (max - min);
        const maj = i % 2 === 0;
        return (
          <g key={i}>
            <line
              x1={cx + (maj ? iR : iR + 5) * Math.cos(a)} y1={cy + (maj ? iR : iR + 5) * Math.sin(a)}
              x2={cx + oR * Math.cos(a)} y2={cy + oR * Math.sin(a)}
              stroke="hsl(var(--muted-foreground))" strokeWidth={maj ? 2 : 1}
            />
            {maj && (
              <text x={cx + lR * Math.cos(a)} y={cy + lR * Math.sin(a)}
                textAnchor="middle" dominantBaseline="central"
                fill="hsl(var(--foreground))" style={{ fontSize: `${Math.max(9, r * 0.2)}px`, fontWeight: 800 }}>
                {Number.isInteger(tv) ? tv : tv.toFixed(1)}
              </text>
            )}
          </g>
        );
      })}

      {/* Hub */}
      <circle cx={cx} cy={cy} r={Math.max(7, r * 0.16)} fill={`url(#hub-w-${uid})`} />
      <circle cx={cx} cy={cy} r={Math.max(4, r * 0.08)} fill={getCol()} opacity={0.9} />

      {/* Needle */}
      <line x1={0} y1={0} x2={0} y2={-nLen}
        stroke={getCol()} strokeWidth={3} strokeLinecap="round"
        style={{
          transform: `translate(${cx}px, ${cy}px) rotate(${nAngle}deg)`,
          transition: 'transform 1s cubic-bezier(0.4, 0, 0.2, 1)',
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
        }}
      />
      {pct > 1 && (
        <circle r={4.5} fill={getCol()} opacity={0.6}
          style={{
            transform: `translate(${cx}px, ${cy}px) rotate(${nAngle}deg) translateY(${-nLen}px)`,
            transition: 'transform 1s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      )}

      {/* Label */}
      <text x={cx} y={cy - r - 16} textAnchor="middle" fill="hsl(var(--foreground))"
        style={{ fontSize: `${Math.max(13, r * 0.28)}px`, fontWeight: 800, letterSpacing: '0.6px' }}>
        {label}
      </text>

      {/* Value box */}
      <rect x={cx - 38} y={cy + r + 12} width={76} height={30} rx={5}
        fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" />
      <text x={cx} y={cy + r + 32} textAnchor="middle" fill="hsl(var(--foreground))"
        style={{ fontSize: '15px', fontWeight: 800, fontFamily: "ui-monospace, monospace" }}>
        {value.toFixed(1)} <tspan fontSize="10" fill="hsl(var(--muted-foreground))" fontWeight="600">{unit}</tspan>
      </text>
    </g>
  );
};

// ────────────────────────────────────────────────────────────
// INLINE ANALYZER PANELS
// ────────────────────────────────────────────────────────────

// pH Analyzer
const InlinePhAnalyzer: React.FC<{ x: number; y: number; w: number; h: number; value: number; label: string }> = ({ x, y, w, h, value, label }) => {
  const isNormal = value >= 6.5 && value <= 8.5;
  const isAcidic = value < 6.5 && value > 0;
  const isAlkaline = value > 8.5;
  const getPhColor = () => {
    if (value <= 0) return 'hsl(var(--muted-foreground))';
    if (value < 3) return 'hsl(0 85% 50%)';
    if (value < 5) return 'hsl(25 90% 55%)';
    if (value < 6.5) return 'hsl(45 90% 55%)';
    if (value <= 8.5) return 'hsl(142 65% 45%)';
    if (value < 10) return 'hsl(200 75% 55%)';
    return 'hsl(240 70% 55%)';
  };
  const getStatusColor = () => isNormal ? 'hsl(var(--success))' : isAcidic ? 'hsl(0 80% 55%)' : isAlkaline ? 'hsl(240 70% 60%)' : 'hsl(var(--muted-foreground))';
  const statusLabel = isNormal ? 'NORMAL' : isAcidic ? 'ACIDIC' : isAlkaline ? 'ALKALINE' : '---';
  const pointerX = 18 + (value / 14) * 64;
  const uid = label.replace(/[\s\/()#+]/g, '');

  return (
    <svg x={x} y={y} width={w} height={h} viewBox="0 0 100 130" style={{ filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.2))' }}>
      <defs>
        <linearGradient id={`ph-body-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(var(--secondary))" />
          <stop offset="40%" stopColor="hsl(var(--card))" />
          <stop offset="100%" stopColor="hsl(var(--secondary))" />
        </linearGradient>
        <linearGradient id={`ph-spec-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(0 85% 50%)" />
          <stop offset="21%" stopColor="hsl(25 90% 55%)" />
          <stop offset="36%" stopColor="hsl(45 90% 55%)" />
          <stop offset="46%" stopColor="hsl(100 65% 50%)" />
          <stop offset="54%" stopColor="hsl(142 65% 45%)" />
          <stop offset="64%" stopColor="hsl(200 75% 55%)" />
          <stop offset="78%" stopColor="hsl(240 70% 55%)" />
          <stop offset="100%" stopColor="hsl(280 70% 50%)" />
        </linearGradient>
        <filter id={`ph-glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="glow" />
          <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Housing */}
      <rect x="8" y="2" width="84" height="126" rx="5" fill={`url(#ph-body-${uid})`} stroke="hsl(var(--border))" strokeWidth="1.5" />
      <rect x="12" y="6" width="76" height="118" rx="3.5" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="0.8" />
      {/* Screws */}
      {[[15, 9], [83, 9], [15, 121], [83, 121]].map(([cx, cy], i) => (
        <g key={i}><circle cx={cx} cy={cy} r="3" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
          <line x1={cx - 1} y1={cy - 1} x2={cx + 1} y2={cy + 1} stroke="hsl(var(--muted-foreground))" strokeOpacity="0.4" strokeWidth="0.6" />
          <line x1={cx + 1} y1={cy - 1} x2={cx - 1} y2={cy + 1} stroke="hsl(var(--muted-foreground))" strokeOpacity="0.4" strokeWidth="0.6" /></g>
      ))}
      {/* Label */}
      <text x="50" y="17" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '5.5px', fontWeight: 600, letterSpacing: '1px' }}>● {label}</text>
      {/* LED */}
      <circle cx="14" cy="14.5" r="2.5" fill={value > 0 ? '#22c55e' : '#ef4444'}>
        {value > 0 && <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />}
      </circle>
      {/* LCD */}
      <rect x="16" y="21" width="68" height="34" rx="3" fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="0.8" />
      <rect x="18" y="23" width="64" height="30" rx="2" fill="hsl(var(--background))" />
      <text x="50" y="30" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '6px', fontFamily: 'ui-monospace, monospace' }}>pH</text>
      <text x="50" y="47" textAnchor="middle" fill={getPhColor()} style={{ fontSize: '17px', fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{value.toFixed(2)}</text>
      {/* pH Spectrum */}
      <rect x="18" y="60" width="64" height="6" rx="2" fill={`url(#ph-spec-${uid})`} opacity="0.6" />
      <rect x="18" y="60" width="64" height="6" rx="2" fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <line x1={18 + 64 * (6.5 / 14)} y1="59" x2={18 + 64 * (6.5 / 14)} y2="67.5" stroke="hsl(var(--foreground))" strokeWidth="0.6" strokeDasharray="1 1" />
      <line x1={18 + 64 * (8.5 / 14)} y1="59" x2={18 + 64 * (8.5 / 14)} y2="67.5" stroke="hsl(var(--foreground))" strokeWidth="0.6" strokeDasharray="1 1" />
      {value > 0 && <polygon points={`${pointerX - 2.5},59 ${pointerX + 2.5},59 ${pointerX},61`} fill={getPhColor()}>
        <animate attributeName="opacity" values="1;0.6;1" dur="2s" repeatCount="indefinite" />
      </polygon>}
      {[0, 7, 14].map(v => <text key={v} x={18 + (v / 14) * 64} y="72" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '4.5px' }}>{v}</text>)}
      {/* LEDs */}
      <circle cx="24" cy="79" r="3" fill={isAcidic ? 'hsl(0 80% 55%)' : 'hsl(var(--muted))'} stroke="hsl(var(--border))" strokeWidth="0.5" filter={isAcidic ? `url(#ph-glow-${uid})` : undefined} />
      <text x="24" y="86" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '4px' }}>ACID</text>
      <circle cx="50" cy="79" r="3" fill={isNormal ? 'hsl(var(--success))' : 'hsl(var(--muted))'} stroke="hsl(var(--border))" strokeWidth="0.5" filter={isNormal ? `url(#ph-glow-${uid})` : undefined}>
        {isNormal && <animate attributeName="opacity" values="1;0.7;1" dur="2s" repeatCount="indefinite" />}
      </circle>
      <text x="50" y="86" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '4px' }}>OK</text>
      <circle cx="76" cy="79" r="3" fill={isAlkaline ? 'hsl(240 70% 60%)' : 'hsl(var(--muted))'} stroke="hsl(var(--border))" strokeWidth="0.5" />
      <text x="76" y="86" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '4px' }}>ALK</text>
      {/* Electrode */}
      <rect x="18" y="90" width="20" height="24" rx="3" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="0.8" />
      <rect x="23" y="92" width="10" height="18" rx="4" fill="hsl(200 20% 70% / 0.3)" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <line x1="28" y1="94" x2="28" y2="107" stroke="hsl(var(--muted-foreground))" strokeOpacity="0.3" strokeWidth="1.5" strokeLinecap="round" />
      {/* Buttons */}
      <rect x="44" y="90" width="40" height="24" rx="2" fill="hsl(var(--muted))" fillOpacity="0.3" stroke="hsl(var(--border))" strokeWidth="0.4" />
      <rect x="48" y="93" width="14" height="7" rx="1.5" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <text x="55" y="98.5" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '4px', fontWeight: 600 }}>CAL</text>
      <rect x="66" y="93" width="14" height="7" rx="1.5" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <text x="73" y="98.5" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '4px', fontWeight: 600 }}>DIAG</text>
      {/* Status */}
      <rect x="30" y="116" width="40" height="7" rx="2" fill={getStatusColor()} fillOpacity="0.12" />
      <text x="50" y="121.5" textAnchor="middle" fill={getStatusColor()} style={{ fontSize: '5.5px', fontFamily: 'ui-monospace, monospace', fontWeight: 700, letterSpacing: '0.5px' }}>{statusLabel}</text>
    </svg>
  );
};

// Chlorine Analyzer
const InlineClAnalyzer: React.FC<{ x: number; y: number; w: number; h: number; value: number }> = ({ x, y, w, h, value }) => {
  const max = 5;
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const isNormal = value >= 0.2 && value <= 2.0;
  const isLow = value < 0.2;
  const isHigh = value > 2.0;
  const getCol = () => isNormal ? 'hsl(var(--success))' : isHigh ? 'hsl(var(--destructive))' : 'hsl(var(--warning))';
  const statusLabel = isNormal ? 'NORMAL' : isLow ? 'LOW' : 'HIGH';

  return (
    <svg x={x} y={y} width={w} height={h} viewBox="0 0 100 130" style={{ filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.2))' }}>
      <defs>
        <linearGradient id="cl-body-wtp" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(var(--secondary))" />
          <stop offset="40%" stopColor="hsl(var(--card))" />
          <stop offset="100%" stopColor="hsl(var(--secondary))" />
        </linearGradient>
        <linearGradient id="cl-reagent-wtp" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(50 90% 65% / 0.7)" />
          <stop offset="100%" stopColor="hsl(45 85% 50% / 0.5)" />
        </linearGradient>
        <filter id="cl-glow-wtp" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="glow" />
          <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Housing */}
      <rect x="8" y="2" width="84" height="126" rx="5" fill="url(#cl-body-wtp)" stroke="hsl(var(--border))" strokeWidth="1.5" />
      <rect x="12" y="6" width="76" height="118" rx="3.5" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="0.8" />
      {[[15, 9], [83, 9], [15, 121], [83, 121]].map(([cx, cy], i) => (
        <g key={i}><circle cx={cx} cy={cy} r="3" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
          <line x1={cx - 1.5} y1={cy} x2={cx + 1.5} y2={cy} stroke="hsl(var(--muted-foreground))" strokeOpacity="0.4" strokeWidth="0.6" /></g>
      ))}
      <text x="50" y="17" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '5.5px', fontWeight: 600, letterSpacing: '1px' }}>● CHLORINE</text>
      <circle cx="14" cy="14.5" r="2.5" fill={value > 0 ? '#22c55e' : '#ef4444'}>
        {value > 0 && <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />}
      </circle>
      {/* LCD */}
      <rect x="16" y="21" width="68" height="32" rx="3" fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="0.8" />
      <rect x="18" y="23" width="64" height="28" rx="2" fill="hsl(var(--background))" />
      <text x="50" y="29" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '6px', fontFamily: 'ui-monospace, monospace' }}>mg/L</text>
      <text x="50" y="43" textAnchor="middle" fill={getCol()} style={{ fontSize: '16px', fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{value.toFixed(2)}</text>
      {/* LEDs */}
      <circle cx="26" cy="60" r="3" fill={isLow ? 'hsl(var(--warning))' : 'hsl(var(--muted))'} stroke="hsl(var(--border))" strokeWidth="0.5" filter={isLow ? 'url(#cl-glow-wtp)' : undefined} />
      <text x="26" y="67" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '4.5px' }}>LOW</text>
      <circle cx="50" cy="60" r="3" fill={isNormal ? 'hsl(var(--success))' : 'hsl(var(--muted))'} stroke="hsl(var(--border))" strokeWidth="0.5" filter={isNormal ? 'url(#cl-glow-wtp)' : undefined}>
        {isNormal && <animate attributeName="opacity" values="1;0.7;1" dur="2s" repeatCount="indefinite" />}
      </circle>
      <text x="50" y="67" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '4.5px' }}>OK</text>
      <circle cx="74" cy="60" r="3" fill={isHigh ? 'hsl(var(--destructive))' : 'hsl(var(--muted))'} stroke="hsl(var(--border))" strokeWidth="0.5" filter={isHigh ? 'url(#cl-glow-wtp)' : undefined}>
        {isHigh && <animate attributeName="opacity" values="1;0.4;1" dur="0.8s" repeatCount="indefinite" />}
      </circle>
      <text x="74" y="67" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '4.5px' }}>HIGH</text>
      {/* Bar */}
      <rect x="18" y="72" width="64" height="6" rx="2" fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <rect x={18 + 64 * (0.2 / max)} y="72" width={64 * ((2.0 - 0.2) / max)} height="6" fill="hsl(var(--success))" fillOpacity="0.12" />
      <rect x="18" y="72" width={Math.max(0, 64 * pct / 100)} height="6" rx="2" fill={getCol()} />
      {/* Reagent chamber */}
      <rect x="20" y="89" width="16" height="22" rx="3" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="0.8" />
      <rect x="22" y={89 + 22 * (1 - Math.min(pct / 100 + 0.3, 1))} width="12" height={22 * Math.min(pct / 100 + 0.3, 1)} rx="2" fill="url(#cl-reagent-wtp)" opacity="0.8" />
      {/* Buttons */}
      <rect x="42" y="89" width="42" height="22" rx="2" fill="hsl(var(--muted))" fillOpacity="0.3" stroke="hsl(var(--border))" strokeWidth="0.4" />
      <rect x="46" y="92" width="14" height="7" rx="1.5" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <text x="53" y="97.5" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '4px', fontWeight: 600 }}>MENU</text>
      <rect x="64" y="92" width="14" height="7" rx="1.5" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <text x="71" y="97.5" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '4px', fontWeight: 600 }}>SET</text>
      {/* Status */}
      <rect x="32" y="114" width="36" height="8" rx="2" fill={getCol()} fillOpacity="0.12" />
      <text x="50" y="120" textAnchor="middle" fill={getCol()} style={{ fontSize: '5.5px', fontFamily: 'ui-monospace, monospace', fontWeight: 700, letterSpacing: '0.5px' }}>{statusLabel}</text>
    </svg>
  );
};

// Turbidity Analyzer
const InlineTaAnalyzer: React.FC<{ x: number; y: number; w: number; h: number; value: number; label: string }> = ({ x, y, w, h, value, label }) => {
  const max = 100;
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const isGood = value <= 5;
  const isWarning = value > 5 && value <= 10;
  const isDanger = value > 10;
  const getCol = () => isGood ? 'hsl(var(--success))' : isWarning ? 'hsl(var(--warning))' : 'hsl(var(--destructive))';
  const statusLabel = isGood ? 'CLEAR' : isWarning ? 'CAUTION' : 'TURBID';
  const waterOpacity = Math.min(0.15 + (value / max) * 0.6, 0.75);
  const waterColor = isGood ? 'hsl(200 60% 60%)' : isWarning ? 'hsl(40 70% 55%)' : 'hsl(25 65% 45%)';
  const uid = label.replace(/[\s\/()#+]/g, '');

  return (
    <svg x={x} y={y} width={w} height={h} viewBox="0 0 100 130" style={{ filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.2))' }}>
      <defs>
        <linearGradient id={`tb-body-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(var(--secondary))" />
          <stop offset="40%" stopColor="hsl(var(--card))" />
          <stop offset="100%" stopColor="hsl(var(--secondary))" />
        </linearGradient>
        <linearGradient id={`tb-water-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={waterColor} stopOpacity={waterOpacity * 0.6} />
          <stop offset="100%" stopColor={waterColor} stopOpacity={waterOpacity} />
        </linearGradient>
        <filter id={`tb-glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="glow" />
          <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Housing */}
      <rect x="8" y="2" width="84" height="126" rx="5" fill={`url(#tb-body-${uid})`} stroke="hsl(var(--border))" strokeWidth="1.5" />
      <rect x="12" y="6" width="76" height="118" rx="3.5" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="0.8" />
      {[[15, 9], [83, 9], [15, 121], [83, 121]].map(([cx, cy], i) => (
        <g key={i}><circle cx={cx} cy={cy} r="3" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
          <line x1={cx - 1.5} y1={cy} x2={cx + 1.5} y2={cy} stroke="hsl(var(--muted-foreground))" strokeOpacity="0.4" strokeWidth="0.6" /></g>
      ))}
      <text x="50" y="17" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '5px', fontWeight: 600, letterSpacing: '1px' }}>●{label}</text>
      <circle cx="14" cy="14.5" r="2.5" fill={value > 0 ? '#22c55e' : '#ef4444'} />
      {/* LCD */}
      <rect x="16" y="21" width="68" height="32" rx="3" fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="0.8" />
      <rect x="18" y="23" width="64" height="28" rx="2" fill="hsl(var(--background))" />
      <text x="50" y="29" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '6px', fontFamily: 'ui-monospace, monospace' }}>NTU</text>
      <text x="50" y="45" textAnchor="middle" fill={getCol()} style={{ fontSize: '16px', fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{value.toFixed(2)}</text>
      {/* Bar */}
      <rect x="18" y="58" width="64" height="6" rx="2" fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <rect x="18" y="58" width={64 * (5 / max)} height="6" rx="2" fill="hsl(var(--success) / 0.1)" />
      <rect x="18" y="58" width={Math.max(0, 64 * pct / 100)} height="6" rx="2" fill={getCol()} />
      <line x1={18 + 64 * (5 / max)} y1="57" x2={18 + 64 * (5 / max)} y2="65.5" stroke="hsl(var(--foreground))" strokeOpacity="0.4" strokeWidth="0.5" strokeDasharray="1 1" />
      {/* LEDs */}
      <circle cx="55" cy="72" r="3" fill={isGood ? 'hsl(var(--success))' : 'hsl(var(--muted))'} stroke="hsl(var(--border))" strokeWidth="0.5" filter={isGood ? `url(#tb-glow-${uid})` : undefined}>
        {isGood && <animate attributeName="opacity" values="1;0.7;1" dur="2s" repeatCount="indefinite" />}
      </circle>
      <text x="55" y="79" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '3.5px' }}>CLR</text>
      <circle cx="68" cy="72" r="3" fill={isWarning ? 'hsl(var(--warning))' : 'hsl(var(--muted))'} stroke="hsl(var(--border))" strokeWidth="0.5" />
      <text x="68" y="79" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '3.5px' }}>WRN</text>
      <circle cx="81" cy="72" r="3" fill={isDanger ? 'hsl(var(--destructive))' : 'hsl(var(--muted))'} stroke="hsl(var(--border))" strokeWidth="0.5" />
      <text x="81" y="79" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '3.5px' }}>ALM</text>
      {/* Optical cell */}
      <rect x="18" y="83" width="30" height="24" rx="4" fill="hsl(var(--secondary))" fillOpacity="0.5" stroke="hsl(var(--border))" strokeWidth="0.8" />
      <rect x="23" y="86" width="20" height="18" rx="6" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="0.6" />
      <rect x="25" y="88" width="16" height="14" rx="5" fill={`url(#tb-water-${uid})`} />
      <line x1="18" y1="95" x2="23" y2="95" stroke="hsl(0 85% 55%)" strokeWidth="1" strokeLinecap="round" opacity="0.7">
        <animate attributeName="opacity" values="0.5;0.9;0.5" dur="1.5s" repeatCount="indefinite" />
      </line>
      <circle cx="18" cy="95" r="1.5" fill="hsl(0 85% 55%)" opacity="0.8" />
      {/* Buttons */}
      <rect x="54" y="83" width="30" height="24" rx="2" fill="hsl(var(--muted))" fillOpacity="0.3" stroke="hsl(var(--border))" strokeWidth="0.4" />
      <rect x="57" y="86" width="11" height="7" rx="1.5" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <text x="62.5" y="91.5" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '3.5px', fontWeight: 600 }}>ZERO</text>
      <rect x="70" y="86" width="11" height="7" rx="1.5" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <text x="75.5" y="91.5" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '3.5px', fontWeight: 600 }}>SPAN</text>
      {/* Status */}
      <rect x="30" y="116" width="40" height="7" rx="2" fill={getCol()} fillOpacity="0.12" />
      <text x="50" y="121.5" textAnchor="middle" fill={getCol()} style={{ fontSize: '5.5px', fontFamily: 'ui-monospace, monospace', fontWeight: 700, letterSpacing: '0.5px' }}>{statusLabel}</text>
    </svg>
  );
};

// ────────────────────────────────────────────────────────────
// STATUS BADGE
// ────────────────────────────────────────────────────────────
interface StatusBadgeProps { x: number; y: number; isOn: boolean; }
const StatusBadge: React.FC<StatusBadgeProps> = ({ x, y, isOn }) => (
  <g>
    <rect x={x - 22} y={y} width={44} height={18} rx={9}
      fill={isOn ? 'hsl(var(--success) / 0.15)' : 'hsl(var(--destructive) / 0.15)'}
      stroke={isOn ? 'hsl(var(--success) / 0.5)' : 'hsl(var(--destructive) / 0.5)'} strokeWidth="1" />
    <circle cx={x - 12} cy={y + 9} r={3.5}
      fill={isOn ? '#22c55e' : '#ef4444'}>
      {isOn && <animate attributeName="opacity" values="1;0.4;1" dur="1.5s" repeatCount="indefinite" />}
    </circle>
    <text x={x + 5} y={y + 13} textAnchor="middle" fontSize="9" fontWeight="900"
      fill={isOn ? 'hsl(var(--success))' : 'hsl(var(--destructive))'}>
      {isOn ? 'ON' : 'OFF'}
    </text>
  </g>
);

// ────────────────────────────────────────────────────────────
// INLINE HT PUMP (matching WtpPump card design)
// ────────────────────────────────────────────────────────────
const InlineHTPump: React.FC<{ x: number; y: number; w: number; h: number; isRunning: boolean; label: string }> = ({ x, y, w, h, isRunning, label }) => {
  const body = 'hsl(210 70% 42%)';
  const light = 'hsl(210 60% 52%)';
  const dark = 'hsl(210 75% 30%)';
  const veryDark = 'hsl(210 80% 22%)';

  return (
    <svg x={x} y={y} width={w} height={h} viewBox="0 0 155 105" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))' }}>
      {/* Outlet Pipe (top) */}
      <rect x="24" y="0" width="14" height="16" rx="2" fill={body} stroke={dark} strokeWidth="1" />
      <rect x="19" y="0" width="24" height="5" rx="1.5" fill={light} stroke={dark} strokeWidth="0.8" />
      <circle cx="23" cy="2.5" r="1.5" fill={veryDark} />
      <circle cx="39" cy="2.5" r="1.5" fill={veryDark} />

      {/* Volute Casing */}
      <path d="M8 50 C8 22 18 14 32 14 C50 14 58 26 58 50 C58 72 46 76 32 76 C14 76 8 68 8 50 Z"
        fill={body} stroke={dark} strokeWidth="1.5" />
      <circle cx="33" cy="46" r="18" fill={light} stroke={dark} strokeWidth="0.8" opacity="0.6" />
      <path d="M33 28 C45 28 51 36 51 46 C51 56 45 62 33 62" fill="none" stroke={dark} strokeWidth="0.5" opacity="0.4" />

      {/* Impeller */}
      <g style={isRunning ? { animation: 'spin 0.8s linear infinite', transformOrigin: '33px 46px' } : { transformOrigin: '33px 46px' }}>
        <path d="M33 46 C31 42 28 36 25 32" fill="none" stroke="hsl(0 0% 85%)" strokeWidth="3" strokeLinecap="round" />
        <path d="M33 46 C35 42 38 36 41 32" fill="none" stroke="hsl(0 0% 85%)" strokeWidth="3" strokeLinecap="round" />
        <path d="M33 46 C31 50 28 56 25 60" fill="none" stroke="hsl(0 0% 85%)" strokeWidth="3" strokeLinecap="round" />
        <path d="M33 46 C35 50 38 56 41 60" fill="none" stroke="hsl(0 0% 85%)" strokeWidth="3" strokeLinecap="round" />
        <path d="M33 46 C29 45 23 44 19 44" fill="none" stroke="hsl(0 0% 85%)" strokeWidth="3" strokeLinecap="round" />
        <path d="M33 46 C37 47 43 48 47 48" fill="none" stroke="hsl(0 0% 85%)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="33" cy="46" r="5" fill="hsl(0 0% 82%)" stroke="hsl(0 0% 65%)" strokeWidth="1" />
        <circle cx="33" cy="46" r="2" fill="hsl(0 0% 70%)" />
      </g>

      {/* Inlet Pipe (left) */}
      <rect x="0" y="40" width="10" height="13" rx="2" fill={body} stroke={dark} strokeWidth="1" />
      <ellipse cx="2" cy="46.5" rx="3" ry="10" fill={light} stroke={dark} strokeWidth="0.8" />

      {/* Volute bolts */}
      {[0, 60, 120, 180, 240, 300].map(angle => {
        const bx = 33 + 21 * Math.cos((angle * Math.PI) / 180);
        const by = 46 + 21 * Math.sin((angle * Math.PI) / 180);
        return <circle key={angle} cx={bx} cy={by} r="1.5" fill={veryDark} />;
      })}

      {/* Shaft / Coupling Guard */}
      <rect x="58" y="41" width="14" height="11" rx="2" fill="hsl(220 10% 60%)" stroke={dark} strokeWidth="0.8" />
      <rect x="60" y="39" width="10" height="15" rx="3" fill="none" stroke={dark} strokeWidth="0.6" strokeDasharray="2 1.5" />

      {/* Motor Body */}
      <rect x="72" y="26" width="55" height="40" rx="4" fill={body} stroke={dark} strokeWidth="1.5" />
      {[30, 34, 38, 42, 46, 50, 54, 58, 62].map(my => (
        <line key={my} x1="76" y1={my} x2="123" y2={my} stroke={dark} strokeWidth="0.5" opacity="0.4" />
      ))}
      <rect x="82" y="32" width="22" height="11" rx="1" fill="hsl(220 10% 70%)" stroke={dark} strokeWidth="0.4" />
      <rect x="104" y="24" width="16" height="12" rx="2" fill={dark} stroke={veryDark} strokeWidth="0.8" />

      {/* Status LED */}
      <circle cx="118" cy="46" r="3.5" fill={isRunning ? '#22c55e' : '#ef4444'}>
        {isRunning && <animate attributeName="opacity" values="1;0.5;1" dur="1s" repeatCount="indefinite" />}
      </circle>

      {/* Motor end cap */}
      <rect x="127" y="30" width="7" height="32" rx="2" fill={light} stroke={dark} strokeWidth="0.8" />

      {/* Rear Fan Guard */}
      <rect x="134" y="28" width="8" height="36" rx="3" fill="none" stroke={dark} strokeWidth="1" />
      {[32, 36, 40, 44, 48, 52, 56, 60].map(fy => (
        <line key={fy} x1="135" y1={fy} x2="141" y2={fy} stroke={dark} strokeWidth="0.6" opacity="0.5" />
      ))}
      <circle cx="138" cy="46" r="12" fill="none" stroke={dark} strokeWidth="0.8" opacity="0.4" />

      {/* Fan blades */}
      <g style={isRunning ? { animation: 'spin 0.8s linear infinite', transformOrigin: '138px 46px' } : { transformOrigin: '138px 46px' }}>
        <line x1="138" y1="46" x2="138" y2="36" stroke={dark} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        <line x1="138" y1="46" x2="129" y2="51" stroke={dark} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        <line x1="138" y1="46" x2="147" y2="51" stroke={dark} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        <line x1="138" y1="46" x2="131" y2="39" stroke={dark} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        <line x1="138" y1="46" x2="145" y2="39" stroke={dark} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      </g>
      <circle cx="138" cy="46" r="2.5" fill={light} stroke={dark} strokeWidth="0.5" />

      {/* Water flow when ON */}
      {isRunning && (
        <g>
          <circle r="1.5" fill="hsl(199 89% 55%)" opacity="0.6">
            <animate attributeName="cx" values="-2;3;8" dur="0.8s" repeatCount="indefinite" />
            <animate attributeName="cy" values="46;46.5;46" dur="0.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.7;0.4;0" dur="0.8s" repeatCount="indefinite" />
          </circle>
          <circle r="1.2" fill="hsl(199 89% 55%)" opacity="0.3">
            <animate attributeName="cx" values="20;33;46;33;20" dur="1.5s" repeatCount="indefinite" />
            <animate attributeName="cy" values="46;32;46;60;46" dur="1.5s" repeatCount="indefinite" />
          </circle>
          <circle r="2" fill="hsl(199 89% 55%)" opacity="0.7">
            <animate attributeName="cx" values="31;30;32" dur="1s" repeatCount="indefinite" />
            <animate attributeName="cy" values="14;6;-4" dur="1s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.8;0.4;0" dur="1s" repeatCount="indefinite" />
          </circle>
          <circle cx="33" cy="46" r="16" fill="hsl(199 89% 50%)" opacity="0.06">
            <animate attributeName="opacity" values="0.04;0.1;0.04" dur="2s" repeatCount="indefinite" />
          </circle>
        </g>
      )}

      {/* Base */}
      <rect x="5" y="76" width="55" height="5" rx="1" fill={dark} stroke={veryDark} strokeWidth="0.5" />
      <rect x="70" y="66" width="58" height="5" rx="1" fill={dark} stroke={veryDark} strokeWidth="0.5" />
      <rect x="2" y="81" width="145" height="5" rx="1" fill="hsl(220 10% 50%)" stroke={dark} strokeWidth="0.5" />
      {[14, 44, 84, 126].map(bx => <circle key={bx} cx={bx} cy="83.5" r="2.2" fill={veryDark} />)}
      <line x1="0" y1="87" x2="155" y2="87" stroke="hsl(var(--border))" strokeWidth="1" />

      {/* Label */}
      <text x="77" y="100" textAnchor="middle" fontSize="9" fontWeight="800" fill="hsl(var(--foreground))">{label}</text>
    </svg>
  );
};

// ────────────────────────────────────────────────────────────
// MAIN WTP PROCESS SIMULATION
// ────────────────────────────────────────────────────────────
const WtpProcessSimulation: React.FC = () => {
  const { wtpTags } = useScada();
  const findTag = (id: string) => wtpTags.find(t => t.id === id);

  // Extract tag values
  const flowInVal = findTag('WTP-Flow-IN')?.value ?? 0;
  const flowOutVal = findTag('WTP-Flow-OUT')?.value ?? 0;
  const ltBwVal = findTag('WTP-LT-BW')?.value ?? 0;
  const ltCwVal = findTag('WTP-LT-CW')?.value ?? 0;
  const phOutVal = findTag('WTP-PH')?.value ?? 0;
  const clOutVal = findTag('WTP-CL')?.value ?? 0;
  const taOutVal = findTag('WTP-TA')?.value ?? 0;
  const totVal = findTag('WTP-Totalizer')?.value ?? 0;
  const kwTag = findTag('WTP-KW');
  const kwVal = kwTag?.value ?? 0;
  const kwLive = useTagConnection(kwTag) === 'connected';

  const pt1Val = findTag('WTP-PT1')?.value ?? 0;
  const pt2Val = findTag('WTP-PT2')?.value ?? 0;

  const pump1On = pt1Val > 1.5;
  const pump2On = pt2Val > 1.5;
  const anyPumpOn = pump1On || pump2On;

  const combinedPtValFromTag = findTag('WTP-CombinedPT1')?.value ?? 0;
  const combinedPt = useMemo(() => {
    if (combinedPtValFromTag > 0.05) return combinedPtValFromTag;
    if (pump1On && pump2On) return (pt1Val + pt2Val) / 2;
    if (pump1On) return pt1Val;
    if (pump2On) return pt2Val;
    return 0;
  }, [combinedPtValFromTag, pump1On, pump2On, pt1Val, pt2Val]);

  // Cross-logic
  const waterFlowing = flowInVal > 0.1;
  const chlorinationOn = waterFlowing || anyPumpOn || ltCwVal > 5;

  // Visual Constants
  const pBody = 'hsl(220 60% 42%)';
  const pDark = 'hsl(220 65% 32%)';
  const pVDark = 'hsl(220 70% 22%)';
  const pLight = 'hsl(220 55% 52%)';
  const pipeW = 18;

  // ═══ LAYOUT POSITIONS ═══
  const SVG_W = 2200, SVG_H = 1570;

  const inletPipeY = 200;
  const efmInX = -90;

  // Process tanks row - more compact, better connected
  const processY = 280;
  const mixerX = 340, mixerW = 90, mixerH = 150;
  const flocX = 500, flocW = 130, flocH = 150;
  const settleX = 700, settleW = 210, settleH = 150;
  const filterX = 980, filterW = 170, filterH = 150;

  // Backwash tank layout mathematically synced to Filter boundaries
  const bwTankX = 980, bwTankY = 85, bwTankW = 119, bwTankH = 135;

  // CWR - shifted right for more space
  const cwrX = 1280, cwrY = processY - 10, cwrW = 190, cwrH = 170;

  // Discharge headers
  const headerY = 850;

  // HT Pumps
  const pumpRowY = 1010;
  const pumpH = 95;
  const pumpW = 155;
  const pump1X = 350, pump2X = 850;
  const pumpOutletOffsetX = (31 / 155) * pumpW;
  const pumpInletCenterY = pumpRowY + (46.5 / 105) * pumpH;

  // Header 1 (Pump1+2)
  const p1OutX = pump1X + pumpOutletOffsetX;
  const p2OutX = pump2X + pumpOutletOffsetX;
  const headerStartX = p1OutX - 30;
  const headerEndX = p2OutX + 30;

  // Combined PT gauge ABOVE the header
  const comGaugeR = 48;
  const comGaugeX = 631;
  const comGaugeCenterY = headerY - 80; // well above header

  // Merge point where vertical riser joins the horizontal header
  const mergeY = headerY - 180; // 670

  // PT individual gauges - below pumps
  const ptGaugeY = pumpRowY + pumpH + 145;
  const ptGaugeR = 50;

  // Energy meter - left side
  const energyMeterX = 60;
  const energyMeterY = pumpRowY - 30;

  // Outlet EFM and Analyzers
  const outletEfmX = 1590;
  const outletAnalyzerX = 1700;
  const outletAnalyzerW = 130;
  const outletAnalyzerH = 168;

  // Totalizer
  const totalizerX = outletEfmX;
  const totalizerY = mergeY + 160;

  // Ground
  const groundY = 1490;

  // CWR drop pipe position
  const cwrDropPipeX = cwrX + 30;

  // CW Level
  const cwLevelPct = Math.min(100, Math.max(0, ltCwVal));
  const cwFillH = (cwLevelPct / 100) * cwrH;
  const cwWaterY = cwrY + cwrH - cwFillH;

  // BW Level
  const bwLevelPct = Math.min(100, Math.max(0, ltBwVal));
  const bwFillH = (bwLevelPct / 100) * bwTankH;

  // Pipe drawing helpers
  const drawPipe = (d: string, w: number = pipeW, round: boolean = true) => (
    <g>
      <path d={d} fill="none" stroke={pVDark} strokeWidth={w + 3} strokeLinecap={round ? "round" : "butt"} strokeLinejoin="round" />
      <path d={d} fill="none" stroke={pDark} strokeWidth={w} strokeLinecap={round ? "round" : "butt"} strokeLinejoin="round" />
      <path d={d} fill="none" stroke={pBody} strokeWidth={w * 0.65} strokeLinecap={round ? "round" : "butt"} strokeLinejoin="round" />
      <path d={d} fill="none" stroke={pLight} strokeWidth={w * 0.2} strokeLinecap={round ? "round" : "butt"} strokeLinejoin="round" opacity={0.5} />
    </g>
  );

  const drawWaterColumn = (d: string, w: number = pipeW, opacity: number = 0.8) => {
    return (
      <path
        d={d}
        fill="none"
        stroke="#38bdf8" // Beautiful sky blue water column background
        strokeWidth={w * 0.55} // Centered inside the pipe
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={opacity}
      />
    );
  };

  const drawWaterFlow = (d: string, flow: number, active: boolean = true) => {
    if (!active || flow <= 0.05) return null;
    const pNorm = Math.min(1, Math.max(0.1, flow / 100));
    const durFast = (2.4 - pNorm * 1.6).toFixed(2) + 's';
    const durSlow = (3.6 - pNorm * 2.0).toFixed(2) + 's';
    const dashA = 55, gapA = 22, cycleA = dashA + gapA;
    const dashB = 30, gapB = 60, cycleB = dashB + gapB;
    const sw = Math.max(3, pipeW * 0.32);
    return (
      <g opacity="0.95">
        <path d={d} fill="none" stroke="#f0f9ff" strokeWidth={sw}
          strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${dashA} ${gapA}`} opacity="0.85">
          <animate attributeName="stroke-dashoffset" from={cycleA} to="0" dur={durFast} repeatCount="indefinite" calcMode="linear" />
        </path>
        <path d={d} fill="none" stroke="#ffffff" strokeWidth={sw * 0.45}
          strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${dashB} ${gapB}`} opacity="0.55">
          <animate attributeName="stroke-dashoffset" from={cycleB} to="0" dur={durSlow} repeatCount="indefinite" calcMode="linear" />
        </path>
      </g>
    );
  };

  // Level bar helper
  const drawLevelBar = (lx: number, ly: number, lw: number, lh: number, level: number, lLabel: string, color: string) => {
    const fillH = (Math.min(100, Math.max(0, level)) / 100) * lh;
    const statusColor = level >= 70 ? 'hsl(var(--success))' : level >= 40 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))';
    const statusText = level >= 70 ? 'GOOD' : level >= 40 ? 'MED' : level > 0 ? 'LOW' : 'EMPTY';
    return (
      <g>
        <text x={lx + lw / 2} y={ly - 10} textAnchor="middle" fontSize="12" fontWeight="800" fill="hsl(var(--foreground))">{lLabel}</text>
        <rect x={lx} y={ly} width={lw} height={lh} rx={5} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1.5" />
        <rect x={lx + 2.5} y={ly + lh - fillH} width={lw - 5} height={fillH} rx={3.5} fill={color} opacity="0.8">
          <animate attributeName="opacity" values="0.75;0.9;0.75" dur="3s" repeatCount="indefinite" />
        </rect>
        {[70, 40].map((th, i) => {
          const my = ly + lh - (th / 100) * lh;
          return <line key={th} x1={lx - 2} y1={my} x2={lx + lw + 2} y2={my} stroke={i === 0 ? 'hsl(var(--success))' : 'hsl(var(--warning))'} strokeWidth="1" strokeDasharray="3 2" opacity="0.6" />;
        })}
        {[0, 25, 50, 75, 100].map(p => {
          const my = ly + lh - (p / 100) * lh;
          return (
            <g key={p}>
              <line x1={lx + lw} y1={my} x2={lx + lw + 6} y2={my} stroke="hsl(var(--muted-foreground))" strokeWidth="1" />
              <text x={lx + lw + 9} y={my + 3} textAnchor="start" fontSize="9" fill="hsl(var(--muted-foreground))" fontFamily="ui-monospace, monospace">{p}%</text>
            </g>
          );
        })}
        <rect x={lx - 6} y={ly + lh + 6} width={lw + 12} height={40} rx={5} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" />
        <text x={lx + lw / 2} y={ly + lh + 23} textAnchor="middle" fontSize="14" fontWeight="800" fill="hsl(var(--foreground))" fontFamily="ui-monospace, monospace">{level.toFixed(1)}%</text>
        <text x={lx + lw / 2} y={ly + lh + 38} textAnchor="middle" fontSize="10" fontWeight="900" fill={statusColor}>{statusText}</text>
      </g>
    );
  };

  // Chlorination pipe path - properly connected with smooth Q-curve bends
  const filterOutY = processY + filterH - 30; // 120
  const chlorinationTapX = cwrX + 60; // Dosing point on top of CWR
  const pipeRiserX = 1220; // Constant riser position for the blue inlet pipe
  const pipeR = 18; // bend radius
  const filterToCwrPath = `M ${filterX + filterW} ${filterOutY} L ${pipeRiserX - pipeR} ${filterOutY} Q ${pipeRiserX} ${filterOutY} ${pipeRiserX} ${filterOutY - pipeR} L ${pipeRiserX} ${processY - 10 + pipeR} Q ${pipeRiserX} ${processY - 10} ${pipeRiserX + pipeR} ${processY - 10} L ${cwrX + 8 - pipeR} ${processY - 10} Q ${cwrX + 8} ${processY - 10} ${cwrX + 8} ${processY - 10 + pipeR}`;

  // Pump riser paths
  const pumpCenters = [pump1X, pump2X];
  const pumpOns = [pump1On, pump2On];
  const ptVals = [pt1Val, pt2Val];
  const ptLabels = ['PT 01', 'PT 02'];

  // Suction header - centered on pump inlet
  const suctionY = pumpInletCenterY;

  // Outlet pipe from merge point to right end
  const outletPipeEndX = 2100;

  return (
    <div className="w-full premium-card rounded-xl p-3 md:p-5 animate-fade-in overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
      <SensorStatusStrip
        tags={wtpTags}
        sensorIds={[
          'WTP-Flow-IN','WTP-Flow-OUT','WTP-LT-BW','WTP-LT-CW','WTP-PH','WTP-CL','WTP-TA',
          'WTP-Totalizer','WTP-KW','WTP-PT1','WTP-PT2','WTP-CombinedPT1','WTP-PT5'
        ]}
      />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <svg viewBox={`-450 0 ${SVG_W + 450} ${SVG_H}`} className="w-full h-auto" style={{ maxHeight: '90vh', minWidth: '700px' }}>
        <defs>
          <linearGradient id="wtp-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0369a1" />
          </linearGradient>
          <linearGradient id="wtp-raw-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a3e635" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#65a30d" stopOpacity="0.8" />
          </linearGradient>
          <linearGradient id="wtp-concrete" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#64748b" />
            <stop offset="30%" stopColor="#94a3b8" />
            <stop offset="70%" stopColor="#cbd5e1" />
            <stop offset="100%" stopColor="#64748b" />
          </linearGradient>
          <linearGradient id="wtp-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#475569" />
          </linearGradient>
          <linearGradient id="wtp-header-pipe" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={pVDark} />
            <stop offset="25%" stopColor={pDark} />
            <stop offset="50%" stopColor={pBody} />
            <stop offset="75%" stopColor={pDark} />
            <stop offset="100%" stopColor={pVDark} />
          </linearGradient>
          <clipPath id="wtp-cwr-clip">
            <rect x={cwrX} y={cwrY} width={cwrW} height={cwrH} />
          </clipPath>
          <clipPath id="wtp-settle-clip">
            <rect x={settleX} y={processY} width={settleW} height={settleH} />
          </clipPath>
        </defs>

        {/* ═══ TITLE ═══ */}
        <text x={850} y={30} textAnchor="middle" fontSize="32" fontWeight="900" fill="hsl(var(--foreground))" letterSpacing="2px">
          WATER TREATMENT PLANT — PROCESS FLOW
        </text>
        <text x={850} y={52} textAnchor="middle" fontSize="16" fontWeight="600" fill="hsl(var(--muted-foreground))">
          Bua Bicchiya WTP | AMRUT 2.0 | Live SCADA Mimic
        </text>

        {/* ═══ GROUND ═══ */}
        <rect x={-430} y={groundY} width={SVG_W + 410} height={16} rx={3} fill="url(#wtp-ground)" stroke="#475569" strokeWidth="1" />

        {/* ═══ SECTION 1: RAW WATER INLET ═══ */}
        <g>
          <rect x={-390} y={inletPipeY - 45} width={130} height={28} rx={6} fill="hsl(var(--primary) / 0.1)" stroke="hsl(var(--primary) / 0.4)" strokeWidth="1" />
          <text x={-325} y={inletPipeY - 26} textAnchor="middle" fontSize="12" fontWeight="800" fill="hsl(var(--primary))">← FROM INTAKE</text>

          {/* Main inlet pipe - continuous from left edge (rounded for symmetry) */}
          {drawPipe(`M -430 ${inletPipeY} L ${mixerX - 50} ${inletPipeY} Q ${mixerX - 25} ${inletPipeY} ${mixerX - 25} ${inletPipeY + 25} L ${mixerX - 25} ${processY + 120 - 25} Q ${mixerX - 25} ${processY + 120} ${mixerX} ${processY + 120}`, pipeW, true)}
          {drawWaterFlow(`M -430 ${inletPipeY} L ${mixerX - 50} ${inletPipeY} Q ${mixerX - 25} ${inletPipeY} ${mixerX - 25} ${inletPipeY + 25} L ${mixerX - 25} ${processY + 120 - 25} Q ${mixerX - 25} ${processY + 120} ${mixerX} ${processY + 120}`, flowInVal, flowInVal > 0)}

          {/* EFM IN */}
          {(() => {
            const hTop = inletPipeY - 95;
            const hW = 90, hH = 55, nW = 24;
            return (
              <g>
                <text x={efmInX} y={hTop - 14} textAnchor="middle" fontSize="15" fontWeight="800" fill="hsl(var(--foreground))">EFM IN</text>
                <polygon points={`${efmInX - hW / 2 + 5},${hTop} ${efmInX + hW / 2 - 5},${hTop} ${efmInX + hW / 2},${hTop + 12} ${efmInX - hW / 2},${hTop + 12}`}
                  fill="hsl(199 89% 48% / 0.85)" stroke="hsl(var(--border))" strokeWidth="1" />
                <rect x={efmInX - hW / 2} y={hTop + 12} width={hW} height={hH} rx={5} fill="hsl(199 89% 48% / 0.9)" stroke="hsl(var(--border))" strokeWidth="1.2" />
                <rect x={efmInX - 32} y={hTop + 22} width={64} height={30} rx={3} fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="0.8" />
                <rect x={efmInX - 30} y={hTop + 24} width={60} height={26} rx={2} fill="hsl(142 71% 45% / 0.08)" />
                <text x={efmInX} y={hTop + 43} textAnchor="middle" fill="hsl(var(--foreground))" style={{ fontSize: '16px', fontFamily: 'ui-monospace, monospace', fontWeight: 800 }}>
                  {flowInVal.toFixed(2)}
                </text>
                {/* Neck connects to pipe */}
                <rect x={efmInX - nW / 2} y={hTop + 12 + hH} width={nW} height={inletPipeY - (hTop + 12 + hH) - pipeW / 2} fill="#64748b" stroke="#475569" strokeWidth="1" />
                <rect x={efmInX - nW / 2 - 5} y={inletPipeY - pipeW / 2 - 3} width={nW + 10} height={7} rx={2} fill={pVDark} />

                <rect x={efmInX - 80} y={inletPipeY + 24} width={160} height={44} rx={8} fill="hsl(199 89% 48% / 0.06)" stroke="hsl(199 89% 48% / 0.4)" strokeWidth="1" />
                <text x={efmInX} y={inletPipeY + 39} textAnchor="middle" fontSize="11" fontWeight="700" fill="hsl(199 89% 55%)" letterSpacing="0.8px">FLOW RATE</text>
                <text x={efmInX} y={inletPipeY + 58} textAnchor="middle" fontSize="20" fontWeight="900" fill="hsl(var(--foreground))" fontFamily="ui-monospace">
                  {flowInVal.toFixed(1)} <tspan fontSize="11" fill="hsl(var(--muted-foreground))" fontWeight="600">m³/h</tspan>
                </text>
              </g>
            );
          })()}


        </g>

        {/* ═══ SECTION 2: FLASH MIXER ═══ */}
        <g>
          <rect x={mixerX} y={processY} width={mixerW} height={mixerH} rx={3}
            fill="url(#wtp-concrete)" stroke={waterFlowing ? '#22c55e' : '#475569'} strokeWidth={waterFlowing ? 2.5 : 2} />
          <rect x={mixerX + 15} y={processY - 40} width={mixerW - 30} height={35} rx={4}
            fill="hsl(280 60% 45%)" stroke="hsl(280 70% 30%)" strokeWidth="1.5" />
          <text x={mixerX + mixerW / 2} y={processY - 20} textAnchor="middle" fontSize="9" fontWeight="700" fill="white" letterSpacing="0.5px">COAG</text>
          <line x1={mixerX + mixerW / 2} y1={processY - 5} x2={mixerX + mixerW / 2} y2={processY + 10} stroke="hsl(280 60% 45%)" strokeWidth="3" strokeDasharray="4 3" />
          <line x1={mixerX + mixerW / 2} y1={processY - 5} x2={mixerX + mixerW / 2} y2={processY + mixerH * 0.65}
            stroke="#64748b" strokeWidth="4" />
          <g transform={`translate(${mixerX + mixerW / 2}, ${processY + mixerH * 0.55})`}>
            <line x1={-22} y1={0} x2={22} y2={0} stroke="#64748b" strokeWidth="3">
              {waterFlowing && <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1.5s" repeatCount="indefinite" />}
            </line>
            <line x1={0} y1={-22} x2={0} y2={22} stroke="#64748b" strokeWidth="3">
              {waterFlowing && <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1.5s" repeatCount="indefinite" />}
            </line>
          </g>
          <rect x={mixerX + 4} y={processY + 20} width={mixerW - 8} height={mixerH - 24} rx={2} fill="url(#wtp-raw-water)" opacity="0.5" />
          <text x={mixerX + mixerW / 2} y={processY + mixerH + 20} textAnchor="middle" fontSize="12" fontWeight="800" fill="hsl(var(--foreground))">FLASH</text>
          <text x={mixerX + mixerW / 2} y={processY + mixerH + 34} textAnchor="middle" fontSize="12" fontWeight="800" fill="hsl(var(--foreground))">MIXER</text>
          <StatusBadge x={mixerX + mixerW / 2} y={processY + mixerH + 40} isOn={waterFlowing} />
          {/* Pipe: Mixer → Flocculator (properly connected boundary to boundary) */}
          {drawPipe(`M ${mixerX + mixerW} ${processY + 120} L ${flocX} ${processY + 120}`, pipeW, false)}
          {drawWaterFlow(`M ${mixerX + mixerW} ${processY + 120} L ${flocX} ${processY + 120}`, flowInVal, flowInVal > 0)}
        </g>

        {/* ═══ SECTION 3: FLOCCULATOR ═══ */}
        <g>
          <rect x={flocX} y={processY} width={flocW} height={flocH} rx={3}
            fill="url(#wtp-concrete)" stroke={waterFlowing ? '#22c55e' : '#475569'} strokeWidth={waterFlowing ? 2.5 : 2} />
          {[0.25, 0.5, 0.75].map((f, i) => (
            <line key={i} x1={flocX + flocW * f} y1={processY + 8} x2={flocX + flocW * f} y2={processY + flocH - (i % 2 === 0 ? 8 : 25)}
              stroke="#475569" strokeWidth="3" />
          ))}
          {[0.35, 0.65].map((f, i) => (
            <g key={i} transform={`translate(${flocX + flocW * f}, ${processY + flocH * 0.6})`}>
              <line x1={-12} y1={0} x2={12} y2={0} stroke="#64748b" strokeWidth="2.5">
                {waterFlowing && <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="4s" repeatCount="indefinite" />}
              </line>
            </g>
          ))}
          <rect x={flocX + 4} y={processY + 15} width={flocW - 8} height={flocH - 19} rx={2} fill="url(#wtp-raw-water)" opacity="0.4" />
          <text x={flocX + flocW / 2} y={processY + flocH + 20} textAnchor="middle" fontSize="12" fontWeight="800" fill="hsl(var(--foreground))">FLOCCULATOR</text>
          <StatusBadge x={flocX + flocW / 2} y={processY + flocH + 28} isOn={waterFlowing} />
          {/* Pipe: Floc → Settling (properly connected boundary to boundary) */}
          {drawPipe(`M ${flocX + flocW} ${processY + 120} L ${settleX} ${processY + 120}`, pipeW, false)}
          {drawWaterFlow(`M ${flocX + flocW} ${processY + 120} L ${settleX} ${processY + 120}`, flowInVal, flowInVal > 0)}
        </g>

        {/* ═══ SECTION 4: SETTLING TANK ═══ */}
        <g>
          <rect x={settleX} y={processY} width={settleW} height={settleH} rx={3}
            fill="url(#wtp-concrete)" stroke={waterFlowing ? '#22c55e' : '#475569'} strokeWidth={waterFlowing ? 2.5 : 2} />
          {/* Hopper */}
          <path d={`M ${settleX + 10} ${processY + settleH} L ${settleX + settleW / 2} ${processY + settleH + 40} L ${settleX + settleW - 10} ${processY + settleH}`}
            fill="url(#wtp-concrete)" stroke="#475569" strokeWidth="2" />

          <g clipPath="url(#wtp-settle-clip)">
            <rect x={settleX + 4} y={processY + settleH - 25} width={settleW - 8} height={25} fill="#92400e" opacity="0.3" />
            <rect x={settleX + 4} y={processY + settleH * 0.4} width={settleW - 8} height={settleH * 0.35} fill="#a3e635" opacity="0.15" />
            <rect x={settleX + 4} y={processY + 10} width={settleW - 8} height={settleH * 0.35} fill="#38bdf8" opacity="0.2" />
          </g>
          <rect x={settleX + settleW - 30} y={processY + 15} width={20} height={8} rx={2} fill="#cbd5e1" stroke="#64748b" strokeWidth="1" />

          <text x={settleX + settleW / 2} y={processY + settleH + 54} textAnchor="middle" fontSize="12" fontWeight="800" fill="hsl(var(--foreground))">SLUDGE SETTLING TANK</text>
          <StatusBadge x={settleX + settleW / 2} y={processY + settleH + 68} isOn={waterFlowing} />
          {/* Pipe: Settling → Filters (properly connected boundary to boundary) */}
          {drawPipe(`M ${settleX + settleW} ${processY + 120} L ${filterX} ${processY + 120}`, pipeW, false)}
          {drawWaterFlow(`M ${settleX + settleW} ${processY + 120} L ${filterX} ${processY + 120}`, flowInVal, flowInVal > 0)}
        </g>

        {/* ═══ SECTION 5: RAPID SAND FILTERS + BACKWASH TANK ═══ */}
        <g>
          <rect x={filterX} y={processY} width={filterW} height={filterH} rx={3}
            fill="url(#wtp-concrete)" stroke={waterFlowing ? '#22c55e' : '#475569'} strokeWidth={waterFlowing ? 2.5 : 2} />
          <rect x={filterX + 8} y={processY + 10} width={filterW - 16} height={filterH * 0.3} fill="#38bdf8" opacity="0.2" rx={2} />
          <text x={filterX + filterW / 2} y={processY + filterH * 0.22} textAnchor="middle" fontSize="9" fill="hsl(var(--muted-foreground))">WATER</text>
          <rect x={filterX + 8} y={processY + filterH * 0.4} width={filterW - 16} height={filterH * 0.25} fill="#d4a574" opacity="0.5" rx={2} />
          <text x={filterX + filterW / 2} y={processY + filterH * 0.55} textAnchor="middle" fontSize="9" fill="hsl(var(--muted-foreground))">SAND</text>
          <rect x={filterX + 8} y={processY + filterH * 0.7} width={filterW - 16} height={filterH * 0.25} fill="#a8a29e" opacity="0.5" rx={2} />
          <text x={filterX + filterW / 2} y={processY + filterH * 0.85} textAnchor="middle" fontSize="9" fill="hsl(var(--muted-foreground))">GRAVEL</text>

          <text x={filterX + filterW / 2} y={processY + filterH + 20} textAnchor="middle" fontSize="12" fontWeight="800" fill="hsl(var(--foreground))">RAPID SAND FILTERS</text>
          <StatusBadge x={filterX + filterW / 2} y={processY + filterH + 28} isOn={waterFlowing} />

          {/* Backwash Tank - right side of filter */}
          <rect x={bwTankX} y={bwTankY} width={bwTankW} height={bwTankH} rx={4}
            fill="url(#wtp-concrete)" stroke="#334155" strokeWidth="2" />
          <rect x={bwTankX + 4} y={bwTankY + bwTankH - bwFillH} width={bwTankW - 8} height={bwFillH} rx={3} fill="#f59e0b" opacity="0.5">
            <animate attributeName="opacity" values="0.4;0.6;0.4" dur="3s" repeatCount="indefinite" />
          </rect>
          <text x={bwTankX + bwTankW / 2} y={bwTankY - 10} textAnchor="middle" fontSize="10" fontWeight="800" fill="hsl(var(--foreground))">BACKWASH</text>
          {/* Thin flush connecting pipe visually anchored boundary-to-boundary */}
          {drawPipe(`M ${filterX + 12} ${processY} L ${filterX + 12} ${bwTankY + bwTankH}`, 10, false)}
          {drawLevelBar(bwTankX + bwTankW + 14, bwTankY, 32, bwTankH, ltBwVal, "LT-BW", "#f59e0b")}
        </g>

        {/* ═══ SECTION 6: CHLORINATION ═══ */}
        <g>
          <StatusBadge x={chlorinationTapX} y={processY - 132} isOn={chlorinationOn} />
          <text x={chlorinationTapX} y={processY - 96} textAnchor="middle" fontSize="11" fontWeight="800" fill="hsl(var(--foreground))">CHLORINATION</text>
          {/* Chlorination dosing unit */}
          <rect x={chlorinationTapX - 25} y={processY - 80} width={50} height={35} rx={4}
            fill={chlorinationOn ? "hsl(142 71% 45%)" : "hsl(142 71% 45% / 0.4)"} stroke="hsl(142 80% 30%)" strokeWidth="1.5" />
          <text x={chlorinationTapX} y={processY - 59} textAnchor="middle" fontSize="9" fontWeight="700" fill="white" letterSpacing="0.5px">Cl₂</text>
          {/* Dosing pipe connecting directly to CWR roof */}
          {chlorinationOn ? (
            <line x1={chlorinationTapX} y1={processY - 45} x2={chlorinationTapX} y2={cwrY - 2} stroke="hsl(142 71% 45%)" strokeWidth="3" strokeDasharray="4 3">
              <animate attributeName="strokeDashoffset" from="7" to="0" dur="0.8s" repeatCount="indefinite" />
            </line>
          ) : (
            <line x1={chlorinationTapX} y1={processY - 45} x2={chlorinationTapX} y2={cwrY - 2} stroke="hsl(142 71% 45% / 0.3)" strokeWidth="3" strokeDasharray="4 3" />
          )}
        </g>

        {/* ═══ SECTION 8: SUCTION PIPE (CWR → Pumps) ═══ */}
        <g>
          {/* Continuous suction pipe from CWR to all pumps with a smooth 90-degree corner */}
          {(() => {
            const bendR = 35;
            const fullSuctionPath = `M ${cwrDropPipeX} ${cwrY + cwrH - 15} L ${cwrDropPipeX} ${suctionY - bendR} Q ${cwrDropPipeX} ${suctionY} ${cwrDropPipeX - bendR} ${suctionY} L ${pump1X - 20} ${suctionY}`;
            return (
              <>
                {drawPipe(fullSuctionPath, pipeW)}
                {drawWaterColumn(fullSuctionPath, pipeW)}
                {anyPumpOn && drawWaterFlow(fullSuctionPath, 50, true)}
              </>
            );
          })()}

          {/* End cap on left side of suction header */}
          <ellipse cx={pump1X - 20} cy={suctionY} rx={3} ry={pipeW / 2 + 2} fill={pVDark} opacity="0.7" />

          {/* Suction stubs from header down to each pump inlet with smooth T-bends */}
          {pumpCenters.map((px, i) => {
            const inletX = px + 5;
            const stubW = pipeW * 0.7;
            return (
              <g key={`suction-stub-${i}`}>
                {drawPipe(`M ${inletX} ${suctionY} L ${inletX} ${pumpInletCenterY}`, stubW)}
                {drawWaterColumn(`M ${inletX} ${suctionY} L ${inletX} ${pumpInletCenterY}`, stubW)}
                {pumpOns[i] && drawWaterFlow(`M ${inletX} ${suctionY} L ${inletX} ${pumpInletCenterY}`, 50, true)}
              </g>
            );
          })}
        </g>

        {/* ═══ SECTION 7: CLEAR WATER RESERVOIR ═══ */}
        <g>
          {/* Inflow Pipe: Filter → Chlorination → CWR (Drawn with rounded end for consistency) */}
          {drawPipe(filterToCwrPath, pipeW, true)}
          {drawWaterColumn(filterToCwrPath, pipeW)}
          {drawWaterFlow(filterToCwrPath, flowInVal, flowInVal > 0)}

          <rect x={cwrX} y={cwrY} width={cwrW} height={cwrH} rx={4}
            fill="url(#wtp-concrete)" stroke="#334155" strokeWidth="2.5" />
          <g clipPath="url(#wtp-cwr-clip)">
            <rect x={cwrX} y={cwWaterY} width={cwrW} height={cwFillH} fill="url(#wtp-water)" opacity="0.85" className="transition-all duration-1000 ease-in-out" />
            {cwLevelPct > 0 && (
              <path fill="#38bdf8" opacity="0.5">
                <animate attributeName="d" dur="3s" repeatCount="indefinite"
                  values={`M ${cwrX} ${cwWaterY + 4} Q ${cwrX + cwrW * 0.25} ${cwWaterY - 4} ${cwrX + cwrW * 0.5} ${cwWaterY + 4} T ${cwrX + cwrW} ${cwWaterY + 4} L ${cwrX + cwrW} ${cwWaterY + 15} L ${cwrX} ${cwWaterY + 15} Z;M ${cwrX} ${cwWaterY + 4} Q ${cwrX + cwrW * 0.25} ${cwWaterY + 10} ${cwrX + cwrW * 0.5} ${cwWaterY + 4} T ${cwrX + cwrW} ${cwWaterY + 4} L ${cwrX + cwrW} ${cwWaterY + 15} L ${cwrX} ${cwWaterY + 15} Z;M ${cwrX} ${cwWaterY + 4} Q ${cwrX + cwrW * 0.25} ${cwWaterY - 4} ${cwrX + cwrW * 0.5} ${cwWaterY + 4} T ${cwrX + cwrW} ${cwWaterY + 4} L ${cwrX + cwrW} ${cwWaterY + 15} L ${cwrX} ${cwWaterY + 15} Z`} />
              </path>
            )}
          </g>
          <line x1={cwrX} y1={cwrY} x2={cwrX} y2={cwrY + cwrH} stroke="#475569" strokeWidth="2.5" />
          <line x1={cwrX + cwrW} y1={cwrY} x2={cwrX + cwrW} y2={cwrY + cwrH} stroke="#475569" strokeWidth="2.5" />

          {/* CWR LCD panel */}
          <rect x={cwrX + cwrW / 2 - 60} y={cwrY + 10} width={120} height={56} rx={5} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1.5" opacity="0.92" />
          <rect x={cwrX + cwrW / 2 - 56} y={cwrY + 14} width={112} height={48} rx={3} fill="hsl(var(--background))" opacity="0.95" />
          <text x={cwrX + cwrW / 2} y={cwrY + 28} textAnchor="middle" fontSize="9" fontWeight="700" fill="hsl(var(--muted-foreground))" fontFamily="ui-monospace, monospace" letterSpacing="1.2px">CWR LEVEL</text>
          {(() => {
            const cwStatusColor = cwLevelPct >= 70 ? 'hsl(var(--success))' : cwLevelPct >= 40 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))';
            const cwStatusText = cwLevelPct >= 70 ? 'GOOD' : cwLevelPct >= 40 ? 'MEDIUM' : cwLevelPct > 0 ? 'LOW' : 'EMPTY';
            return (
              <>
                <text x={cwrX + cwrW / 2} y={cwrY + 50} textAnchor="middle" fontSize="22" fontWeight="800" fill={cwStatusColor} fontFamily="ui-monospace, monospace">
                  {ltCwVal.toFixed(1)}<tspan fontSize="12" fill="hsl(var(--muted-foreground))"> %</tspan>
                </text>
                <text x={cwrX + cwrW / 2} y={cwrY + 62} textAnchor="middle" fontSize="9" fontWeight="900" fill={cwStatusColor}>{cwStatusText}</text>
              </>
            );
          })()}

          {/* CWR label rendered later (after pipes) to prevent overlap */}
          {drawLevelBar(cwrX + cwrW + 18, cwrY, 34, cwrH, ltCwVal, "LT-CW", "#0ea5e9")}


        </g>


        {/* ═══ COMBINED PRESSURE GAUGES ABOVE Headers ═══ */}
        <g>
          <Gauge cx={comGaugeX} cy={comGaugeCenterY} r={comGaugeR} value={combinedPt} min={0} max={10} label="PT COM" unit="Bar" />
        </g>

        {/* ═══ SECTION 10: DISCHARGE HEADER + RISERS + MERGE ═══ */}
        <g>
          {(() => {
            const hCY = headerY;
            const hPW = 28;
            const bendR = 24;
            const riseTopY = mergeY;
            const headerPumpsOn = pump1On || pump2On;
            const cornerR = 24; // 90-degree corner radius

            // Main Thick Header Pipe (Visual): From headerStartX horizontally to headerEndX, then curving UP to mergeY, then curving RIGHT to outletPipeEndX
            const mainHeaderVis = `M ${headerStartX} ${hCY} L ${headerEndX - cornerR} ${hCY} Q ${headerEndX} ${hCY} ${headerEndX} ${hCY - cornerR} L ${headerEndX} ${riseTopY + bendR} Q ${headerEndX} ${riseTopY} ${headerEndX + bendR} ${riseTopY} L ${outletPipeEndX + 20} ${riseTopY}`;

            // --- Flow Path ---
            const mainFlow = `M ${headerStartX} ${hCY} L ${headerEndX - cornerR} ${hCY} Q ${headerEndX} ${hCY} ${headerEndX} ${hCY - cornerR} L ${headerEndX} ${riseTopY + bendR} Q ${headerEndX} ${riseTopY} ${headerEndX + bendR} ${riseTopY} L ${outletPipeEndX + 20} ${riseTopY}`;

            return (
              <g>
                {/* Risers from each pump outlet to header - buried behind header and behind pump for flush finish */}
                {pumpCenters.map((px, i) => {
                  const outletX = px + pumpOutletOffsetX + 4;
                  const pumpOutletTopY = pumpRowY;
                  const headerBottomEdge = hCY + hPW / 2;
                  // Start slightly inside pump body (+5px) to hide rounded cap behind pump component
                  const riserPath = `M ${outletX} ${pumpOutletTopY + 5} L ${outletX} ${headerBottomEdge}`;
                  return (
                    <g key={`riser-${i}`}>
                      {drawPipe(riserPath, pipeW)}
                      {pumpOns[i] && drawWaterColumn(riserPath, pipeW)}
                      {pumpOns[i] && drawWaterFlow(riserPath, 50, true)}
                    </g>
                  );
                })}

                {/* Draw header pipe AFTER risers so they overlap the rounded ends */}
                {drawPipe(mainHeaderVis, hPW)}
                {drawWaterColumn(mainHeaderVis, hPW)}

                {/* End caps on outer ends of the manifolds (corners don't need caps) */}
                <ellipse cx={headerStartX} cy={hCY} rx={3} ry={hPW / 2 + 2} fill={pVDark} opacity="0.7" />

                {/* Water flow segmented cleanly to avoid overlaps */}
                {headerPumpsOn && drawWaterFlow(mainFlow, flowOutVal || 50, true)}

                {/* Header label - below header */}
                <rect x={635 - 75} y={hCY + hPW / 2 + 8} width={150} height={18} rx={4} fill="hsl(var(--background))" opacity="0.9" />
                <text x={635} y={hCY + hPW / 2 + 21} textAnchor="middle" fontSize="10" fontWeight="800" fill="hsl(var(--muted-foreground))">DISCHARGE HEADER</text>

                {/* PTCOM connector - thin vertical impulse line from gauge to horizontal header */}
                <line x1={comGaugeX} y1={comGaugeCenterY + comGaugeR + 8} x2={comGaugeX} y2={hCY - hPW / 2}
                  stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
                <circle cx={comGaugeX} cy={comGaugeCenterY + comGaugeR + 8} r="2.5" fill="hsl(var(--muted-foreground))" opacity="0.8" />
                <circle cx={comGaugeX} cy={hCY - hPW / 2} r="2.5" fill="hsl(var(--muted-foreground))" opacity="0.8" />
              </g>
            );
          })()}

          {/* TO OHTs label */}
          <rect x={outletPipeEndX - 170} y={mergeY - 45} width={150} height={22} rx={6} fill="hsl(var(--success) / 0.1)" stroke="hsl(var(--success) / 0.4)" strokeWidth="1" />
          <text x={outletPipeEndX - 95} y={mergeY - 30} textAnchor="middle" fontSize="12" fontWeight="800" fill="hsl(var(--success))">TO OHTs →</text>
        </g>

        {/* ═══ CWR LABEL ═══ */}
        <g>
          <text x={cwrX + cwrW / 2 + 6} y={cwrY + cwrH + 18} textAnchor="middle" fontSize="12" fontWeight="800" fill="hsl(var(--foreground))">
            <tspan x={cwrX + cwrW / 2 + 6} dy="0">CLEAR WATER</tspan>
            <tspan x={cwrX + cwrW / 2 + 6} dy="16">RESERVOIR</tspan>
          </text>
        </g>

        {/* ═══ HT PUMPS × 2 ═══ */}
        <InlineHTPump x={pump1X} y={pumpRowY} w={pumpW} h={pumpH} isRunning={pump1On} label="HT PUMP 1" />
        <InlineHTPump x={pump2X} y={pumpRowY} w={pumpW} h={pumpH} isRunning={pump2On} label="HT PUMP 2" />

        {/* Pump ON/OFF labels */}
        {pumpCenters.map((px, i) => (
          <text key={i} x={px + pumpW / 2} y={pumpRowY + pumpH + 16} textAnchor="middle" fontSize="11" fontWeight="900"
            fill={pumpOns[i] ? '#22c55e' : '#ef4444'}>● {pumpOns[i] ? 'ON' : 'OFF'}</text>
        ))}

        {/* ═══ INDIVIDUAL PT GAUGES (below each pump) ═══ */}
        <g>
          {pumpCenters.map((px, i) => {
            const gaugeX = px + pumpOutletOffsetX;
            const outletX = px + pumpOutletOffsetX;
            const tapY = pumpRowY + pumpH + 4;
            const gaugeTopY = ptGaugeY - ptGaugeR - 8;
            return (
              <g key={`pt-${i}`}>
                {/* Thin impulse line from pump discharge down to PT gauge */}
                <line x1={outletX} y1={tapY} x2={outletX} y2={gaugeTopY}
                  stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
                <circle cx={outletX} cy={tapY} r="2.5" fill="hsl(var(--muted-foreground))" opacity="0.8" />
                <circle cx={outletX} cy={gaugeTopY} r="2.5" fill="hsl(var(--muted-foreground))" opacity="0.8" />
                <Gauge cx={gaugeX} cy={ptGaugeY} r={ptGaugeR} value={ptVals[i]} min={0} max={10} label={ptLabels[i]} unit="Bar" />
              </g>
            );
          })}
        </g>

        {/* ═══ SECTION 12: OUTLET INSTRUMENTS ═══ */}
        <g>
          {/* EFM OUT */}
          {(() => {
            const efmX = outletEfmX;
            const efmTopY = mergeY - 101; // Perfectly matched to EFM IN's exact neck height (19px)
            const hW = 90, hH = 55, nW = 24;
            return (
              <g>
                <text x={efmX} y={efmTopY - 14} textAnchor="middle" fontSize="15" fontWeight="800" fill="hsl(var(--foreground))">EFM OUT</text>
                <polygon points={`${efmX - hW / 2 + 5},${efmTopY} ${efmX + hW / 2 - 5},${efmTopY} ${efmX + hW / 2},${efmTopY + 12} ${efmX - hW / 2},${efmTopY + 12}`}
                  fill="hsl(38 92% 50% / 0.85)" stroke="hsl(var(--border))" strokeWidth="1" />
                <rect x={efmX - hW / 2} y={efmTopY + 12} width={hW} height={hH} rx={5} fill="hsl(38 92% 50% / 0.9)" stroke="hsl(var(--border))" strokeWidth="1.2" />
                <rect x={efmX - 32} y={efmTopY + 22} width={64} height={30} rx={3} fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="0.8" />
                <text x={efmX} y={efmTopY + 43} textAnchor="middle" fill="hsl(var(--foreground))" style={{ fontSize: '16px', fontFamily: 'ui-monospace, monospace', fontWeight: 800 }}>
                  {flowOutVal.toFixed(2)}
                </text>
                {/* Neck connects to merged outlet pipe */}
                <rect x={efmX - nW / 2} y={efmTopY + 12 + hH} width={nW} height={(mergeY - 15) - (efmTopY + 12 + hH)} fill="#64748b" stroke="#475569" strokeWidth="1" />
                {/* Flange sticks up slightly above the thick pipe */}
                <rect x={efmX - nW / 2 - 5} y={mergeY - 17} width={nW + 10} height={7} rx={2} fill={pVDark} />

                <rect x={efmX - 80} y={mergeY + 35} width={160} height={44} rx={8} fill="hsl(38 92% 50% / 0.06)" stroke="hsl(38 92% 50% / 0.4)" strokeWidth="1" />
                <text x={efmX} y={mergeY + 50} textAnchor="middle" fontSize="11" fontWeight="700" fill="hsl(38 92% 55%)" letterSpacing="0.8px">FLOW RATE</text>
                <text x={efmX} y={mergeY + 69} textAnchor="middle" fontSize="20" fontWeight="900" fill="hsl(var(--foreground))" fontFamily="ui-monospace">
                  {flowOutVal.toFixed(1)} <tspan fontSize="11" fill="hsl(var(--muted-foreground))" fontWeight="600">m³/h</tspan>
                </text>
              </g>
            );
          })()}

          {/* Outlet Quality Analyzers - larger with proper stubs */}
          {(() => {
            const analyzerBaseY = mergeY + 32; // Moved UP to match exactly 32px from the center dot 
            const startX = outletAnalyzerX;
            return (
              <g>
                {[0, 1, 2].map((i) => {
                  const xCenter = startX + i * (outletAnalyzerW + 10) + outletAnalyzerW / 2;
                  return (
                    <g key={`out-stub-${i}`}>
                      <line x1={xCenter} y1={mergeY + 9} x2={xCenter} y2={analyzerBaseY} stroke="#64748b" strokeWidth="4" />
                      <circle cx={xCenter} cy={mergeY} r="5" fill="#64748b" />
                    </g>
                  );
                })}
                <InlinePhAnalyzer x={startX} y={analyzerBaseY} w={outletAnalyzerW} h={outletAnalyzerH} value={phOutVal} label="pH (TREATED)" />
                <InlineClAnalyzer x={startX + outletAnalyzerW + 10} y={analyzerBaseY} w={outletAnalyzerW} h={outletAnalyzerH} value={clOutVal} />
                <InlineTaAnalyzer x={startX + (outletAnalyzerW + 10) * 2} y={analyzerBaseY} w={outletAnalyzerW} h={outletAnalyzerH} value={taOutVal} label="TURB (OUT)" />
              </g>
            );
          })()}
        </g>

        {/* ═══ SECTION 13: TOTALIZER ═══ */}
        <g>
          {(() => {
            const tx = totalizerX, ty = totalizerY;
            const digits = Math.floor(totVal).toString().padStart(8, '0').split('');
            const dec = (totVal % 1).toFixed(2).substring(2);
            const dW = 15, dH = 24, gp = 2;
            const totW = 10 * dW + 9 * gp + 4 + 20;
            return (
              <g>
                <text x={tx} y={ty - 10} textAnchor="middle" fontSize="13" fontWeight="800" fill="hsl(var(--foreground))">Totalizer</text>
                <rect x={tx - totW / 2} y={ty} width={totW} height={dH + 16} rx={5} fill="hsl(var(--secondary) / 0.5)" stroke="hsl(var(--border) / 0.5)" strokeWidth="1" />
                {digits.map((d, i) => (
                  <g key={`td${i}`}>
                    <rect x={tx - totW / 2 + 10 + i * (dW + gp)} y={ty + 8} width={dW} height={dH} rx={3} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" />
                    <text x={tx - totW / 2 + 10 + i * (dW + gp) + dW / 2} y={ty + 8 + dH / 2 + 5} textAnchor="middle" fill="hsl(var(--foreground))" style={{ fontSize: '14px', fontFamily: 'ui-monospace, monospace', fontWeight: 800 }}>{d}</text>
                  </g>
                ))}
                <circle cx={tx - totW / 2 + 10 + 8 * (dW + gp) + 1} cy={ty + 8 + dH - 2} r={2.5} fill="hsl(var(--primary))" />
                {dec.split('').map((d, i) => (
                  <g key={`dd${i}`}>
                    <rect x={tx - totW / 2 + 10 + 8 * (dW + gp) + 4 + gp + i * (dW + gp)} y={ty + 8} width={dW} height={dH} rx={3} fill="hsl(var(--destructive) / 0.12)" stroke="hsl(var(--destructive) / 0.25)" strokeWidth="1" />
                    <text x={tx - totW / 2 + 10 + 8 * (dW + gp) + 4 + gp + i * (dW + gp) + dW / 2} y={ty + 8 + dH / 2 + 5} textAnchor="middle" fill="hsl(var(--destructive))" style={{ fontSize: '14px', fontFamily: 'ui-monospace, monospace', fontWeight: 800 }}>{d}</text>
                  </g>
                ))}
                <text x={tx} y={ty + dH + 28} textAnchor="middle" fontSize="10" fontWeight="700" fill="hsl(var(--muted-foreground))">m³</text>
              </g>
            );
          })()}
        </g>

        {/* ═══ ENERGY METER (MFM) ═══ */}
        <g>
          {(() => {
            const ex = energyMeterX, ey = energyMeterY;
            return (
              <g>
                <text x={ex + 5} y={ey - 10} textAnchor="middle" fontSize="13" fontWeight="800" fill="hsl(var(--foreground))">MFM (Energy Meter)</text>
                <svg x={ex - 55} y={ey} width={120} height={140} viewBox="0 0 90 110" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.2))' }}>
                  <rect x="5" y="2" width="80" height="106" rx="5" fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="1.5" />
                  <rect x="10" y="7" width="70" height="96" rx="3" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" />
                  {[[12, 9], [72, 9], [12, 97], [72, 97]].map(([cx, cy], i) => (
                    <circle key={i} cx={cx} cy={cy} r="3" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
                  ))}
                  <rect x="16" y="16" width="58" height="24" rx="2" fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="0.8" />
                  <rect x="18" y="18" width="54" height="20" rx="1" fill="hsl(142 71% 45% / 0.1)" />
                  <text x="45" y="32" textAnchor="middle" fill="hsl(var(--foreground))" style={{ fontSize: '13px', fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{kwVal.toFixed(1)}</text>
                  <text x="45" y="23" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '6px', fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>kW</text>
                  {[24, 33, 42, 51, 60].map((xx, i) => (
                    <circle key={`l${i}`} cx={xx} cy="48" r="2.5" fill="hsl(var(--muted))" />
                  ))}
                  <circle cx="30" cy="56" r="2" fill="hsl(var(--destructive) / 0.6)" />
                  <circle cx="38" cy="56" r="2" fill="hsl(var(--warning) / 0.6)" />
                  <circle cx="46" cy="56" r="2" fill="#22c55e" filter="drop-shadow(0 0 2px #22c55e)" />
                  <circle cx="62" cy="56" r="6" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.8" />
                  <circle cx="62" cy="56" r="2" fill="hsl(var(--muted-foreground))" />
                  <rect x="18" y="68" width="54" height="5" rx="2" fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="0.5" />
                  <rect x="14" y="80" width="62" height="18" rx="2" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.8" opacity="0.6" />
                  {[26, 38, 50, 62].map((xx, i) => (
                    <g key={`ts${i}`}>
                      <rect x={xx - 4} y={82} width="8" height="10" rx="1" fill="hsl(var(--muted-foreground) / 0.3)" stroke="hsl(var(--border))" strokeWidth="0.4" />
                      <circle cx={xx} cy={87} r="2" fill="hsl(var(--muted-foreground) / 0.4)" />
                    </g>
                  ))}
                </svg>
                <g transform={`translate(${ex + 5}, ${ey + 144})`}>
                  <rect x={-28} y={0} width={56} height={16} rx={4}
                    fill={kwLive ? 'hsl(var(--success) / 0.15)' : 'hsl(var(--destructive) / 0.15)'}
                    stroke={kwLive ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} strokeWidth="0.8" />
                  <circle cx={-18} cy={8} r={2.5} fill={kwLive ? 'hsl(var(--success))' : 'hsl(var(--destructive))'}>
                    <animate attributeName="opacity" values="1;0.4;1" dur={kwLive ? '1.6s' : '0.8s'} repeatCount="indefinite" />
                  </circle>
                  <text x={4} y={12} textAnchor="middle" fontSize="10" fontWeight="800" letterSpacing="1"
                    fill={kwLive ? 'hsl(var(--success))' : 'hsl(var(--destructive))'}>
                    {kwLive ? 'ON' : 'OFF'}
                  </text>
                </g>
              </g>
            );
          })()}
        </g>

        {/* ═══ FLOW DIRECTION ARROWS ═══ */}
        <g opacity="0.5">
          {[
            { ax: 160, ay: inletPipeY, rot: 0 },
            { ax: mixerX - 22, ay: processY + 114, rot: 10 },
            { ax: mixerX + mixerW + 20, ay: processY + 120, rot: 0 },
            { ax: flocX + flocW + 20, ay: processY + 120, rot: 0 },
            { ax: settleX + settleW + 20, ay: processY + 120, rot: 0 },
            { ax: filterX + filterW + 20, ay: filterOutY, rot: 0 },
          ].map((arrow, i) => (
            <g key={`arrow-${i}`} transform={`translate(${arrow.ax}, ${arrow.ay}) rotate(${arrow.rot})`}>
              <polygon points="0,-7 14,0 0,7" fill="hsl(var(--primary))" />
            </g>
          ))}
        </g>

        {/* ═══ STAGE LABELS ═══ */}
        <g>
          {[
            { sx: 80, sy: processY + mixerH + 78, text: 'STAGE 1: RAW WATER', color: 'hsl(var(--primary))' },
            { sx: mixerX + mixerW / 2, sy: processY + mixerH + 78, text: 'STAGE 2: MIXING', color: 'hsl(280 65% 55%)' },
            { sx: flocX + flocW / 2, sy: processY + flocH + 65, text: 'STAGE 3: FLOCCULATION', color: 'hsl(35 90% 50%)' },
            { sx: settleX + settleW / 2, sy: processY + settleH + 105, text: 'STAGE 4: SEDIMENTATION', color: 'hsl(38 70% 45%)' },
            { sx: filterX + filterW / 2, sy: processY + filterH + 65, text: 'STAGE 5: FILTRATION', color: 'hsl(200 70% 45%)' },
            { sx: outletEfmX, sy: mergeY + 101, text: 'STAGE 6: STORAGE', color: 'hsl(199 89% 48%)' },
            { sx: (pump1X + pump2X) / 2 + pumpW / 2, sy: pumpRowY + pumpH + 42, text: 'STAGE 7: PUMPING', color: 'hsl(var(--warning))' },
          ].map((stage, i) => {
            const boxWidth = stage.text.length * 6 + 36;
            return (
              <g key={`stage-${i}`}>
                <rect x={stage.sx - boxWidth / 2} y={stage.sy - 12} width={boxWidth} height={20} rx={10} fill={stage.color} />
                <text x={stage.sx} y={stage.sy + 2} textAnchor="middle" fontSize="9" fontWeight="900"
                  fill="white" letterSpacing="1px">
                  {stage.text}
                </text>
              </g>
            );
          })}
        </g>

      </svg>
    </div>
  );
};

export default WtpProcessSimulation;
