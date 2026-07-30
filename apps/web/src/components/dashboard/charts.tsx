'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const BLUE = '#3b82f6';
const VIOLET = '#8b5cf6';
const GREEN = '#10b981';
const AMBER = '#f59e0b';
const RED = '#ef4444';
const MUTED = '#8b95a8';

type Point = { name: string; value: number };

export function sparkSeries(seed: number, points = 8): Point[] {
  const out: Point[] = [];
  let v = Math.max(20, seed);
  for (let i = 0; i < points; i++) {
    v = Math.max(12, Math.min(100, v + ((i * 17 + seed) % 13) - 6));
    out.push({ name: String(i + 1), value: Math.round(v) });
  }
  return out;
}

export function weekSeries(seed: number): Point[] {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days.map((name, i) => ({
    name,
    value: Math.round(Math.max(18, Math.min(96, seed * 0.55 + ((i * 11 + seed) % 28)))),
  }));
}

export function pulseSeries(seed: number): Point[] {
  const labels = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'];
  return labels.map((name, i) => ({
    name,
    value: Math.round(Math.max(35, Math.min(98, seed - 12 + ((i * 9 + seed) % 22)))),
  }));
}

function ChartTip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: '#11141d',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        padding: '0.45rem 0.65rem',
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {label ? <div style={{ color: MUTED, marginBottom: 2 }}>{label}</div> : null}
      <div>{payload[0].value}</div>
    </div>
  );
}

export function Sparkline({ data, color = BLUE }: { data: Point[]; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function AreaPulse({ data, color = BLUE }: { data: Point[]; color?: string }) {
  const id = `pulse-${color.replace('#', '')}`;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.45} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="name" stroke={MUTED} tickLine={false} axisLine={false} fontSize={11} />
        <YAxis stroke={MUTED} tickLine={false} axisLine={false} fontSize={11} domain={[0, 100]} />
        <Tooltip content={<ChartTip />} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#${id})`}
          activeDot={{ r: 5, fill: color, stroke: '#fff', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BarWeek({ data }: { data: Point[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={VIOLET} />
            <stop offset="100%" stopColor={BLUE} />
          </linearGradient>
        </defs>
        <XAxis dataKey="name" stroke={MUTED} tickLine={false} axisLine={false} fontSize={11} />
        <YAxis stroke={MUTED} tickLine={false} axisLine={false} fontSize={11} />
        <Tooltip content={<ChartTip />} />
        <Bar dataKey="value" fill="url(#barGrad)" radius={[8, 8, 4, 4]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutStatus({
  segments,
  center,
}: {
  segments: { name: string; value: number; color: string }[];
  center: string;
}) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={segments}
            dataKey="value"
            nameKey="name"
            innerRadius="68%"
            outerRadius="88%"
            paddingAngle={3}
            stroke="none"
          >
            {segments.map((s) => (
              <Cell key={s.name} fill={s.color} />
            ))}
          </Pie>
          <Tooltip content={<ChartTip />} />
        </PieChart>
      </ResponsiveContainer>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          pointerEvents: 'none',
          textAlign: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>
            {center}
          </div>
        </div>
      </div>
    </div>
  );
}

export const chartColors = { BLUE, VIOLET, GREEN, AMBER, RED, MUTED };
