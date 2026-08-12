'use client';

import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { z } from 'zod';

import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Adquiriente,
  BankAccount,
  CartolaDocument,
  CartolaMovement,
  Client,
  MainIdentificationType,
  SalesChannel,
} from '@/types';

interface BankStatementManagementProps {
  availableAccounts: BankAccount[];
  clients: Client[];
  /** Adquirientes activos (para identificar abonos como Adquiriente). */
  adquirientes?: Adquiriente[];
  /** Carga inicial de datos en curso (para mostrar indicador de carga). */
  loading?: boolean;
}

const mainIdentificationMap: Record<MainIdentificationType, string> = {
  'Sin identificar': 'IDN-SIN-ID',
  Adquiriente: 'IDN-ADQ',
  GC: 'IDN-GC',
  'Cobranza crédito': 'IDN-CC',
  'Abono débito': 'IDN-AD',
};

// Canales de venta (fijos) con etiquetas legibles para el Adquiriente.
const SALES_CHANNELS: { value: SalesChannel; label: string }[] = [
  { value: 'GDS', label: 'GDS' },
  { value: 'VentaAeropuerto', label: 'Venta aeropuerto' },
  { value: 'VentaWeb', label: 'Venta web' },
];
const salesChannelLabel = (v?: SalesChannel | null) =>
  SALES_CHANNELS.find((c) => c.value === v)?.label ?? '';

const csvHeaders = [
  'Monto',
  'Descripción',
  'Fecha',
  'Banco',
  'Cuenta',
  'País',
  'Adicional1',
  'Adicional2',
  'Adicional3',
  'Adicional4',
  'Adicional5',
  'TipoPrincipal',
] as const;

