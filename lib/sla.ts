import type { CollectionRequest } from '@/types';

/**
 * SLA de Recaudación (#7). Mide el tiempo que una solicitud estuvo en estado
 * "Pendiente" en HORARIO HÁBIL (Lun-Vie 09:00-18:00), desde su creación hasta la
 * primera salida de Pendiente (preaprobado / info solicitada / aprobado / revisado).
 * Cálculo en la zona horaria del navegador (para el usuario, America/Santiago).
 */
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;

/** Horas hábiles (L-V 9-18h) entre dos instantes ISO. null si faltan datos. */
export function businessHoursBetween(startISO?: string, endISO?: string): number | null {
  if (!startISO || !endISO) return null;
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (end <= start) return 0;

  let total = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  // Cota de seguridad: máx ~5 años de días para no colgarse ante datos raros.
  let guard = 0;
  while (cursor.getTime() < end && guard < 2000) {
    guard += 1;
    const day = cursor.getDay(); // 0=Dom, 6=Sáb
    if (day >= 1 && day <= 5) {
      const ws = new Date(cursor);
      ws.setHours(WORK_START_HOUR, 0, 0, 0);
      const we = new Date(cursor);
      we.setHours(WORK_END_HOUR, 0, 0, 0);
      const s = Math.max(start, ws.getTime());
      const e = Math.min(end, we.getTime());
      if (e > s) total += e - s;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return total / 3_600_000; // ms -> horas
}

/** Primera fecha en que la solicitud salió de "Pendiente" (o undefined si sigue pendiente). */
export function pendingExitAt(r: CollectionRequest): string | undefined {
  const candidates = [r.preapprovedAt, r.approvedAt, r.infoRequestedAt, r.reviewedAt].filter(
    (x): x is string => Boolean(x)
  );
  if (candidates.length === 0) return undefined;
  return candidates.reduce((min, cur) => (new Date(cur) < new Date(min) ? cur : min));
}

/** SLA en horas hábiles que la solicitud pasó en Pendiente (null si aún no sale). */
export function pendingSlaHours(r: CollectionRequest): number | null {
  const exit = pendingExitAt(r);
  if (!r.createdAt || !exit) return null;
  return businessHoursBetween(r.createdAt, exit);
}

export interface SlaSummary {
  counts: {
    pendientes: number;
    preaprobados: number;
    aprobados: number;
    infoSolicitada: number;
    gestionadoCC: number;
    rechazados: number;
    anulados: number;
    total: number;
  };
  avgPendingHours: number | null; // promedio SLA (horas hábiles) de las que salieron de Pendiente
  resolvedCount: number; // cuántas entraron en el promedio
  monthly: { key: string; label: string; avgHours: number; count: number }[]; // evolutivo
}

const MONTH_LABELS = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

/**
 * Resume los KPIs de SLA a partir de las solicitudes. `now` se inyecta para que el
 * eje de meses sea determinista (evita depender de Date.now dentro del cálculo puro).
 */
export function computeSlaSummary(requests: CollectionRequest[], now: Date, monthsBack = 12): SlaSummary {
  const counts = {
    pendientes: 0,
    preaprobados: 0,
    aprobados: 0,
    infoSolicitada: 0,
    gestionadoCC: 0,
    rechazados: 0,
    anulados: 0,
    total: requests.length,
  };
  for (const r of requests) {
    if (r.status === 'Pendiente') counts.pendientes += 1;
    else if (r.status === 'Preaprobado') counts.preaprobados += 1;
    else if (r.status === 'Aprobado') counts.aprobados += 1;
    else if (r.status === 'InformacionSolicitada') counts.infoSolicitada += 1;
    else if (r.status === 'GestionadoCC') counts.gestionadoCC += 1;
    else if (r.status === 'Rechazado') counts.rechazados += 1;
    else if (r.status === 'Anulado') counts.anulados += 1;
  }

  // SLA por solicitud resuelta (que salió de Pendiente).
  const resolved: { createdAt: string; hours: number }[] = [];
  for (const r of requests) {
    const hours = pendingSlaHours(r);
    if (hours !== null && r.createdAt) resolved.push({ createdAt: r.createdAt, hours });
  }
  const avgPendingHours =
    resolved.length > 0 ? resolved.reduce((s, x) => s + x.hours, 0) / resolved.length : null;

  // Evolutivo mensual: promedio por mes de CREACIÓN, últimos `monthsBack` meses.
  const buckets = new Map<string, { sum: number; count: number }>();
  const axis: { key: string; label: string }[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    axis.push({ key, label: `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}` });
    buckets.set(key, { sum: 0, count: 0 });
  }
  for (const x of resolved) {
    const d = new Date(x.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const b = buckets.get(key);
    if (b) {
      b.sum += x.hours;
      b.count += 1;
    }
  }
  const monthly = axis.map((a) => {
    const b = buckets.get(a.key)!;
    return { key: a.key, label: a.label, avgHours: b.count > 0 ? b.sum / b.count : 0, count: b.count };
  });

  return { counts, avgPendingHours, resolvedCount: resolved.length, monthly };
}

/** Formatea horas a un texto compacto: "0 min", "3.2 h", "1.5 h". */
export function formatHours(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1 / 60) return '0 min';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${hours.toFixed(1)} h`;
}
