'use client';

import { useMemo, useState } from 'react';

import { Card } from '@/components/ui/card';
import { computeSlaSummary, formatHours } from '@/lib/sla';
import type { CollectionRequest } from '@/types';

interface RecaudacionSlaPanelProps {
  requests: CollectionRequest[];
}

/**
 * #7 — Panel dinámico de SLA de Recaudación. Muestra el tiempo promedio que las
 * solicitudes pasaron en estado Pendiente (horario hábil 9-18h), un resumen en tiempo
 * real por estado (Pendientes / Info solicitada / Gestionado CC / Rechazados) y un
 * evolutivo mensual del SLA. Todo se calcula en el cliente desde `requests`.
 */
export function RecaudacionSlaPanel({ requests }: RecaudacionSlaPanelProps) {
  // `now` estable por montaje para que el eje de meses no salte en cada render.
  const [now] = useState(() => new Date());
  const summary = useMemo(() => computeSlaSummary(requests, now), [requests, now]);

  const tiles: { label: string; value: string; sub?: string; className: string }[] = [
    {
      label: 'Pendientes',
      value: String(summary.counts.pendientes),
      className: 'text-amber-600',
    },
    {
      label: 'Preaprobados',
      value: String(summary.counts.preaprobados),
      className: 'text-sky-600',
    },
    {
      label: 'Aprobados',
      value: String(summary.counts.aprobados),
      className: 'text-emerald-700',
    },
    {
      label: 'Info solicitada',
      value: String(summary.counts.infoSolicitada),
      className: 'text-blue-600',
    },
    {
      label: 'Gestionado CC',
      value: String(summary.counts.gestionadoCC),
      className: 'text-emerald-600',
    },
    {
      label: 'Rechazados',
      value: String(summary.counts.rechazados),
      className: 'text-red-600',
    },
    {
      label: 'Anulados',
      value: String(summary.counts.anulados),
      className: 'text-slate-500',
    },
    {
      label: 'Total solicitudes',
      value: String(summary.counts.total),
      className: 'text-slate-700',
    },
    {
      label: 'SLA prom. en Pendiente (hábil 9-18h)',
      value: formatHours(summary.avgPendingHours),
      sub: `${summary.resolvedCount} caso(s) resuelto(s)`,
      className: 'text-jetsmart-blue',
    },
  ];

  return (
    <Card className="p-4">
      <div className="mb-3">
        <h3 className="text-lg font-semibold">Indicadores de Recaudación</h3>
        <p className="text-xs text-slate-500">
          SLA de respuesta y estado de las solicitudes (tiempo en horario hábil 9-18h).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border bg-white p-3">
            <div className="text-[11px] font-medium text-slate-500">{t.label}</div>
            <div className={`text-2xl font-bold ${t.className}`}>{t.value}</div>
            {t.sub ? <div className="mt-0.5 text-[10px] text-slate-400">{t.sub}</div> : null}
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="mb-1 text-sm font-semibold">
          Evolutivo mensual — SLA promedio en Pendiente (hábil 9-18h)
        </div>
        <SlaLineChart monthly={summary.monthly} />
      </div>
    </Card>
  );
}

function SlaLineChart({
  monthly,
}: {
  monthly: { key: string; label: string; avgHours: number; count: number }[];
}) {
  const W = 760;
  const H = 240;
  const padL = 44;
  const padR = 16;
  const padT = 16;
  const padB = 40;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxVal = Math.max(1, ...monthly.map((m) => m.avgHours));
  // Redondea el tope a un número "bonito".
  const niceMax = niceCeil(maxVal);
  const n = monthly.length;
  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const y = (v: number) => padT + plotH - (plotH * v) / niceMax;

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => (niceMax * i) / ticks);

  const points = monthly.map((m, i) => `${x(i)},${y(m.avgHours)}`).join(' ');
  const hasData = monthly.some((m) => m.count > 0);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 640 }} role="img">
        {/* Gridlines + etiquetas Y */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={padL}
              y1={y(v)}
              x2={W - padR}
              y2={y(v)}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
            <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="#94a3b8">
              {v.toFixed(v >= 10 ? 0 : 1)}
            </text>
          </g>
        ))}
        <text
          x={12}
          y={padT + plotH / 2}
          fontSize={10}
          fill="#64748b"
          transform={`rotate(-90 12 ${padT + plotH / 2})`}
          textAnchor="middle"
        >
          Horas
        </text>

        {/* Línea + puntos */}
        {hasData && (
          <>
            <polyline points={points} fill="none" stroke="#2563eb" strokeWidth={2} />
            {monthly.map((m, i) => (
              <circle
                key={m.key}
                cx={x(i)}
                cy={y(m.avgHours)}
                r={m.count > 0 ? 3.5 : 0}
                fill="#2563eb"
              >
                <title>{`${m.label}: ${m.avgHours.toFixed(1)} h (${m.count} caso/s)`}</title>
              </circle>
            ))}
          </>
        )}

        {/* Etiquetas X (un subconjunto si hay muchas) */}
        {monthly.map((m, i) => {
          const show = n <= 8 || i % 2 === 0 || i === n - 1;
          if (!show) return null;
          return (
            <text key={m.key} x={x(i)} y={H - padB + 16} textAnchor="middle" fontSize={9} fill="#94a3b8">
              {m.label}
            </text>
          );
        })}

        {!hasData && (
          <text x={W / 2} y={padT + plotH / 2} textAnchor="middle" fontSize={12} fill="#94a3b8">
            Sin casos resueltos en el período
          </text>
        )}
      </svg>
    </div>
  );
}

function niceCeil(v: number): number {
  if (v <= 1) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}
