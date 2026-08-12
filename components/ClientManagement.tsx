'use client';

import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableLoadingRow } from '@/components/ui/loading-row';
import { Client, UserRole } from '@/types';

interface ClientManagementProps {
  clients: Client[];
  onAddClient: (client: Client) => void | Promise<void>;
  onUpdateClient: (client: Client) => void | Promise<void>;
  onDeleteClient: (id: string) => void;
  /** #9 Validar un cliente Pendiente (solo roles validadores). */
  onValidateClient?: (id: string) => void;
  /** Reemplaza la lista de clientes tras una carga masiva. */
  onClientsBulkLoaded?: (clients: Client[]) => void;
  /** Rol activo, para gating de acciones (#9). */
  userRole?: UserRole;
  /** Id del usuario en sesión, para saber si el Agente CC es dueño del cliente. */
  currentUserId?: string;
  /** Carga inicial de datos maestros en curso (para mostrar indicador). */
  loading?: boolean;
}

export function ClientManagement({
  clients,
  onAddClient,
  onUpdateClient,
  onDeleteClient,
  onValidateClient,
  onClientsBulkLoaded,
  userRole,
  currentUserId,
  loading = false,
}: ClientManagementProps) {
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [navitaireCode, setNavitaireCode] = useState('');
  const [sapBP, setSapBP] = useState('');
  const [country, setCountry] = useState('Chile');
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingAdd, setSavingAdd] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  // Carga masiva
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSkipped, setBulkSkipped] = useState<{ row: number; taxId?: string; reason: string }[]>(
    []
  );
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

  // #9 Roles: el Agente CC crea (y edita sus clientes solo mientras están Pendiente);
  // los validadores (Admin/Recaudación/Cobranza) editan, validan y desactivan.
  const isAgente = userRole === 'AgenteCC';
  const isValidator =
    userRole === 'Administrador' || userRole === 'Recaudacion' || userRole === 'Cobranza';
  // Quién puede CREAR clientes (alta individual + carga masiva). Otros roles con
  // acceso a la pestaña (p. ej. Contabilidad) solo consultan la lista.
  const canCreate = isAgente || isValidator;

  // El Agente CC solo puede modificar SU cliente mientras siga Pendiente.
  const agenteCanEdit = (client: Client) =>
    isAgente &&
    client.validationStatus === 'Pendiente' &&
    !!currentUserId &&
    client.createdById === currentUserId;

  const handleAdd = async () => {
    if (savingAdd) return;
    setFormError(null);
    if (!name.trim() || !taxId.trim() || !country.trim()) {
      setFormError('Nombre de agencia, RUT/Tax ID y país son obligatorios.');
      return;
    }
    setSavingAdd(true);
    try {
      await onAddClient({
        id: '',
        name: name.trim(),
        taxId: taxId.trim(),
        navitaireCode,
        sapBP,
        country,
        isActive: true,
      });
      setName('');
      setTaxId('');
      setNavitaireCode('');
      setSapBP('');
      setCountry('Chile');
    } finally {
      setSavingAdd(false);
    }
  };

  const startEdit = (client: Client) => {
    setEditError(null);
    setEditingClient({
      ...client,
      navitaireCode: client.navitaireCode ?? '',
      sapBP: client.sapBP ?? '',
      country: client.country ?? 'Chile',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingClient || savingEdit) return;
    setEditError(null);
    if (!editingClient.name?.trim() || !editingClient.taxId?.trim() || !editingClient.country?.trim()) {
      setEditError('Nombre de agencia, RUT/Tax ID y país son obligatorios.');
      return;
    }
    setSavingEdit(true);
    try {
      // Enviamos SOLO los campos editables (sin validationStatus/isActive) para no
      // chocar con las restricciones del Agente CC en el servidor.
      await onUpdateClient({
        id: editingClient.id,
        name: editingClient.name.trim(),
        taxId: editingClient.taxId.trim(),
        navitaireCode: editingClient.navitaireCode,
        sapBP: editingClient.sapBP,
        country: editingClient.country,
      } as Client);
      setEditingClient(null);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleValidate = (client: Client) => {
    if (!onValidateClient) return;
    if (
      !window.confirm(
        `¿Validar al cliente ${client.name} (${client.appCode || client.id})? Quedará disponible como validado.`
      )
    ) {
      return;
    }
    onValidateClient(client.id);
  };

  const onDownloadTemplate = () => {
    const headers = ['Nombre', 'RUT', 'Navitaire', 'BP_SAP', 'Pais'].join(';');
    // Navitaire/BP SAP opcionales; el país por defecto es Chile si se deja vacío.
    const sample = 'Latam Travel;77.123.456-K;;;Chile';
    const blob = new Blob(['﻿' + `${headers}\n${sample}\n`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'plantilla-clientes.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const onBulkFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // permite volver a subir el mismo archivo
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
        navitaireCode: String(r.Navitaire ?? r.navitaireCode ?? '').trim(),
        sapBP: String(r.BP_SAP ?? r['BP SAP'] ?? r.sapBP ?? '').trim(),
        country: String(r.Pais ?? r['País'] ?? r.country ?? '').trim(),
      }));

      const res = await fetch('/api/clients/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clients: payload }),
      });
      const json = (await res.json()) as {
        created?: number;
        skipped?: { row: number; taxId?: string; reason: string }[];
        clients?: Client[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? 'No se pudo procesar la carga masiva.');

      if (onClientsBulkLoaded && json.clients) onClientsBulkLoaded(json.clients);
      const skipped = json.skipped ?? [];
      setBulkSkipped(skipped);
      setBulkMsg(
        `Se cargaron ${json.created ?? 0} cliente(s).` +
          (skipped.length ? ` ${skipped.length} fila(s) omitida(s) (ver detalle).` : '')
      );
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Error al procesar el archivo.');
    } finally {
      setBulkBusy(false);
    }
  };

  const handleDeactivate = (client: Client) => {
    if (
      !window.confirm(
        `¿Desactivar al cliente ${client.name} (${client.taxId})? Dejará de estar disponible para nuevas solicitudes.`
      )
    ) {
      return;
    }
    onDeleteClient(client.id);
  };

  return (
    <div className="space-y-6">
      {canCreate && (
      <>
      <div className="rounded-lg border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Carga masiva de clientes</h3>
            <p className="text-xs text-slate-500">
              Ideal para inicializar. Descarga la plantilla, complétala (Nombre y RUT
              obligatorios; Navitaire, BP SAP y País opcionales) y súbela. Se omiten los RUT
              duplicados.
              {isAgente ? ' Como Agente CC, los clientes quedan Pendientes de validación.' : ''}
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
        <h3 className="mb-1 text-lg font-semibold">Gestion de Clientes</h3>
        <p className="mb-4 text-xs text-slate-500">
          Obligatorios: nombre de agencia, RUT/Tax ID y país. El ID App se genera
          automáticamente. Navitaire y BP SAP son opcionales
          {isAgente ? ' (los completa Recaudación/Cobranza al validar).' : '.'}
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-5 items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium">Nombre Cliente / Agencia *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Latam Travel"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">RUT / Tax ID *</label>
            <Input
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder="77.123.456-K"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Cod. Navitaire <span className="text-slate-400">(opcional)</span>
            </label>
            <Input
              value={navitaireCode}
              onChange={(e) => setNavitaireCode(e.target.value)}
              placeholder="N-123"
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
          <Button onClick={handleAdd} disabled={savingAdd}>
            {savingAdd ? 'Guardando…' : 'Registrar Cliente'}
          </Button>
        </div>
        {savingAdd && (
          <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
            Guardando, espere un momento…
          </p>
        )}
        {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
      </div>

      </>
      )}

      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-4 py-3">ID App</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">RUT / Tax ID</th>
              <th className="px-4 py-3">Navitaire</th>
              <th className="px-4 py-3">SAP BP</th>
              <th className="px-4 py-3">País</th>
              <th className="px-4 py-3">Validación</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Accion</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingRow colSpan={9} label="Cargando clientes…" />
            ) : clients.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400 italic">
                  No hay clientes registrados.
                </td>
              </tr>
            ) : (
              clients.map((client) => {
                const isPending = client.validationStatus === 'Pendiente';
                const canAgente = agenteCanEdit(client);
                return (
                  <tr
                    key={client.id}
                    className={`border-b last:border-0 ${isPending ? 'bg-amber-50/40' : ''}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs">{client.appCode || client.id}</td>
                    <td className="px-4 py-3 font-medium">{client.name}</td>
                    <td className="px-4 py-3">{client.taxId}</td>
                    <td className="px-4 py-3 font-mono text-xs">{client.navitaireCode || '-'}</td>
                    <td className="px-4 py-3 font-mono text-xs">{client.sapBP || '-'}</td>
                    <td className="px-4 py-3">{client.country || '-'}</td>
                    <td className="px-4 py-3">
                      {isPending ? (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                          Pendiente
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                          Validado
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">{client.isActive === false ? 'Inactivo' : 'Activo'}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {/* Validadores: modificar + validar (si pendiente) + desactivar. */}
                      {isValidator && (
                        <>
                          {isPending && onValidateClient && (
                            <Button
                              size="sm"
                              className="bg-emerald-600 text-white hover:bg-emerald-700"
                              onClick={() => handleValidate(client)}
                            >
                              Validar
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => startEdit(client)}>
                            Modificar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600"
                            onClick={() => handleDeactivate(client)}
                            disabled={client.isActive === false}
                          >
                            Desactivar
                          </Button>
                        </>
                      )}
                      {/* Agente CC: solo modificar su cliente mientras esté Pendiente. */}
                      {isAgente &&
                        (canAgente ? (
                          <Button variant="outline" size="sm" onClick={() => startEdit(client)}>
                            Modificar
                          </Button>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        ))}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {editingClient && (
        <div className="rounded-lg border bg-white p-4">
          <h3 className="mb-4 text-lg font-semibold">Modificar Cliente</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5 items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium">ID App</label>
              <Input value={editingClient.appCode || editingClient.id} disabled />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre Cliente / Agencia *</label>
              <Input
                value={editingClient.name}
                onChange={(e) => setEditingClient({ ...editingClient, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">RUT / Tax ID *</label>
              <Input
                value={editingClient.taxId}
                onChange={(e) => setEditingClient({ ...editingClient, taxId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Cod. Navitaire <span className="text-slate-400">(opcional)</span>
              </label>
              <Input
                value={editingClient.navitaireCode ?? ''}
                onChange={(e) =>
                  setEditingClient({ ...editingClient, navitaireCode: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                BP SAP <span className="text-slate-400">(opcional)</span>
              </label>
              <Input
                value={editingClient.sapBP ?? ''}
                onChange={(e) => setEditingClient({ ...editingClient, sapBP: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">País *</label>
              <select
                className="h-10 w-full rounded-md border bg-white px-2 text-sm"
                value={editingClient.country ?? 'Chile'}
                onChange={(e) => setEditingClient({ ...editingClient, country: e.target.value })}
              >
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {editError && <p className="mt-3 text-sm text-red-600">{editError}</p>}
          {savingEdit && (
            <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
              Guardando, espere un momento…
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingClient(null)} disabled={savingEdit}>
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
