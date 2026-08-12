'use client';

import { useCallback, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TableLoadingRow } from '@/components/ui/loading-row';
import { formatDate } from '@/lib/format';

type ClosureRow = {
  id: string;
  label: string | null;
  dateFrom: string;
  dateTo: string;
  createdAt: string;
  totalCount: number | null;
  identifiedCount: number | null;
  pendingCount: number | null;
  totalAmount: string | number | null;
  identifiedAmount: string | number | null;
  pendingAmount: string | number | null;
};

type CategoryTotal = { count: number; amount: number };

type ClosureDetail = {
  closure: {
    id: string;
    label: string | null;
    dateFrom: string;
    dateTo: string;
    createdAt: string;
    totalCount: number | null;
    identifiedCount: number | null;
    pendingCount: number | null;
    totalAmount: number | null;
    identifiedAmount: number | null;
    pendingAmount: number | null;
  };
  summary: {
    porCategoria: Record<string, CategoryTotal>;
    identificadoTotal: CategoryTotal;
    porIdentificar: CategoryTotal;
    reclasificaciones: { movementId: string; amount: number; category: string }[];
  };
  detalle: Array<{
    movementId: string;
    displayId?: string | null;
    closeState: string;
    category: string;
    amount: number;
    originYear: number;
    originMonth: number;
    carriedFromClosureId: string | null;
    bank: string;
    bankAccount: string;
    date: string;
    description: string;
    pnrs: { reference: string; amount: number }[];
  }>;
};

type BacklogRow = {
  movementId: string;
  bank: string;
  bankAccount: string;
  amount: number;
  date: string;
  description: string;
  originYear: number | null;
  originMonth: number | null;
  closeState: string;
};

type CategoryAccount = { category: string; accountCode: string; accountName: string };

const CATEGORY_LABEL: Record<string, string> = {
  Adquiriente: 'Adquiriente',
  GC: 'GC',
  CobranzaCredito: 'Cobranza crédito',
  AbonoDebito: 'Abono débito',
  SinIdentificar: 'Sin identificar',
};

const clp = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP' });

const day = (iso: string) => formatDate(iso);

