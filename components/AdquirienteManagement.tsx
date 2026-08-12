'use client';

import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableLoadingRow } from '@/components/ui/loading-row';
import { Adquiriente, UserRole } from '@/types';

interface AdquirienteManagementProps {
  adquirientes: Adquiriente[];
  onAddAdquiriente: (adquiriente: Adquiriente) => void | Promise<void>;
  onUpdateAdquiriente: (adquiriente: Adquiriente) => void | Promise<void>;
  onDeleteAdquiriente: (id: string) => void;
  onAdquirientesBulkLoaded?: (adquirientes: Adquiriente[]) => void;
  userRole?: UserRole;
  loading?: boolean;
}

const COUNTRY_OPTIONS = [
  'Chile',
  'Perú',
  'Colombia',
  'Argentina',
  'Brasil',
  'México',
  'Estados Unidos',
  'España',
  'China',
];

export function AdquirienteManagement({
  adquirientes,
  onAddAdquiriente,
  onUpdateAdquiriente,
  onDeleteAdquiriente,
  onAdquirientesBulkLoaded,
  userRole,
  loading = false,
}: AdquirienteManagementProps) {
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [sapBP, setSapBP] = useState('');
  const [country, setCountry] = useState('Chile');
  const [keywords, setKeywords] = useState('');
  const [editing, setEditing] = useState<Adquiriente | null>(null);
  // Auto-identificación en Cartola.
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoMsg, setAutoMsg] = useState<string | null>(null);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [autoAmbiguous, setAutoAmbiguous] = useState<
    { movementId: string; displayId: string | null; adquirientes: string[] }[]
  >([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingAdd, setSavingAdd] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSkipped, setBulkSkipped] = useState<{ row: number; taxId?: string; reason: string }[]>(
    []
  );

  // Solo Admin/Conciliación gestionan; otros con acceso a la pestaña solo consultan.
  const canManage = userRole === 'Administrador' || userRole === 'ConciliacionMediosDePago';

  const handleAdd = async () => {
    if (savingAdd) return;
    setFormError(null);
    if (!name.trim() || !taxId.trim() || !country.trim()) {
      setFormError('Nombre y RUT/Tax ID son obligatorios (el país por defecto es Chile).');
      return;
    }
    setSavingAdd(true);
    try {
      await onAddAdquiriente({
        id: '',
        name: name.trim(),
        taxId: taxId.trim(),
        sapBP,
        country,
        matchKeywords: keywords.trim() || null,
        isActive: true,
      });
      setName('');
      setTaxId('');
      setSapBP('');
      setCountry('Chile');
      setKeywords('');
    } finally {
      setSavingAdd(false);
    }
  };

  const startEdit = (a: Adquiriente) => {
    setEditError(null);
    setEditing({
      ...a,
      sapBP: a.sapBP ?? '',
      country: a.country ?? 'Chile',
      matchKeywords: a.matchKeywords ?? '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editing || savingEdit) return;
    setEditError(null);
    if (!editing.name?.trim() || !editing.taxId?.trim() || !editing.country?.trim()) {
      setEditError('Nombre y RUT/Tax ID son obligatorios.');
      return;
    }
    setSavingEdit(true);
    try {
      await onUpdateAdquiriente({
        id: editing.id,
        name: editing.name.trim(),
        taxId: editing.taxId.trim(),
        sapBP: editing.sapBP,
        country: editing.country,
        matchKeywords: (editing.matchKeywords ?? '').trim() || null,
      } as Adquiriente);
      setEditing(null);
    } finally {
      setSavingEdit(false);
    }
  };

  const onAutoIdentify = async () => {
    if (autoBusy) return;
    setAutoBusy(true);
    setAutoMsg(null);
    setAutoError(null);
    setAutoAmbiguous([]);
    try {
      const res = await fetch('/api/adquirientes/auto-identify', { method: 'POST' });
      const json = (await res.json()) as {
        scanned?: number;
        identified?: number;
        ambiguous?: { movementId: string; displayId: string | null; adquirientes: string[] }[];
        message?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? 'No se pudo ejecutar la auto-identificación.');
      const amb = json.ambiguous ?? [];
      setAutoAmbiguous(amb);
      setAutoMsg(
        json.message ??
          `Escaneados ${json.scanned ?? 0} movimientos sin identificar. Identificados ${json.identified ?? 0}.` +
            (amb.length ? ` ${amb.length} ambiguo(s) (ver detalle).` : '')
      );
    } catch (err) {
      setAutoError(err instanceof Error ? err.message : 'Error al auto-identificar.');
    } finally {
      setAutoBusy(false);
    }
  };

  const handleDeactivate = (a: Adquiriente) => {
    if (
      !window.confirm(
        `¿Desactivar al adquiriente ${a.name} (${a.taxId})? Dejará de estar disponible para identificar abonos.`
      )
    ) {
      return;
    }
    onDeleteAdquiriente(a.id);
  };

  const onDownloadTemplate = () => {
    const headers = ['Nombre', 'RUT', 'BP_SAP', 'Pais', 'Palabras'].join(';');
    const sample = 'Adquiriente Demo;76.123.456-7;;Chile;TRANSBANK, GETNET';
    const blob = new Blob(['﻿' + `${headers}\n${sample}\n`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'plantilla-adquirientes.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const onBulkFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBulkBusy(true);
    setBulkMsg(null);
    setBulkError(null);
    setBulkSkipped([]);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        workbook.Sheets[workbook.SheetNames[0]]
      );
      if (rows.length === 0) throw new Error('El archivo no tiene filas.');

      const payload = rows.map((r) => ({
        name: String(r.Nombre ?? r.name ?? '').trim(),
        taxId: String(r.RUT ?? r.taxId ?? '').trim(),
        sapBP: String(r.BP_SAP ?? r['BP SAP'] ?? r.sapBP ?? '').trim(),
        country: String(r.Pais ?? r['País'] ?? r.country ?? '').trim(),
        matchKeywords: String(r.Palabras ?? r['Palabras clave'] ?? r.Keywords ?? '').trim(),
      }));

      const res = await fetch('/api/adquirientes/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adquirientes: payload }),
      });
      const json = (await res.json()) as {
        created?: number;
        skipped?: { row: number; taxId?: string; reason: string }[];
        adquirientes?: Adquiriente[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? 'No se pudo procesar la carga masiva.');

      if (onAdquirientesBulkLoaded && json.adquirientes) onAdquirientesBulkLoaded(json.adquirientes);
      const skipped = json.skipped ?? [];
      setBulkSkipped(skipped);
      setBulkMsg(
        `Se cargaron ${json.created ?? 0} adquiriente(s).` +
          (skipped.length ? ` ${skipped.length} fila(s) omitida(s) (ver detalle).` : '')
      );
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Error al procesar el archivo.');
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {canManage && (
        <>
          <div className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Auto-identificación en Cartola</h3>
                <p className="text-xs text-slate-500">
                  Escanea los movimientos <strong>Sin identificar</strong> de Cartola y los marca
                  como Adquiriente cuando encuentra alguna de sus <strong>palabras clave</strong> en
                  la descripción o adicionales. Los que coincidan con más de un adquiriente se
                  omiten y se listan abajo. El canal queda pendiente de completar.
                </p>
              </div>
              <Button onClick={onAutoIdentify} disabled={autoBusy} className="shrink-0">
                {autoBusy ? 'Escaneando…' : 'Auto-identificar en Cartola'}
              </Button>
            </div>
            {autoMsg && <p className="mt-3 text-sm text-emerald-700">{autoMsg}</p>}
            {autoError && <p className="mt-3 text-sm text-red-600">{autoError}</p>}
            {autoAmbiguous.length > 0 && (
              <div className="mt-3 max-h-40 overflow-auto rounded-md border bg-amber-50/50 p-3 text-xs text-amber-800">
                <p className="mb-1 font-medium">Ambiguos (coinciden con varios adquirientes):</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {autoAmbiguous.map((a) => (
                    <li key={a.movementId}>
                      {a.displayId || a.movementId}: {a.adquirientes.join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Carga masiva de adquirientes</h3>
                <p className="text-xs text-slate-500">
                  Ideal para inicializar. Descarga la plantilla, complétala (Nombre y RUT
                  obligatorios; BP SAP y País opcionales) y súbela. Se omiten los RUT duplicados.
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" onClick={onDownloadTemplate} disabled={bulkBusy}>
                  Descargar plantilla
                </Button>
                <Button onClick={() => bulkInputRef.current?.click()} disabled={bulkBusy}>
                  {bulkBusy ? 'Cargando…' : 'Cargar archivo'}
                </Button>
                <input
                  ref={bulkInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={onBulkFile}
                />
              </div>
            </div>
            {bulkMsg && <p className="mt-3 text-sm text-emerald-700">{bulkMsg}</p>}
            {bulkError && <p className="mt-3 text-sm text-red-600">{bulkError}</p>}
            {bulkSkipped.length > 0 && (
              <div className="mt-3 max-h-40 overflow-auto rounded-md border bg-amber-50/50 p-3 text-xs text-amber-800">
                <p className="mb-1 font-medium">Filas omitidas:</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {bulkSkipped.map((s, i) => (
                    <li key={i}>
                      Fila {s.row}
                      {s.taxId ? ` (RUT ${s.taxId})` : ''}: {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-white p-4">
            <h3 className="mb-1 text-lg font-semibold">Gestión de Adquirientes</h3>
            <p className="mb-4 text-xs text-slate-500">
              Obligatorios: nombre y RUT/Tax ID. El ID App se genera automáticamente. El BP SAP es
              opcional (se puede incorporar después).
            </p>
            <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nombre Adquiriente *</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Transbank"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">RUT / Tax ID *</label>
                <Input
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder="76.123.456-7"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  BP SAP <span className="text-slate-400">(opcional)</span>
                </label>
                <Input value={sapBP} onChange={(e) => setSapBP(e.target.value)} placeholder="1000456" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">País *</label>
                <select
                  className="h-10 w-full rounded-md border bg-white px-2 text-sm"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  {COUNTRY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <label className="text-sm font-medium">
                Palabras clave para auto-identificación{' '}
                <span className="text-slate-400">(opcional; separadas por coma o salto de línea)</span>
              </label>
              <textarea
                className="min-h-[56px] w-full rounded-md border bg-white px-3 py-2 text-sm"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="Ej: TRANSBANK, GETNET, ABONO TBK"
              />
            </div>
            <div className="mt-4 flex items-center justify-end gap-3">
              {savingAdd && (
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                  Guardando, espere un momento…
                </span>
              )}
              <Button onClick={handleAdd} disabled={savingAdd}>
                {savingAdd ? 'Guardando…' : 'Registrar Adquiriente'}
              </Button>
            </div>
            {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
          </div>
        </>
      )}

      <div className="overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="px-4 py-3">ID App</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">RUT / Tax ID</th>
              <th className="px-4 py-3">BP SAP</th>
              <th className="px-4 py-3">País</th>
              <th className="px-4 py-3">Palabras clave</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingRow colSpan={8} label="Cargando adquirientes…" />
            ) : adquirientes.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center italic text-slate-400">
                  No hay adquirientes registrados.
                </td>
              </tr>
            ) : (
              adquirientes.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{a.appCode || a.id}</td>
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3">{a.taxId}</td>
                  <td className="px-4 py-3 font-mono text-xs">{a.sapBP || '-'}</td>
                  <td className="px-4 py-3">{a.country || '-'}</td>
                  <td
                    className="max-w-[220px] truncate px-4 py-3 text-xs text-slate-500"
                    title={a.matchKeywords ?? ''}
                  >
                    {a.matchKeywords || '—'}
                  </td>
                  <td className="px-4 py-3">{a.isActive === false ? 'Inactivo' : 'Activo'}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    {canManage ? (
                      <>
                        <Button variant="outline" size="sm" onClick={() => startEdit(a)}>
                          Modificar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          onClick={() => handleDeactivate(a)}
                          disabled={a.isActive === false}
                        >
                          Desactivar
                        </Button>
                      </>
                    ) : (
                      <span className="text-[11px] text-slate-400">Solo consulta</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="rounded-lg border bg-white p-4">
          <h3 className="mb-4 text-lg font-semibold">Modificar Adquiriente</h3>
          <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">ID App</label>
              <Input value={editing.appCode || editing.id} disabled />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre Adquiriente *</label>
              <Input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">RUT / Tax ID *</label>
              <Input
                value={editing.taxId}
                onChange={(e) => setEditing({ ...editing, taxId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                BP SAP <span className="text-slate-400">(opcional)</span>
              </label>
              <Input
                value={editing.sapBP ?? ''}
                onChange={(e) => setEditing({ ...editing, sapBP: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">País *</label>
              <select
                className="h-10 w-full rounded-md border bg-white px-2 text-sm"
                value={editing.country ?? 'Chile'}
                onChange={(e) => setEditing({ ...editing, country: e.target.value })}
              >
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <label className="text-sm font-medium">
              Palabras clave para auto-identificación{' '}
              <span className="text-slate-400">(separadas por coma o salto de línea)</span>
            </label>
            <textarea
              className="min-h-[56px] w-full rounded-md border bg-white px-3 py-2 text-sm"
              value={editing.matchKeywords ?? ''}
              onChange={(e) => setEditing({ ...editing, matchKeywords: e.target.value })}
              placeholder="Ej: TRANSBANK, GETNET, ABONO TBK"
            />
          </div>
          {editError && <p className="mt-3 text-sm text-red-600">{editError}</p>}
          {savingEdit && (
            <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
              Guardando, espere un momento…
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={savingEdit}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