const cartolaSchema = z.object({
  Monto: z.coerce.number().positive(),
  Descripción: z.string().min(1),
  Fecha: z.preprocess(
    (val) => {
      if (typeof val === 'number') {
        // Assuming Excel date serial number
        const parsedDate = XLSX.SSF.parse_date_code(val);
        // Construct a Date object from parsed components (month is 0-indexed in JS Date)
        const date = new Date(parsedDate.y, parsedDate.m - 1, parsedDate.d);
        return date.toISOString().split('T')[0]; // Convert to YYYY-MM-DD
      }
      if (typeof val === 'string') {
        // Attempt to normalize string dates to YYYY-MM-DD
        const parts = val.split(/[/|-]/);
        if (parts.length === 3) {
          // Assuming DD/MM/YYYY or DD-MM-YYYY
          if (parts[2].length === 4) {
            // DD/MM/YYYY
            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
          // Assuming YYYY/MM/DD or YYYY-MM-DD
          if (parts[0].length === 4) {
            return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          }
        }
        const d = new Date(val);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
      }
      return val; // Let z.string() handle invalid formats
    },
    z.string().min(4, 'La fecha es obligatoria y debe tener al menos 4 caracteres (YYYY-MM-DD)')
  ),
  Banco: z.string().min(1, 'El banco es obligatorio'),
  Cuenta: z.coerce.string().min(1, 'La cuenta es obligatoria'),
  País: z.string().min(1, 'El país es obligatorio'),
  Adicional1: z.string().optional().default(''),
  Adicional2: z.string().optional().default(''),
  Adicional3: z.string().optional().default(''),
  Adicional4: z.string().optional().default(''),
  Adicional5: z.string().optional().default(''),
  TipoPrincipal: z.preprocess(
    (value) => {
      if (value === null || value === undefined) return 'Sin identificar';
      const normalized = String(value).trim();
      return normalized === '' ? 'Sin identificar' : normalized;
    },
    z.enum(['Sin identificar', 'Adquiriente', 'GC', 'Cobranza crédito', 'Abono débito'])
  ),
});

const documentDetailsUploadSchema = z.object({
  MovimientoID: z.string().min(1),
  // Referencia/Monto son obligatorios para tipos con documentos (GC/Cobranza/etc.)
  // pero NO para Adquiriente (se valida por tipo en el procesamiento).
  Referencia: z.string().optional().default(''),
  Monto: z.coerce.number().optional(),
  Detalle: z.string().optional().default(''),
  TipoPrincipal: z
    .enum(['Sin identificar', 'Adquiriente', 'GC', 'Cobranza crédito', 'Abono débito'])
    .default('Sin identificar'),
  // Solo aplican cuando TipoPrincipal = Adquiriente.
  Adquiriente: z.string().optional().default(''),
  Canal: z.string().optional().default(''),
});

function generateId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now()}-${random}`;
}
const ITEMS_PER_PAGE = 100; // D 3a: tamaño de página server-side (máx 200 en el GET)

export function BankStatementManagement({
  availableAccounts,
  clients,
  adquirientes = [],
  loading = false,
}: BankStatementManagementProps) {
  const { data: session } = useSession();
  // Adquirientes activos, para el selector al identificar abonos.
  const activeAdquirientes = useMemo(
    () => adquirientes.filter((a) => a.isActive !== false),
    [adquirientes]
  );
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadOkMessage, setUploadOkMessage] = useState<string | null>(null);
  const [pendingUploadMovements, setPendingUploadMovements] = useState<CartolaMovement[]>([]);
  const [pendingUploadFileName, setPendingUploadFileName] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<'movements' | 'details'>('movements');

  // Filter states
  const [bankFilter, setBankFilter] = useState<string>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateFromFilter, setDateFromFilter] = useState<string>('');
  const [dateToFilter, setDateToFilter] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<string>('');
  // Ordenamiento server-side de la tabla de movimientos.
  type SortField = 'date' | 'amount' | 'bank' | 'descripcion' | 'tipo';
  const [sortBy, setSortBy] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
    setCurrentPage(1);
  };
  const sortIcon = (field: SortField) => (sortBy === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  // Edición de valores de movimiento (solo "Sin identificar").
  const [editMov, setEditMov] = useState<CartolaMovement | null>(null);
  const [editMovAmount, setEditMovAmount] = useState('');
  const [editMovDate, setEditMovDate] = useState('');
  const [editMovDesc, setEditMovDesc] = useState('');
  const [editMovError, setEditMovError] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // D 3a: datos paginados desde el servidor (no dependemos del array completo).
  const [serverRows, setServerRows] = useState<CartolaMovement[]>([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [serverUnidentified, setServerUnidentified] = useState(0);
  const [serverLoading, setServerLoading] = useState(false);
  const reloadTokenRef = useRef(0);

  const loadPage = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('pageSize', String(ITEMS_PER_PAGE));
    params.set('page', String(currentPage));
    if (bankFilter !== 'all') params.set('bank', bankFilter);
    if (accountFilter !== 'all') params.set('account', accountFilter);
    if (countryFilter !== 'all') params.set('country', countryFilter);
    if (typeFilter !== 'all') params.set('identification', typeFilter);
    if (dateFromFilter) params.set('dateFrom', dateFromFilter);
    if (dateToFilter) params.set('dateTo', dateToFilter);
    const q = searchFilter.trim();
    if (q) params.set('search', q);
    params.set('sortBy', sortBy);
    params.set('sortDir', sortDir);
    const token = ++reloadTokenRef.current;
    setServerLoading(true);
    try {
      const res = await fetch(`/api/cartola/movements?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as {
        movements: CartolaMovement[];
        total?: number;
        unidentifiedTotal?: number;
      };
      if (token !== reloadTokenRef.current) return; // respuesta obsoleta, la ignoramos
      setServerRows(data.movements ?? []);
      setServerTotal(data.total ?? data.movements?.length ?? 0);
      setServerUnidentified(data.unidentifiedTotal ?? 0);
    } catch {
      // silencioso: se puede reintentar cambiando filtros/página
    } finally {
      if (token === reloadTokenRef.current) setServerLoading(false);
    }
  }, [
    bankFilter,
    accountFilter,
    countryFilter,
    typeFilter,
    dateFromFilter,
    dateToFilter,
    searchFilter,
    sortBy,
    sortDir,
    currentPage,
  ]);

  // Carga (con pequeño debounce para la búsqueda) al cambiar filtros/página.
  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadPage();
    }, 250);
    return () => window.clearTimeout(t);
  }, [loadPage]);

  // D 3b: persiste 1+ movimientos POR REGISTRO reutilizando el PUT existente.
  // knownIds = solo estos ids => la reversa (knownIds - payload) queda vacía, así
  // que no toca ningún otro movimiento. Permite escribir sin cargar todo el array.
  const persistMovements = useCallback(async (list: CartolaMovement[]) => {
    if (list.length === 0) return true;
    try {
      const res = await fetch('/api/cartola/movements', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movements: list, knownIds: list.map((m) => m.movementId) }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  // Modal states
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);

  // Manual movement form states
  const [manualAmount, setManualAmount] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [manualExtras, setManualExtras] = useState<[string, string, string, string, string]>([
    '',
    '',
    '',
    '',
    '',
  ]);
  const [manualAccountId, setManualAccountId] = useState('');
  const [manualType, setManualType] = useState<MainIdentificationType>('Sin identificar');
  const [manualDocumentRef, setManualDocumentRef] = useState('');
  const [manualDocumentDetail, setManualDocumentDetail] = useState('');
  const [manualDocumentAmount, setManualDocumentAmount] = useState('');
  const [manualDocuments, setManualDocuments] = useState<CartolaDocument[]>([]);
  const [manualError, setManualError] = useState<string | null>(null);
  const [savingManual, setSavingManual] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingUpload, setSavingUpload] = useState(false);

  // Edit documents states
  const [editingMovementId, setEditingMovementId] = useState<string | null>(null);
  const [editDocumentRef, setEditDocumentRef] = useState('');
  const [editDocumentDetail, setEditDocumentDetail] = useState('');
  const [editDocumentAmount, setEditDocumentAmount] = useState('');
  const [editDocuments, setEditDocuments] = useState<CartolaDocument[]>([]);
  const [editType, setEditType] = useState<MainIdentificationType>('Sin identificar');
  const [editAdquirienteId, setEditAdquirienteId] = useState<string>('');
  const [editSalesChannel, setEditSalesChannel] = useState<SalesChannel | ''>('');
  const [editDocumentsError, setEditDocumentsError] = useState<string | null>(null);

  const selectedMovement = useMemo(
    () => serverRows.find((m) => m.movementId === selectedMovementId),
    [serverRows, selectedMovementId]
  );

  // Formato de montos según la cuenta (moneda + decimales configurados). Busca la
  // cuenta por número (y banco) para saber cuántos decimales usar. Fallback: CLP, 0.
  const findAccountFor = (bank: string, accountNumber: string) =>
    availableAccounts.find((a) => a.accountNumber === accountNumber && a.bankName === bank) ??
    availableAccounts.find((a) => a.accountNumber === accountNumber);

  const formatAmountFor = (amount: number, bank: string, accountNumber: string) => {
    const acc = findAccountFor(bank, accountNumber);
    const decimals = acc?.decimalPlaces ?? 0;
    const currency = acc?.currency ?? 'CLP';
    try {
      return amount.toLocaleString('es-CL', {
        style: 'currency',
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    } catch {
      return amount.toLocaleString('es-CL', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    }
  };

  const formatMovementAmount = (m: CartolaMovement) =>
    formatAmountFor(m.amount, m.bank, m.bankAccount);

  const adquirienteNameById = (id?: string | null) => {
    if (!id) return '';
    const a = adquirientes.find((x) => x.id === id);
    return a ? `${a.appCode ? `${a.appCode} — ` : ''}${a.name}` : id;
  };

  // Filter options based on loaded data
  const uniqueBanks = useMemo(
    () => Array.from(new Set(availableAccounts.map((a) => a.bankName))),
    [availableAccounts]
  );
  const uniqueAccounts = useMemo(
    () => Array.from(new Set(availableAccounts.map((a) => a.accountNumber))),
    [availableAccounts]
  );
  const uniqueCountries = useMemo(
    () => Array.from(new Set(availableAccounts.map((a) => a.country))),
    [availableAccounts]
  );

  const toIsoDay = (v: string): string => {
    const raw = String(v ?? '').trim();
    const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
    const dmy = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(raw);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    return raw;
  };

  // D 3a: el servidor ya aplica filtros/orden/paginado; la tabla muestra la página tal cual.
  const filteredMovements = serverRows;

  const unidentifiedCount = serverUnidentified;
  const unidentifiedRate = serverTotal === 0 ? 0 : (serverUnidentified / serverTotal) * 100;

  const prioritizedMovements = serverRows;

  // Pagination Logic (server-side)
  const totalPages = Math.max(1, Math.ceil(serverTotal / ITEMS_PER_PAGE));
  const paginatedMovements = serverRows;

  // Reset page when filters change
  useMemo(
    () => setCurrentPage(1),
    [bankFilter, accountFilter, countryFilter, typeFilter, dateFromFilter, dateToFilter, searchFilter]
  );

  const pendingUploadTotalAmount = useMemo(
    () => pendingUploadMovements.reduce((acc, m) => acc + m.amount, 0),
    [pendingUploadMovements]
  );

  const onDownloadCartolaTemplate = () => {
    const headers = csvHeaders.join(',');
    const sample =
      '10000,Abono ejemplo,21/04/2026,Banco Estado,12345678,Chile,C1,C2,C3,C4,C5,Sin identificar';
    const blob = new Blob(['\uFEFF' + `${headers}\n${sample}\n`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'plantilla-cartola-smartycash.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const onDownloadDetailsTemplate = () => {
    // Los \u00EDtems dependen del tipo: GC / Cobranza cr\u00E9dito \u2192 Referencia (PNR/factura)
    // + Monto; Adquiriente \u2192 Adquiriente + Canal (sin Referencia/Monto).
    const headers = [
      'MovimientoID',
      'Referencia',
      'Monto',
      'Detalle',
      'TipoPrincipal',
      'Adquiriente',
      'Canal',
    ].join(',');
    const sampleGC = 'CL-BAN-5678-202606-000123,ABC123,5000,PNR grupo,GC,,';
    const sampleAdq = 'CL-BAN-5678-202607-000200,,,,Adquiriente,ADQ-000001,Venta web';
    const blob = new Blob(['\uFEFF' + `${headers}\n${sampleGC}\n${sampleAdq}\n`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'plantilla-detalles-masivos.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // D 3a: para exportar TODO lo filtrado (no solo la página visible), pedimos al
  // servidor el conjunto completo (GET sin pageSize devuelve todo el filtro).
  const fetchAllForExport = useCallback(async (): Promise<CartolaMovement[]> => {
    const params = new URLSearchParams();
    if (bankFilter !== 'all') params.set('bank', bankFilter);
    if (accountFilter !== 'all') params.set('account', accountFilter);
    if (countryFilter !== 'all') params.set('country', countryFilter);
    if (typeFilter !== 'all') params.set('identification', typeFilter);
    if (dateFromFilter) params.set('dateFrom', dateFromFilter);
    if (dateToFilter) params.set('dateTo', dateToFilter);
    const q = searchFilter.trim();
    if (q) params.set('search', q);
    const res = await fetch(`/api/cartola/movements?${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as { movements?: CartolaMovement[] };
    return data.movements ?? [];
  }, [bankFilter, accountFilter, countryFilter, typeFilter, dateFromFilter, dateToFilter, searchFilter]);

  const onExportDocumentDetails = async () => {
    // Exporta TODO el conjunto filtrado (no solo la página visible).
    const rows = await fetchAllForExport();
    const data = rows.flatMap((m) =>
      m.documents.length > 0
        ? m.documents.map((d) => ({
            MovimientoID: m.displayId || m.movementId,
            Banco: m.bank,
            Cuenta: m.bankAccount,
            Referencia: d.reference,
            Monto: d.amount,
            Detalle: d.detail,
            Tipo: m.mainIdentification,
          }))
        : [
            {
              MovimientoID: m.displayId || m.movementId,
              Banco: m.bank,
              Cuenta: m.bankAccount,
              Referencia: '',
              Monto: m.amount,
              Detalle: '(sin detalle)',
              Tipo: m.mainIdentification,
            },
          ]
    );
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Detalles');
    XLSX.writeFile(wb, 'detalle_documentos_smarty.xlsx');
  };

  const onExportMovements = async () => {
    const rows = await fetchAllForExport();
    const data = rows.map((m) => {
      const acc = findAccountFor(m.bank, m.bankAccount);
      return {
        ID: m.displayId || m.movementId,
        Banco: m.bank,
        Cuenta: m.bankAccount,
        Pais: m.country,
        Moneda: acc?.currency ?? '',
        Monto: m.amount,
        Fecha: formatDate(m.date),
        Tipo: m.mainIdentification,
        Adquiriente: adquirienteNameById(m.adquirienteId),
        Canal: salesChannelLabel(m.salesChannel),
        Descripcion: m.description,
        Adicional_1: m.extraFields?.[0] ?? '',
        Adicional_2: m.extraFields?.[1] ?? '',
        Adicional_3: m.extraFields?.[2] ?? '',
        Adicional_4: m.extraFields?.[3] ?? '',
        Adicional_5: m.extraFields?.[4] ?? '',
        Documentos:
          m.documents?.map((d) => `${d.reference} (${d.amount})`).join(' | ') ?? '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');
    XLSX.writeFile(wb, 'movimientos_cartola_smarty.xlsx');
  };

  const readRowsFromFile = async (file: File): Promise<Record<string, unknown>[]> => {
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.csv')) {
      const buf = await file.arrayBuffer();
      let text = new TextDecoder('utf-8').decode(buf);
      // Si el archivo se guardó como ANSI (Windows-1252), reintenta con ese encoding.
      if (text.includes('\uFFFD')) {
        text = new TextDecoder('windows-1252').decode(buf);
      }
      text = text.replace(/^\uFEFF/, ''); // quita BOM si existe
      const workbook = XLSX.read(text, { type: 'string' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      return XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
    }
    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
      const bytes = await file.arrayBuffer();
      const workbook = XLSX.read(bytes, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      return XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
    }
    throw new Error('Formato no soportado. Usa .csv, .xlsx o .xls');
  };

  const onCartolaFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploadOkMessage(null);

    try {
      const rows = await readRowsFromFile(file);
      if (rows.length === 0) throw new Error('La planilla no tiene filas para cargar.');

      if (uploadMode === 'movements') {
        const newMovements: CartolaMovement[] = rows.map((rawRow) => {
          const normalizedRow = csvHeaders.reduce<Record<string, unknown>>((acc, header) => {
            acc[header] = rawRow[header];
            return acc;
          }, {});

          const row = cartolaSchema.parse(normalizedRow);
          const accountExists = availableAccounts.some(
            (acc) =>
              acc.bankName.toLowerCase() === row.Banco.toLowerCase() &&
              acc.accountNumber === row.Cuenta
          );

          if (!accountExists)
            throw new Error(`La cuenta ${row.Cuenta} de ${row.Banco} no está registrada.`);

          return {
            movementId: generateId('MOV'),
            ownerUserId: session?.user?.id ?? 'N/A',
            amount: row.Monto,
            bank: row.Banco,
            bankAccount: row.Cuenta,
            country: row.País,
            description: row.Descripción,
            date: row.Fecha,
            extraFields: [
              row.Adicional1 ?? '',
              row.Adicional2 ?? '',
              row.Adicional3 ?? '',
              row.Adicional4 ?? '',
              row.Adicional5 ?? '',
            ],
            mainIdentification: row.TipoPrincipal,
            mainIdentificationId: mainIdentificationMap[row.TipoPrincipal],
            documents: [],
          };
        });
        setPendingUploadMovements(newMovements);
      } else {
        // MODO DETALLE DOCS: Validaciones y limpieza de duplicados
        const parsedRows = rows.map((r) => documentDetailsUploadSchema.parse(r));

        // Agrupamos por MovimientoID para validar integridad antes de aplicar
        const groupedByMov = parsedRows.reduce(
          (acc, curr) => {
            if (!acc[curr.MovimientoID]) acc[curr.MovimientoID] = [];
            acc[curr.MovimientoID].push(curr);
            return acc;
          },
          {} as Record<string, typeof parsedRows>
        );

        // Fase 5: ya no dependemos del array compartido. Buscamos los movimientos
        // referenciados en el servidor (por id o displayId), validamos y persistimos
        // por registro con el PUT (persistMovements) igual que el resto de Cartola.
        const movIds = Object.keys(groupedByMov);
        const lookupRes = await fetch('/api/cartola/movements/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: movIds }),
        });
        if (!lookupRes.ok) {
          throw new Error('No fue posible consultar los movimientos en el servidor.');
        }
        const lookupData = (await lookupRes.json()) as { movements: CartolaMovement[] };
        const foundList = lookupData.movements ?? [];
        const findMov = (id: string) =>
          foundList.find((m) => m.movementId === id || m.displayId === id);

        const round2 = (n: number) => Math.round(n * 100) / 100;
        const updatedList: CartolaMovement[] = [];

        for (const movId of movIds) {
          const details = groupedByMov[movId]!;
          const movement = findMov(movId);
          if (!movement) throw new Error(`El MovimientoID ${movId} no existe.`);

          // 1. Validar Tipo Único
          const firstType = details[0]!.TipoPrincipal;
          if (details.some((d) => d.TipoPrincipal !== firstType)) {
            throw new Error(
              `Inconsistencia en ID ${movId}: Múltiples tipos principales detectados.`
            );
          }

          // Adquiriente: se identifica por adquiriente + canal (sin PNR/Monto).
          if (firstType === 'Adquiriente') {
            const first = details[0]!;
            const key = first.Adquiriente.trim().toUpperCase();
            const adq = key
              ? activeAdquirientes.find((a) =>
                  [a.appCode, a.taxId, a.sapBP, a.name, a.id]
                    .filter((v): v is string => !!v)
                    .some((v) => v.trim().toUpperCase() === key)
                )
              : undefined;
            if (!adq) {
              throw new Error(
                `Movimiento ${movId}: Adquiriente "${first.Adquiriente}" no está registrado.`
              );
            }
            const chNorm = first.Canal.trim().toLowerCase();
            const channel = SALES_CHANNELS.find(
              (c) => c.value.toLowerCase() === chNorm || c.label.toLowerCase() === chNorm
            )?.value;
            if (!channel) {
              throw new Error(
                `Movimiento ${movId}: Canal "${first.Canal}" inválido (usa GDS / Venta aeropuerto / Venta web).`
              );
            }
            updatedList.push({
              ...movement,
              documents: [],
              mainIdentification: 'Adquiriente',
              mainIdentificationId: mainIdentificationMap['Adquiriente'],
              adquirienteId: adq.id,
              salesChannel: channel,
            });
            continue;
          }

          // Tipos con documentos (GC/Cobranza/Abono/Sin identificar): Referencia y
          // Monto son obligatorios en cada fila.
          for (const d of details) {
            if (!d.Referencia.trim() || d.Monto === undefined) {
              throw new Error(
                `Movimiento ${movId}: cada detalle requiere Referencia y Monto (tipo ${firstType}).`
              );
            }
          }

          // Abono débito: el detalle referencia clientes registrados (navitaireCode o appCode).
          if (firstType === 'Abono débito') {
            const clientCodes = new Set(
              clients
                .flatMap((c) => [c.navitaireCode, c.appCode])
                .filter((x): x is string => !!x)
                .map((x) => x.toUpperCase())
            );
            for (const d of details) {
              if (!clientCodes.has(String(d.Referencia).toUpperCase())) {
                throw new Error(
                  `Movimiento ${movId}: el código "${d.Referencia}" (Abono débito) no corresponde a un cliente registrado.`
                );
              }
            }
          }

          // 2. Validar Cuadratura de Montos (redondeo a 2 decimales + tolerancia de $0.01)
          const totalDetails = round2(details.reduce((sum, d) => sum + (d.Monto ?? 0), 0));
          if (Math.abs(totalDetails - round2(movement.amount)) > 0.01) {
            throw new Error(
              `Cuadratura fallida en ID ${movId}: Cartola $${movement.amount} vs detalle $${totalDetails}.`
            );
          }

          // 3. Limpiar y Reemplazar (Previene duplicados)
          updatedList.push({
            ...movement,
            documents: details.map((d) => ({
              id: generateId('DOC'),
              reference: d.Referencia,
              amount: d.Monto ?? 0,
              detail: d.Detalle,
            })),
            mainIdentification: firstType,
            mainIdentificationId: mainIdentificationMap[firstType],
            adquirienteId: null,
            salesChannel: null,
          });
        }

        const okDetails = await persistMovements(updatedList);
        if (!okDetails) {
          throw new Error('No fue posible guardar los detalles en el servidor.');
        }
        setUploadOkMessage(`Carga exitosa. Se actualizaron ${updatedList.length} movimientos.`);
        window.setTimeout(() => void loadPage(), 800);
      }

      setPendingUploadFileName(file.name);
      if (uploadMode === 'movements')
        setUploadOkMessage('Archivo procesado. Revisa y confirma la carga.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No fue posible procesar la carga.';
      setUploadError(message);
      setPendingUploadMovements([]);
      setPendingUploadFileName(null);
    } finally {
      event.target.value = '';
    }
  };

  const onConfirmMassUpload = async () => {
    if (pendingUploadMovements.length === 0 || savingUpload) return;
    setSavingUpload(true);
    try {
      const ok = await persistMovements(pendingUploadMovements);
      if (!ok) {
        setUploadError('No fue posible guardar la carga en el servidor.');
        return;
      }
      setUploadOkMessage(`Carga exitosa: ${pendingUploadMovements.length} movimientos creados.`);
      setPendingUploadMovements([]);
      setPendingUploadFileName(null);
      setCurrentPage(1);
      void loadPage();
    } finally {
      setSavingUpload(false);
    }
  };

  const openEditMov = (m: CartolaMovement) => {
    const role = session?.user?.role;
    const canTouchClosed = role === 'Administrador' || role === 'Contabilidad';
    if (m.closeState === 'CerradoDefinitivo' && !canTouchClosed) {
      setUploadError('Movimiento CERRADO contablemente. Solo Contabilidad puede editarlo.');
      return;
    }
    setEditMovError(null);
    setEditMov(m);
    setEditMovAmount(String(m.amount));
    setEditMovDate(m.date);
    setEditMovDesc(m.description);
  };

  const onSaveMovEdit = async () => {
    if (!editMov || savingEdit) return;
    setEditMovError(null);
    const amount = Number(editMovAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setEditMovError('El monto debe ser un número positivo.');
      return;
    }
    if (!editMovDate) {
      setEditMovError('Indica la fecha.');
      return;
    }
    if (!editMovDesc.trim()) {
      setEditMovError('La descripción es obligatoria.');
      return;
    }
    const updated: CartolaMovement = {
      ...editMov,
      amount,
      date: editMovDate,
      description: editMovDesc.trim(),
    };
    setSavingEdit(true);
    try {
      const ok = await persistMovements([updated]);
      if (!ok) {
        setEditMovError('No fue posible guardar el cambio en el servidor.');
        return;
      }
      setEditMov(null);
      void loadPage();
    } finally {
      setSavingEdit(false);
    }
  };

  const onDeleteMovement = async (movementId: string) => {
    const target = serverRows.find((m) => m.movementId === movementId);
    // Gate de cierre contable: un movimiento CerradoDefinitivo solo lo puede
    // anular/reversar Contabilidad o Administrador.
    const role = session?.user?.role;
    const canTouchClosed = role === 'Administrador' || role === 'Contabilidad';
    if (target?.closeState === 'CerradoDefinitivo' && !canTouchClosed) {
      setUploadError(
        'Movimiento CERRADO contablemente. Solo Contabilidad puede reversarlo/reabrirlo.'
      );
      return;
    }
    // Antes se bloqueaba anular un movimiento identificado. Ahora se permite (con
    // confirmación): al anularlo se libera/reversa. Si estaba ligado a una
    // solicitud/documento, revisa ese caso aparte.
    if (target && target.mainIdentification !== 'Sin identificar') {
      if (
        !window.confirm(
          `Este movimiento está identificado como "${target.mainIdentification}". ¿Anularlo/reversarlo de todos modos? Se quitará de la cartola.`
        )
      ) {
        return;
      }
    } else {
      // Movimiento sin identificar: igual pedimos confirmación antes de borrar.
      if (
        !window.confirm('¿Borrar este movimiento de la cartola? Esta acción no se puede deshacer.')
      ) {
        return;
      }
    }

    if (selectedMovementId === movementId) {
      setSelectedMovementId(null);
    }
    // D 3b: reversa explícita en el servidor y refresco de la página actual.
    try {
      const res = await fetch('/api/cartola/movements', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movementIds: [movementId] }),
      });
      if (!res.ok) {
        setUploadError('No fue posible reversar el movimiento en el servidor.');
        return;
      }
    } catch {
      setUploadError('No fue posible reversar el movimiento en el servidor.');
      return;
    }
    void loadPage();
  };

  const onOpenDocumentEditor = (movementId: string) => {
    const target = serverRows.find((m) => m.movementId === movementId);
    if (!target) return;
    setEditingMovementId(movementId);
    setEditDocuments([...target.documents]);
    setEditType(target.mainIdentification);
    setEditAdquirienteId(target.adquirienteId ?? '');
    setEditSalesChannel((target.salesChannel as SalesChannel | null) ?? '');
    setEditDocumentRef('');
    setEditDocumentDetail('');
    setEditDocumentAmount('');
    setEditDocumentsError(null);
    setIsDocumentModalOpen(true);
  };

  const onAddEditDocument = () => {
    setEditDocumentsError(null);
    const amount = Number(editDocumentAmount);
    if (!editDocumentRef.trim()) {
      setEditDocumentsError('La referencia del documento es obligatoria.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setEditDocumentsError('El monto debe ser válido.');
      return;
    }
    setEditDocuments((prev) => [
      ...prev,
      {
        id: generateId('DOC'),
        reference: editDocumentRef.trim(),
        detail: editDocumentDetail.trim(),
        amount,
      },
    ]);
    setEditDocumentRef('');
    setEditDocumentDetail('');
    setEditDocumentAmount('');
  };

  const onSaveEditedDocuments = async () => {
    setEditDocumentsError(null);
    if (!editingMovementId) return;
    const target = serverRows.find((m) => m.movementId === editingMovementId);
    if (!target) return;

    if (editType === 'Sin identificar') {
      // Lógica de reversión: Al volver a "Sin identificar", borramos los documentos
      const cleared: CartolaMovement = {
        ...target,
        documents: [],
        mainIdentification: 'Sin identificar',
        mainIdentificationId: mainIdentificationMap['Sin identificar'],
        adquirienteId: null,
        salesChannel: null,
      };
      const okClear = await persistMovements([cleared]);
      if (!okClear) {
        setEditDocumentsError('No fue posible guardar en el servidor.');
        return;
      }
      setIsDocumentModalOpen(false);
      setEditingMovementId(null);
      void loadPage();
      return;
    }

    // Adquiriente: se identifica por adquiriente + canal (sin documentos/PNR).
    if (editType === 'Adquiriente') {
      if (!editAdquirienteId) {
        setEditDocumentsError('Selecciona el adquiriente.');
        return;
      }
      if (!editSalesChannel) {
        setEditDocumentsError('Selecciona el canal de venta.');
        return;
      }
      const identified: CartolaMovement = {
        ...target,
        documents: [],
        mainIdentification: 'Adquiriente',
        mainIdentificationId: mainIdentificationMap['Adquiriente'],
        adquirienteId: editAdquirienteId,
        salesChannel: editSalesChannel,
      };
      const okAdq = await persistMovements([identified]);
      if (!okAdq) {
        setEditDocumentsError('No fue posible guardar en el servidor.');
        return;
      }
      setIsDocumentModalOpen(false);
      setEditingMovementId(null);
      void loadPage();
      return;
    }

    if (editDocuments.length === 0) {
      setEditDocumentsError('Al menos un documento es requerido.');
      return;
    }

    const total = editDocuments.reduce((acc, d) => acc + d.amount, 0);
    if (total !== target.amount) {
      setEditDocumentsError(`La suma (${total}) debe ser igual al monto (${target.amount}).`);
      return;
    }

    const reconciled: CartolaMovement = {
      ...target,
      documents: editDocuments,
      mainIdentification: editType,
      mainIdentificationId: mainIdentificationMap[editType],
      adquirienteId: null,
      salesChannel: null,
    };
    const okRec = await persistMovements([reconciled]);
    if (!okRec) {
      setEditDocumentsError('No fue posible guardar en el servidor.');
      return;
    }
    setIsDocumentModalOpen(false);
    setEditingMovementId(null);
    void loadPage();
  };

  const onCreateManualMovement = async () => {
    if (savingManual) return; // evita doble envío mientras guarda
    setManualError(null);
    const rawAmount = Number(manualAmount);
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      setManualError('Monto inválido.');
      return;
    }
    if (!manualDescription.trim() || !manualDate.trim()) {
      setManualError('Descripción y fecha obligatorias.');
      return;
    }
    const selectedAcc = availableAccounts.find((a) => a.id === manualAccountId);
    if (!selectedAcc) {
      setManualError('Debes seleccionar una cuenta bancaria destino.');
      return;
    }
    // Redondeo según los decimales configurados en la cuenta destino (0 = CLP/Chile
    // sin decimales, 2 = USD/centavos, etc.).
    const decimals = selectedAcc.decimalPlaces ?? 0;
    const factor = 10 ** decimals;
    const amount = Math.round(rawAmount * factor) / factor;

    const documentsTotal = manualDocuments.reduce((acc, d) => acc + d.amount, 0);
    // Documentos opcionales: sin documentos el movimiento queda "por identificar".
    // Si se agregan, deben cuadrar con el monto (con tolerancia por decimales).
    if (manualDocuments.length > 0 && Math.abs(documentsTotal - amount) > 0.001) {
      setManualError(`La suma (${documentsTotal}) debe ser igual al monto (${amount}).`);
      return;
    }

    const movement: CartolaMovement = {
      movementId: generateId('MOV'),
      ownerUserId: session?.user?.id ?? 'N/A',
      amount,
      bank: selectedAcc.bankName,
      bankAccount: selectedAcc.accountNumber,
      country: selectedAcc.country,
      description: manualDescription.trim(),
      date: manualDate.trim(),
      extraFields: manualExtras,
      mainIdentification: manualType,
      mainIdentificationId: mainIdentificationMap[manualType],
      documents: manualDocuments,
    };

    setSavingManual(true);
    try {
      const ok = await persistMovements([movement]);
      if (!ok) {
        setManualError('No fue posible guardar el movimiento en el servidor.');
        return;
      }
      setIsMovementModalOpen(false);
      setManualAmount('');
      setManualDocuments([]);
      setCurrentPage(1);
      void loadPage();
    } finally {
      setSavingManual(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Carga masiva */}
      <div className="rounded-lg border bg-white p-4">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h3 className="text-lg font-semibold">Módulo de Carga</h3>
          <div className="flex bg-slate-100 p-1 rounded-md">
            <button
              className={`px-3 py-1 text-xs rounded-md transition-all ${uploadMode === 'movements' ? 'bg-white shadow-sm font-medium' : 'text-slate-500'}`}
              onClick={() => setUploadMode('movements')}
            >
              Cartola
            </button>
            <button
              className={`px-3 py-1 text-xs rounded-md transition-all ${uploadMode === 'details' ? 'bg-white shadow-sm font-medium' : 'text-slate-500'}`}
              onClick={() => setUploadMode('details')}
            >
              Detalle Docs
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={
              uploadMode === 'movements' ? onDownloadCartolaTemplate : onDownloadDetailsTemplate
            }
          >
            Descargar plantilla {uploadMode === 'movements' ? 'Cartola' : 'Detalles'}
          </Button>
          <label className="cursor-pointer rounded-md border bg-white px-3 py-2 text-sm hover:bg-slate-50">
            Subir {uploadMode === 'movements' ? 'Cartola' : 'Excel de Detalles'}
            <input
              className="hidden"
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={onCartolaFileUpload}
            />
          </label>
          <Button variant="secondary" onClick={onExportMovements}>
            Exportar Movimientos
          </Button>
          <div className="h-6 w-[1px] bg-slate-200 mx-2" />
          <Button variant="secondary" onClick={onExportDocumentDetails}>
            Exportar Detalles actuales
          </Button>
        </div>
        {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}
        {uploadOkMessage && <p className="mt-2 text-sm text-emerald-600">{uploadOkMessage}</p>}
        {pendingUploadMovements.length > 0 && (
          <div className="mt-3 rounded-md border bg-slate-50 p-3 text-sm">
            <p>
              <span className="font-semibold">Archivo:</span> {pendingUploadFileName}
            </p>
            <p>
              <span className="font-semibold">Movimientos:</span> {pendingUploadMovements.length}
            </p>
            <p>
              <span className="font-semibold">Monto total:</span>{' '}
              {pendingUploadTotalAmount.toLocaleString('es-CL', {
                style: 'currency',
                currency: 'CLP',
              })}
            </p>
            <Button className="mt-2" onClick={onConfirmMassUpload} disabled={savingUpload}>
              {savingUpload ? 'Guardando…' : 'Confirmar carga'}
            </Button>
            {savingUpload && (
              <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                Guardando la carga en base de datos, espere un momento…
              </p>
            )}
          </div>
        )}
      </div>

      {/* Tabla de movimientos */}
      <div className="rounded-lg border bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">Movimientos cartola</h3>
          <Button onClick={() => setIsMovementModalOpen(true)}>Agregar movimiento</Button>
        </div>

        {/* Panel de Filtros */}
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Banco</label>
            <select
              className="h-9 rounded-md border bg-white px-2 text-sm"
              value={bankFilter}
              onChange={(e) => setBankFilter(e.target.value)}
            >
              <option value="all">Todos los bancos</option>
              {uniqueBanks.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Cuenta</label>
            <SearchableSelect
              value={accountFilter}
              onChange={setAccountFilter}
              allLabel="Todas las cuentas"
              placeholder="Buscar cuenta…"
              options={uniqueAccounts.map((a) => ({ value: a, label: a }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">País</label>
            <select
              className="h-9 rounded-md border bg-white px-2 text-sm"
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
            >
              <option value="all">Todos los países</option>
              {uniqueCountries.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Tipo</label>
            <select
              className="h-9 rounded-md border bg-white px-2 text-sm"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">Todos los tipos</option>
              {['Sin identificar', 'Adquiriente', 'GC', 'Cobranza crédito', 'Abono débito'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Fecha desde</label>
            <input
              type="date"
              className="h-9 rounded-md border bg-white px-2 text-sm"
              value={dateFromFilter}
              onChange={(e) => setDateFromFilter(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Fecha hasta</label>
            <input
              type="date"
              className="h-9 rounded-md border bg-white px-2 text-sm"
              value={dateToFilter}
              onChange={(e) => setDateToFilter(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-xs font-medium text-slate-500">Buscar (ID / descripción / PNR)</label>
            <input
              type="text"
              className="h-9 rounded-md border bg-white px-2 text-sm"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Ej. CL-BAN… / abono / ABC123"
            />
          </div>
        </div>

        <section
          className={`mb-3 rounded-md border p-3 text-sm ${unidentifiedRate > 20 ? 'border-red-200 bg-red-50 text-red-700' : unidentifiedRate > 10 ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
        >
          Movimientos sin identificar: <span className="font-semibold">{unidentifiedCount}</span> de{' '}
          <span className="font-semibold">{serverTotal}</span> (
          <span className="font-semibold">{unidentifiedRate.toFixed(1)}%</span>).
        </section>
        <div className="max-h-[700px] overflow-auto rounded-lg border">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-100">
              <tr>
                <th className="px-3 py-2">ID Mov.</th>
                <th
                  className="cursor-pointer select-none px-3 py-2 hover:text-jetsmart-blue"
                  onClick={() => toggleSort('bank')}
                  title="Ordenar por banco"
                >
                  Banco / Cuenta{sortIcon('bank')}
                </th>
                <th
                  className="cursor-pointer select-none px-3 py-2 hover:text-jetsmart-blue"
                  onClick={() => toggleSort('amount')}
                  title="Ordenar por monto"
                >
                  Monto{sortIcon('amount')}
                </th>
                <th
                  className="cursor-pointer select-none px-3 py-2 hover:text-jetsmart-blue"
                  onClick={() => toggleSort('descripcion')}
                  title="Ordenar por descripción"
                >
                  Descripción{sortIcon('descripcion')}
                </th>
                <th
                  className="cursor-pointer select-none px-3 py-2 hover:text-jetsmart-blue"
                  onClick={() => toggleSort('date')}
                  title="Ordenar por fecha"
                >
                  Fecha{sortIcon('date')}
                </th>
                <th
                  className="cursor-pointer select-none px-3 py-2 hover:text-jetsmart-blue"
                  onClick={() => toggleSort('tipo')}
                  title="Ordenar por tipo"
                >
                  Tipo{sortIcon('tipo')}
                </th>
                <th className="px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading || serverLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                      Cargando movimientos…
                    </span>
                  </td>
                </tr>
              ) : paginatedMovements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-slate-400">
                    No hay movimientos para mostrar.
                  </td>
                </tr>
              ) : (
                paginatedMovements.map((m) => (
                <tr
                  key={m.movementId}
                  className={`border-t align-top transition-colors ${m.mainIdentification !== 'Sin identificar' ? 'bg-emerald-50/40' : ''}`}
                >
                  <td className="px-3 py-3 text-[10px] font-mono text-slate-400">{m.displayId || m.movementId}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium">{m.bank}</div>
                    <div className="text-[10px] text-slate-500">
                      {m.bankAccount} ({m.country})
                    </div>
                  </td>
                  <td className="px-3 py-3">{formatMovementAmount(m)}</td>
                  <td className="px-3 py-3">{m.description}</td>
                  <td className="px-3 py-3">{formatDate(m.date)}</td>
                  <td className="px-3 py-3">{m.mainIdentification}</td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedMovementId(m.movementId)}
                      >
                        Detalle
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenDocumentEditor(m.movementId)}
                      >
                        Docs
                      </Button>
                      {m.mainIdentification === 'Sin identificar' && (
                        <Button variant="outline" size="sm" onClick={() => openEditMov(m)}>
                          Editar
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => onDeleteMovement(m.movementId)}
                      >
                        {m.mainIdentification === 'Sin identificar' ? 'Borrar' : 'Anular'}
                      </Button>
                    </div>
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination UI */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((prev) => prev - 1)}
            >
              Anterior
            </Button>
            <span className="text-sm font-medium">
              Página {currentPage} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((prev) => prev + 1)}
            >
              Siguiente
            </Button>
          </div>
        )}
      </div>

      {/* Detalle Documentos (modal aparte) */}
      {selectedMovement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-lg p-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Detalle del movimiento</h3>
              <button
                className="text-slate-400 hover:text-slate-600"
                onClick={() => setSelectedMovementId(null)}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-semibold">
                {selectedMovement.displayId || selectedMovement.movementId}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
                <span>
                  <span className="text-slate-400">Banco:</span> {selectedMovement.bank}
                </span>
                <span>
                  <span className="text-slate-400">Cuenta:</span> {selectedMovement.bankAccount} (
                  {selectedMovement.country})
                </span>
                <span>
                  <span className="text-slate-400">Monto:</span>{' '}
                  {formatMovementAmount(selectedMovement)}
                </span>
                <span>
                  <span className="text-slate-400">Fecha:</span> {formatDate(selectedMovement.date)}
                </span>
                <span>
                  <span className="text-slate-400">Tipo:</span>{' '}
                  {selectedMovement.mainIdentification}
                </span>
                {selectedMovement.adquirienteId && (
                  <span>
                    <span className="text-slate-400">Adquiriente:</span>{' '}
                    {adquirienteNameById(selectedMovement.adquirienteId)}
                  </span>
                )}
                {selectedMovement.salesChannel && (
                  <span>
                    <span className="text-slate-400">Canal:</span>{' '}
                    {salesChannelLabel(selectedMovement.salesChannel)}
                  </span>
                )}
              </div>
              {selectedMovement.description && (
                <p className="text-sm text-slate-700">
                  <span className="text-slate-400">Descripción:</span> {selectedMovement.description}
                </p>
              )}
              {selectedMovement.extraFields?.some((v) => v && v.trim()) && (
                <div className="rounded-md border bg-slate-50 p-2 text-xs text-slate-600">
                  <p className="mb-1 font-medium text-slate-500">Adicionales</p>
                  <div className="grid grid-cols-1 gap-0.5">
                    {selectedMovement.extraFields.map((v, i) =>
                      v && v.trim() ? (
                        <span key={i}>
                          <span className="text-slate-400">Adicional {i + 1}:</span> {v}
                        </span>
                      ) : null
                    )}
                  </div>
                </div>
              )}
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">Documentos</p>
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-3">
                  {selectedMovement.documents.length === 0 ? (
                    <p className="text-sm text-slate-600">Sin documentos asignados.</p>
                  ) : (
                    selectedMovement.documents.map((doc) => (
                      <div key={doc.id} className="rounded-md border p-2 text-sm">
                        <p className="font-medium">{doc.reference}</p>
                        <p className="text-slate-600">{doc.detail}</p>
                        <p>
                          {formatAmountFor(
                            doc.amount,
                            selectedMovement.bank,
                            selectedMovement.bankAccount
                          )}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={() => setSelectedMovementId(null)}>
                Cerrar
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Modals integrados en el componente */}
      {editMov && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md p-6">
            <h3 className="mb-1 text-lg font-semibold">
              Editar movimiento {editMov.displayId || editMov.movementId}
            </h3>
            <p className="mb-4 text-xs text-slate-500">
              Solo movimientos sin identificar. Ajusta monto, fecha y descripción.
            </p>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Monto</label>
                <Input
                  type="number"
                  value={editMovAmount}
                  onChange={(e) => setEditMovAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Fecha</label>
                <Input
                  type="date"
                  value={editMovDate}
                  onChange={(e) => setEditMovDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Descripción</label>
                <Input value={editMovDesc} onChange={(e) => setEditMovDesc(e.target.value)} />
              </div>
              {editMovError && <p className="text-xs text-red-600">{editMovError}</p>}
              {savingEdit && (
                <p className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                  Guardando en base de datos, espere un momento…
                </p>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditMov(null)} disabled={savingEdit}>
                Cancelar
              </Button>
              <Button onClick={onSaveMovEdit} disabled={savingEdit}>
                {savingEdit ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </Card>
        </div>
      )}
      {isMovementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
            <h3 className="mb-4 text-lg font-semibold">Nuevo movimiento</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-medium">Cuenta Bancaria Destino</label>
                <SearchableSelect
                  value={manualAccountId}
                  onChange={setManualAccountId}
                  placeholder="Selecciona una cuenta..."
                  options={availableAccounts.map((acc) => ({
                    value: acc.id,
                    label: `${acc.bankName} - ${acc.accountNumber} (${acc.country})`,
                  }))}
                />
              </div>
              <Input
                type="number"
                placeholder="Monto"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
              />
              <Input
                type="date"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
              />
              <Input
                className="md:col-span-2"
                placeholder="Descripción"
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
              />
              {manualExtras.map((val, i) => (
                <Input
                  key={i}
                  placeholder={`Adicional ${i + 1}`}
                  value={val}
                  onChange={(e) => {
                    const next = [...manualExtras] as [string, string, string, string, string];
                    next[i] = e.target.value;
                    setManualExtras(next);
                  }}
                />
              ))}
            </div>
            {/* Form para agregar documentos al manual */}
            <div className="mt-4 space-y-2 border-t pt-4">
              <h4 className="text-sm font-semibold">Documentos</h4>
              <div className="flex gap-2">
                <Input
                  placeholder="Ref"
                  value={manualDocumentRef}
                  onChange={(e) => setManualDocumentRef(e.target.value)}
                />
                <Input
                  type="number"
                  placeholder="Monto"
                  value={manualDocumentAmount}
                  onChange={(e) => setManualDocumentAmount(e.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    const amt = Number(manualDocumentAmount);
                    if (manualDocumentRef && amt > 0) {
                      setManualDocuments([
                        ...manualDocuments,
                        {
                          id: generateId('DOC'),
                          reference: manualDocumentRef,
                          detail: manualDocumentDetail,
                          amount: amt,
                        },
                      ]);
                      setManualDocumentRef('');
                      setManualDocumentAmount('');
                    }
                  }}
                >
                  Add
                </Button>
              </div>
              <div className="max-h-24 overflow-auto">
                {manualDocuments.map((d) => (
                  <div key={d.id} className="flex justify-between text-xs border-b py-1">
                    <span>
                      {d.reference} - ${d.amount}
                    </span>
                    <button
                      className="text-red-500"
                      onClick={() =>
                        setManualDocuments(manualDocuments.filter((x) => x.id !== d.id))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
            {manualError && <p className="mt-2 text-xs text-red-600">{manualError}</p>}
            {savingManual && (
              <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                Guardando en base de datos, espere un momento…
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsMovementModalOpen(false)}
                disabled={savingManual}
              >
                Cancelar
              </Button>
              <Button onClick={onCreateManualMovement} disabled={savingManual}>
                {savingManual ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {isDocumentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-lg p-6">
            <h3 className="mb-4 text-lg font-semibold">Categorización y Documentos</h3>

            <div className="mb-4 space-y-2">
              <label className="text-sm font-medium">Tipo de Identificación</label>
              <select
                className="w-full h-10 rounded-md border bg-white px-3 text-sm"
                value={editType}
                onChange={(e) => setEditType(e.target.value as MainIdentificationType)}
              >
                {['Sin identificar', 'Adquiriente', 'GC', 'Cobranza crédito', 'Abono débito'].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500 italic">
                Si selecciona &quot;Sin identificar&quot;, se borraran los documentos al guardar.
              </p>
            </div>

            {editType === 'Adquiriente' ? (
              // Adquiriente se identifica por adquiriente + canal (no por documentos).
              <div className="mb-4 space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Adquiriente</label>
                  <select
                    className="h-10 w-full rounded-md border bg-white px-2 text-sm"
                    value={editAdquirienteId}
                    onChange={(e) => setEditAdquirienteId(e.target.value)}
                  >
                    <option value="">Selecciona adquiriente…</option>
                    {activeAdquirientes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {(a.appCode ? `${a.appCode} — ` : '') + a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Canal de venta</label>
                  <select
                    className="h-10 w-full rounded-md border bg-white px-2 text-sm"
                    value={editSalesChannel}
                    onChange={(e) => setEditSalesChannel(e.target.value as SalesChannel | '')}
                  >
                    <option value="">Selecciona canal…</option>
                    {SALES_CHANNELS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                {activeAdquirientes.length === 0 && (
                  <p className="text-[11px] text-amber-600">
                    No hay adquirientes registrados. Créalos en la pestaña Adquirientes.
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="flex gap-2 mb-4">
                  {editType === 'Abono débito' ? (
                    <select
                      className="h-10 flex-1 rounded-md border bg-white px-2 text-sm"
                      value={editDocumentRef}
                      onChange={(e) => setEditDocumentRef(e.target.value)}
                    >
                      <option value="">Selecciona cliente…</option>
                      {clients.map((c) => {
                        const code = c.navitaireCode || c.appCode || '';
                        return (
                          <option key={c.id} value={code}>
                            {code} — {c.name}
                          </option>
                        );
                      })}
                    </select>
                  ) : (
                    <Input
                      placeholder="Ref"
                      value={editDocumentRef}
                      onChange={(e) => setEditDocumentRef(e.target.value)}
                    />
                  )}
                  <Input
                    type="number"
                    placeholder="Monto"
                    value={editDocumentAmount}
                    onChange={(e) => setEditDocumentAmount(e.target.value)}
                  />
                  <Button onClick={onAddEditDocument}>Add</Button>
                </div>
                <div className="max-h-52 overflow-y-auto rounded-md border p-2">
                  {editDocuments.map((d) => (
                    <div
                      key={d.id}
                      className="flex justify-between items-center text-sm border-b py-2"
                    >
                      <span>
                        {d.reference} (${d.amount})
                      </span>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setEditDocuments(editDocuments.filter((x) => x.id !== d.id))}
                      >
                        X
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
            {editDocumentsError && (
              <p className="mt-2 text-xs text-red-600">{editDocumentsError}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsDocumentModalOpen(false)}>
                Cerrar
              </Button>
              <Button onClick={onSaveEditedDocuments}>Guardar</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