export function ContabilidadManagement() {
  const [closures, setClosures] = useState<ClosureRow[]>([]);
  const [backlog, setBacklog] = useState<BacklogRow[]>([]);
  const [detail, setDetail] = useState<ClosureDetail | null>(null);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [label, setLabel] = useState('');

  const [loading, setLoading] = useState(false);
  // Carga inicial de datos del módulo (cierres/backlog/categorías) para el indicador.
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryAccount[]>([]);
  const [catMessage, setCatMessage] = useState<string | null>(null);

  const loadClosures = useCallback(async () => {
    const res = await fetch('/api/contabilidad/closures', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok) setClosures(data.closures ?? []);
    else setError(data.error ?? 'No se pudieron cargar los cierres.');
  }, []);

  const loadBacklog = useCallback(async () => {
    const res = await fetch('/api/contabilidad/backlog', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok) setBacklog(data.movements ?? []);
  }, []);

  const loadCategories = useCallback(async () => {
    const res = await fetch('/api/contabilidad/categories', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok) setCategories(data.categories ?? []);
  }, []);

  useEffect(() => {
    setInitialLoading(true);
    Promise.all([loadClosures(), loadBacklog(), loadCategories()]).finally(() =>
      setInitialLoading(false)
    );
  }, [loadClosures, loadBacklog, loadCategories]);

  const onGenerate = async () => {
    setError(null);
    setMessage(null);
    if (!dateFrom || !dateTo) {
      setError('Indica el rango de fechas (inicio y fin).');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/contabilidad/closures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateFrom, dateTo, label: label.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'No se pudo generar el cierre.');
        return;
      }
      setMessage('Cierre generado correctamente.');
      setLabel('');
      await Promise.all([loadClosures(), loadBacklog()]);
      if (data.closureId) await openDetail(data.closureId);
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (id: string) => {
    setError(null);
    const res = await fetch(`/api/contabilidad/closures/${id}`, { cache: 'no-store' });
    const data = await res.json();
    if (res.ok) setDetail(data);
    else setError(data.error ?? 'No se pudo cargar el detalle.');
  };

  const accountFor = (cat: string) =>
    categories.find((c) => c.category === cat)?.accountCode || '';

  // Mapa movementId -> código visible (para reclasificaciones).
  const codeByMov = new Map(
    (detail?.detalle ?? []).map((d) => [d.movementId, d.displayId || d.movementId] as const)
  );

  const onSaveCategories = async () => {
    setError(null);
    setCatMessage(null);
    const res = await fetch('/api/contabilidad/categories', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories }),
    });
    if (res.ok) {
      setCatMessage('Cuentas contables guardadas.');
    } else {
      const data = await res.json();
      setError(data.error ?? 'No se pudieron guardar las cuentas contables.');
    }
  };

  return (
    <div className="space-y-5">
      {/* Generar cierre */}
      <Card className="p-4">
        <h3 className="mb-3 text-lg font-semibold">Generar cierre</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Inicio</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Fin</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Etiqueta (opcional)</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ej. Cierre junio 2026"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={onGenerate} disabled={loading} className="w-full">
              {loading ? 'Generando…' : 'Generar cierre'}
            </Button>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {message && <p className="mt-2 text-sm text-emerald-600">{message}</p>}
      </Card>

      {/* Cuentas contables por categoría */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Cuentas contables por categoría</h3>
          <Button size="sm" onClick={onSaveCategories}>
            Guardar cuentas
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {categories.map((c, i) => (
            <div key={c.category} className="flex items-center gap-2">
              <span className="w-32 shrink-0 text-sm">{CATEGORY_LABEL[c.category] ?? c.category}</span>
              <Input
                className="w-32"
                placeholder="Cuenta"
                value={c.accountCode}
                onChange={(e) =>
                  setCategories((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, accountCode: e.target.value } : x))
                  )
                }
              />
              <Input
                placeholder="Nombre de la cuenta (opcional)"
                value={c.accountName}
                onChange={(e) =>
                  setCategories((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, accountName: e.target.value } : x))
                  )
                }
              />
            </div>
          ))}
        </div>
        {catMessage && <p className="mt-2 text-sm text-emerald-600">{catMessage}</p>}
      </Card>

      {/* Lista de cierres */}
      <Card className="p-4">
        <h3 className="mb-3 text-lg font-semibold">Cierres</h3>
        <div className="max-h-[320px] overflow-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-100">
              <tr>
                <th className="px-3 py-2">Rango</th>
                <th className="px-3 py-2">Etiqueta</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Identificados</th>
                <th className="px-3 py-2">Por identificar</th>
                <th className="px-3 py-2">Monto identificado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {initialLoading ? (
                <TableLoadingRow colSpan={7} label="Cargando cierres…" />
              ) : closures.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-slate-400">
                    Aún no hay cierres.
                  </td>
                </tr>
              ) : (
                closures.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-3 py-2">
                      {day(c.dateFrom)} → {day(c.dateTo)}
                    </td>
                    <td className="px-3 py-2">{c.label ?? '—'}</td>
                    <td className="px-3 py-2">{c.totalCount ?? 0}</td>
                    <td className="px-3 py-2 text-emerald-700">{c.identifiedCount ?? 0}</td>
                    <td className="px-3 py-2 text-amber-700">{c.pendingCount ?? 0}</td>
                    <td className="px-3 py-2">{clp(c.identifiedAmount)}</td>
                    <td className="px-3 py-2">
                      <Button variant="outline" size="sm" onClick={() => openDetail(c.id)}>
                        Ver detalle
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detalle del cierre */}
      {detail && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              Detalle del cierre {day(detail.closure.dateFrom)} → {day(detail.closure.dateTo)}
            </h3>
            <Button variant="outline" size="sm" onClick={() => setDetail(null)}>
              Cerrar
            </Button>
          </div>

          {/* Resumen */}
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-md border p-3">
              <h4 className="mb-2 text-sm font-semibold">Resumen por categoría (identificados)</h4>
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(detail.summary.porCategoria).map(([cat, t]) => (
                    <tr key={cat} className="border-t">
                      <td className="py-1">{CATEGORY_LABEL[cat] ?? cat}</td>
                      <td className="py-1 text-[10px] text-slate-500">{accountFor(cat) || '—'}</td>
                      <td className="py-1 text-right">{t.count}</td>
                      <td className="py-1 text-right">{clp(t.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t font-semibold">
                    <td className="py-1">Total identificado</td>
                    <td className="py-1"></td>
                    <td className="py-1 text-right">{detail.summary.identificadoTotal.count}</td>
                    <td className="py-1 text-right">{clp(detail.summary.identificadoTotal.amount)}</td>
                  </tr>
                  <tr className="border-t text-amber-700">
                    <td className="py-1">Por identificar</td>
                    <td className="py-1 text-[10px] text-slate-500">{accountFor('SinIdentificar') || '—'}</td>
                    <td className="py-1 text-right">{detail.summary.porIdentificar.count}</td>
                    <td className="py-1 text-right">{clp(detail.summary.porIdentificar.amount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="rounded-md border p-3">
              <h4 className="mb-2 text-sm font-semibold">
                Reclasificaciones (arrastrados identificados)
              </h4>
              {detail.summary.reclasificaciones.length === 0 ? (
                <p className="text-xs text-slate-500">Sin reclasificaciones en este cierre.</p>
              ) : (
                <table className="w-full text-xs">
                  <tbody>
                    {detail.summary.reclasificaciones.map((r) => (
                      <tr key={r.movementId} className="border-t">
                        <td className="py-1 font-mono">
                          {codeByMov.get(r.movementId) || `${r.movementId.slice(0, 10)}…`}
                        </td>
                        <td className="py-1 text-red-600">−{clp(r.amount)} (por identificar)</td>
                        <td className="py-1 text-emerald-700">
                          +{clp(r.amount)} ({CATEGORY_LABEL[r.category] ?? r.category})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Detalle por transacción */}
          <div className="max-h-[420px] overflow-auto rounded-lg border">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-100">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Banco / Cuenta</th>
                  <th className="px-3 py-2">Monto</th>
                  <th className="px-3 py-2">Categoría</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">PNRs</th>
                </tr>
              </thead>
              <tbody>
                {detail.detalle.map((d) => (
                  <tr key={d.movementId} className="border-t align-top">
                    <td className="px-3 py-2">{formatDate(d.date)}</td>
                    <td className="px-3 py-2">
                      <div>{d.bank}</div>
                      <div className="text-[10px] text-slate-500">{d.bankAccount}</div>
                      <div className="text-[10px] font-mono text-slate-400">
                        {d.displayId || d.movementId}
                      </div>
                    </td>
                    <td className="px-3 py-2">{clp(d.amount)}</td>
                    <td className="px-3 py-2">{CATEGORY_LABEL[d.category] ?? d.category}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={d.closeState === 'CerradoDefinitivo' ? 'default' : 'outline'}
                        className={
                          d.closeState === 'CerradoDefinitivo'
                            ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                            : 'bg-amber-100 text-amber-700 border-amber-200'
                        }
                      >
                        {d.closeState === 'CerradoDefinitivo' ? 'Definitivo' : 'Parcial'}
                      </Badge>
                      {d.carriedFromClosureId && (
                        <div className="text-[10px] text-slate-500 mt-1">arrastrado</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[11px]">
                      {d.pnrs.length === 0
                        ? '—'
                        : d.pnrs.map((p) => `${p.reference} (${clp(p.amount)})`).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Backlog por identificar */}
      <Card className="p-4">
        <h3 className="mb-3 text-lg font-semibold">
          Por identificar (histórico){' '}
          <span className="text-sm font-normal text-slate-500">— {backlog.length}</span>
        </h3>
        <div className="max-h-[320px] overflow-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-100">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Periodo origen</th>
                <th className="px-3 py-2">Banco / Cuenta</th>
                <th className="px-3 py-2">Monto</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Descripción</th>
              </tr>
            </thead>
            <tbody>
              {backlog.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-400">
                    No hay movimientos por identificar.
                  </td>
                </tr>
              ) : (
                backlog.map((m) => (
                  <tr key={m.movementId} className="border-t">
                    <td className="px-3 py-2">{formatDate(m.date)}</td>
                    <td className="px-3 py-2">
                      {m.originYear && m.originMonth
                        ? `${m.originYear}-${String(m.originMonth).padStart(2, '0')}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <div>{m.bank}</div>
                      <div className="text-[10px] text-slate-500">{m.bankAccount}</div>
                    </td>
                    <td className="px-3 py-2">{clp(m.amount)}</td>
                    <td className="px-3 py-2">
                      {m.closeState === 'CerradoParcial' ? 'Cerrado parcial' : 'Abierto'}
                    </td>
                    <td className="px-3 py-2">{m.description}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
