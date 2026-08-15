'use client';

import type { WidgetProps, MapPin } from './widget.types';

const GREEN = '#10b981';
const AMBER = '#f59e0b';
const RED = '#ef4444';
const BLUE = '#3b82f6';
const MUTED = '#8b95a8';

function pinColor(status?: MapPin['status']): string {
  if (status === 'ok') return GREEN;
  if (status === 'warn') return AMBER;
  if (status === 'error') return RED;
  return BLUE;
}

function defaultPins(): MapPin[] {
  return [
    { id: 'nairobi', label: 'Nairobi HQ', lat: -1.286, lng: 36.82, status: 'ok' },
    { id: 'mombasa', label: 'Mombasa Office', lat: -4.05, lng: 39.67, status: 'ok' },
    { id: 'kisumu', label: 'Kisumu Branch', lat: -0.09, lng: 34.76, status: 'warn' },
    { id: 'nakuru', label: 'Nakuru Depot', lat: -0.30, lng: 36.07, status: 'ok' },
    { id: 'eldoret', label: 'Eldoret Site', lat: 0.52, lng: 35.27, status: 'error' },
  ];
}

/**
 * Map widget — SVG projection of lat/lng pins.
 * No external map API needed — uses simple equirectangular projection.
 *
 * Config keys:
 *   pins      — [{id, label, lat, lng, status?}]
 *   centerLat — map center latitude (default 0)
 *   centerLng — map center longitude (default 20)
 */
export default function MapWidget({ config = {}, onDrillDown, height = 180 }: WidgetProps) {
  const pins =
    Array.isArray(config.pins) && config.pins.length > 0
      ? (config.pins as MapPin[])
      : defaultPins();

  const svgW = 280;
  const svgH = height;

  // Determine map bounds from pins (with padding)
  const lats = pins.map((p) => p.lat);
  const lngs = pins.map((p) => p.lng);
  const latPad = 2, lngPad = 3;
  const latMin = Math.min(...lats) - latPad;
  const latMax = Math.max(...lats) + latPad;
  const lngMin = Math.min(...lngs) - lngPad;
  const lngMax = Math.max(...lngs) + lngPad;

  const toSvg = (lat: number, lng: number) => ({
    x: ((lng - lngMin) / (lngMax - lngMin)) * (svgW - 20) + 10,
    y: ((latMax - lat) / (latMax - latMin)) * (svgH - 20) + 10,
  });

  return (
    <div style={{ height, overflow: 'hidden', position: 'relative' }} aria-label="Map with location pins">
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Background */}
        <rect width={svgW} height={svgH} fill="rgba(30,41,59,0.7)" rx={6} />

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line
              x1={t * svgW} y1={0} x2={t * svgW} y2={svgH}
              stroke={MUTED} strokeOpacity={0.15} strokeWidth={0.5}
            />
            <line
              x1={0} y1={t * svgH} x2={svgW} y2={t * svgH}
              stroke={MUTED} strokeOpacity={0.15} strokeWidth={0.5}
            />
          </g>
        ))}

        {/* Pins */}
        {pins.map((pin) => {
          const { x, y } = toSvg(pin.lat, pin.lng);
          const color = pinColor(pin.status);
          return (
            <g
              key={pin.id}
              transform={`translate(${x},${y})`}
              onClick={() => onDrillDown?.(pin)}
              style={{ cursor: onDrillDown ? 'pointer' : undefined }}
              role={onDrillDown ? 'button' : undefined}
              tabIndex={onDrillDown ? 0 : undefined}
              aria-label={`Pin: ${pin.label}`}
            >
              {/* Pulse ring */}
              <circle r={10} fill={color} fillOpacity={0.12} />
              {/* Pin circle */}
              <circle r={5} fill={color} stroke="#0f172a" strokeWidth={1.5} />
              {/* Label */}
              <text
                x={8} y={-6}
                fill="#f4f7fb"
                fontSize={8}
                fontWeight={600}
                style={{ pointerEvents: 'none' }}
              >
                {pin.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
