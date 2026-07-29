'use client';

import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  BankAccount,
  CartolaMovement,
  CollectionRequest,
  Client,
  CartolaDocument,
  UserRole,
  MainIdentificationType,
  RequestAttachment,
} from '@/types'; // Assuming these exist or need to be created

interface RecaudacionManagementProps {
  userRole: UserRole;
  bankAccounts: BankAccount[];
  clients: Client[];
  movements: CartolaMovement[];
  setMovements: React.Dispatch<React.SetStateAction<CartolaMovement[]>>;
  requests: CollectionRequest[];
  setRequests: React.Dispatch<React.SetStateAction<CollectionRequest[]>>;
  onReconcile: (movementId: string, documents: CartolaDocument[]) => void;
}

export function RecaudacionManagement({
  userRole,
  bankAccounts,
  clients,
  movements,
  setMovements,
  requests,
  setRequests,
  onReconcile,
}: RecaudacionManagementProps) {
  const [manualMatchMovId, setManualMatchMovId] = useState<Record<string, string>>({});
  // D 2b: candidatos de movimiento traidos del servidor bajo demanda
  // (reemplaza el filtrado sobre la lista completa `movements`).
  const [candidatesByReq, setCandidatesByReq] = useState<Record<string, CartolaMovement[]>>({});
  // Filtros del panel (delimitan tabla Y export).
  const [fEstado, setFEstado] = useState<string>('all');
  const [fCliente, setFCliente] = useState<string>('all');
  const [fCuenta, setFCuenta] = useState<string>('all');
  const [fDesde, setFDesde] = useState<string>('');
  const [fHasta, setFHasta] = useState<string>('');
  const [fSearch, setFSearch] = useState<string>('');
  const [fDateBasis, setFDateBasis] = useState<'transfer' | 'created'>('transfer');
  // Modal "Ver tiempos"
  const [tiemposReq, setTiemposReq] = useState<CollectionRequest | null>(null);
  const [selectedAccId, setSelectedAccId] = useState('');
  const [transferDate, setTransferDate] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [pnrRef, setPnrRef] = useState('');
  const [pnrAmount, setPnrAmount] = useState('');
  const [tempDocs, setTempDocs] = useState<CartolaDocument[]>([]);
  const [supportFiles, setSupportFiles] = useState<File[]>([]);
  const [authorizationCode, setAuthorizationCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Edit/View states
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [viewingPnrs, setViewingPnrs] = useState<CartolaDocument[]>([]);
  const [isPnrsModalOpen, setIsPnrsModalOpen] = useState(false);
  const [isUploadSupportModalOpen, setIsUploadSupportModalOpen] = useState(false);
  const [currentRequestToUploadSupport, setCurrentRequestToUploadSupport] =
    useState<CollectionRequest | null>(null);
  const [newSupportFilesForRequest, setNewSupportFilesForRequest] = useState<File[]>([]);

  const isAgente = userRole === 'AgenteCC' || userRole === 'Administrador';
  const isRecaudacion = userRole === 'Recaudacion' || userRole === 'Administrador';

  // Busca un movimiento de cartola "Sin identificar" que calce con la solicitud
  // (cuenta + monto + fecha + banco). Se usa para preaprobar automáticamente al
  // adjuntar el comprobante a un caso que venía Pendiente (p. ej. de carga masiva).
  const findMatchingMovement = async (req: {
    bankAccountId: string;
    amount: number;
    transferDate: string;
  }): Promise<CartolaMovement | undefined> => {
    const account = bankAccounts.find((a) => a.id === req.bankAccountId);
    if (!account) return undefined;
    let candidates: CartolaMovement[] = [];
    try {
      const res = await fetch(
        `/api/cartola/movements/candidates?amount=${encodeURIComponent(req.amount)}`,
        { cache: 'no-store' }
      );
      if (!res.ok) return undefined;
      const body = (await res.json()) as { candidates?: CartolaMovement[] };
      candidates = body.candidates ?? [];
    } catch {
      return undefined;
    }
    const [y, mo, d] = req.transferDate.split('-');
    const reversed = `${d}-${mo}-${y}`;
    const slashed = `${d}/${mo}/${y}`;
    return candidates.find(
      (mv) =>
        mv.bankAccount.toString().replace(/\D/g, '') === account.accountNumber.replace(/\D/g, '') &&
        Math.round(mv.amount) === Math.round(req.amount) &&
        mv.mainIdentification === 'Sin identificar' &&
        (mv.date.includes(req.transferDate) ||
          mv.date.includes(reversed) ||
          mv.date.includes(slashed)) &&
        mv.bank.toLowerCase().includes(account.bankName.toLowerCase())
    );
  };

  const generateRequestId = () =>
    `REQ-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

  // D 2b: consulta candidatos 'Sin identificar' al servidor (monto +/-1),
  // sin depender de tener toda la cartola cargada en el cliente.
  const loadCandidates = async (req: CollectionRequest) => {
    try {
      const res = await fetch(
        `/api/cartola/movements/candidates?amount=${encodeURIComponent(req.amount)}`,
        { cache: 'no-store' }
      );
      if (!res.ok) return;
      const body = (await res.json()) as { candidates?: CartolaMovement[] };
      setCandidatesByReq((prev) => ({ ...prev, [req.id]: body.candidates ?? [] }));
    } catch {
      // silencioso: si falla, el selector queda vacio y se puede reintentar
    }
  };

  const onAddPnr = () => {
    // Validación alfanumérica de 6 caracteres
    if (pnrRef.length !== 6 || !/^[a-zA-Z0-9]+$/.test(pnrRef)) {
      setError('El PNR debe ser exactamente de 6 caracteres alfanuméricos.');
      return;
    }
    const amt = Number(pnrAmount);
    if (isNaN(amt) || amt <= 0) {
      setError('El monto del PNR debe ser un número positivo.');
      return;
    }

    if (tempDocs.some((d) => d.reference.toUpperCase() === pnrRef.toUpperCase())) {
      setError('Este PNR ya ha sido agregado a esta solicitud.');
      return;
    }

    setTempDocs([
      ...tempDocs,
      { id: `PNR-${Date.now()}`, reference: pnrRef, amount: amt, detail: 'Carga Agente CC' },
    ]);
    setPnrRef('');
    setPnrAmount('');
    setError(null);
  };

  const onDownloadMassUploadTemplate = () => {
    const headers = [
      'Cuenta',
      'Fecha',
      'ClienteID',
      'CodigoAutorizacion',
      'PNR',
      'MontoPNR',
      'MontoTotal',
    ].join(',');
    const sample = '12345678,21/05/2024,CLI-1,AUTH123,ABC123,50000,50000';
    const blob = new Blob(['\uFEFF' + `${headers}\n${sample}\n`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'plantilla-recaudacion-masiva.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const onMassUploadRequests = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(worksheet);

      // Estructura esperada: Cuenta, Fecha, ClienteID, PNR, MontoPNR, MontoTotal
      const newRequests: CollectionRequest[] = [];
      const seenAuthKeys = new Set<string>();

      // Agrupamos por una "llave" única de solicitud en el Excel
      const groups = rows.reduce((acc: any, row: any) => {
        const key = `${row.Cuenta}-${row.Fecha}-${row.MontoTotal}-${row.ClienteID}-${row.CodigoAutorizacion}`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(row);
        return acc;
      }, {});

      for (const key in groups) {
        const groupRows = groups[key];
        const first = groupRows[0];

        // --- Validaciones de formato y existencia ---
        const totalAmount = Number(first.MontoTotal);
        if (isNaN(totalAmount) || totalAmount <= 0)
          throw new Error(`MontoTotal inválido en solicitud ${key}.`);

        const pnrSum = groupRows.reduce((s: number, r: any) => s + Number(r.MontoPNR), 0);
        if (Math.round(totalAmount) !== Math.round(pnrSum)) {
          throw new Error(
            `Falla de cuadratura en solicitud con PNR ${first.PNR}: Total $${totalAmount} vs Detalle $${pnrSum}`
          );
        }

        const account = bankAccounts.find((a) => a.accountNumber === String(first.Cuenta));
        if (!account)
          throw new Error(`La cuenta ${first.Cuenta} no está registrada en el sistema.`);

        // ClienteID en la planilla puede ser: código App, código Navitaire,
        // BP SAP, RUT o el id interno. Comparación flexible (case-insensitive).
        const clienteRaw = String(first.ClienteID ?? '').trim();
        const clienteKey = clienteRaw.toUpperCase();
        const client = clients.find((c) =>
          [c.appCode, c.navitaireCode, c.sapBP, c.taxId, c.id]
            .filter((v): v is string => !!v)
            .some((v) => v.trim().toUpperCase() === clienteKey)
        );
        if (!client)
          throw new Error(
            `ClienteID "${clienteRaw}" no corresponde a ningún cliente registrado (App/Navitaire/BP SAP/RUT).`
          );

        // Código de autorización: OBLIGATORIO (igual que el formulario) y único
        // por (código + cuenta + monto + cliente). Validamos en el archivo y
        // contra la base cargada; el servidor revalida de forma autoritativa.
        const authCode = String(first.CodigoAutorizacion ?? '').trim();
        if (!authCode)
          throw new Error(`Solicitud ${key}: falta el código de autorización (obligatorio).`);
        const dupKey = [
          authCode.toUpperCase(),
          account.id,
          client.id,
          Math.round(totalAmount),
        ].join('|');
        if (seenAuthKeys.has(dupKey))
          throw new Error(
            `Código de autorización duplicado en el archivo: ${authCode} (misma cuenta, monto y cliente).`
          );
        const existingDup = requests.find(
          (r) =>
            r.status !== 'Anulado' &&
            (r.authorizationCode ?? '').trim().toUpperCase() === authCode.toUpperCase() &&
            r.bankAccountId === account.id &&
            r.clientId === client.id &&
            Math.round(r.amount) === Math.round(totalAmount)
        );
        if (existingDup)
          throw new Error(
            `Ya existe una solicitud (${existingDup.id}) con el código ${authCode} para la misma cuenta, monto y cliente.`
          );
        seenAuthKeys.add(dupKey);

        // Fecha: acepta dd/mm/yyyy (o yyyy-mm-dd) y normaliza a ISO (yyyy-mm-dd).
        const rawFecha = String(first.Fecha).trim();
        const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawFecha);
        const dmy = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(rawFecha);
        let isoDate: string;
        if (ymd) isoDate = `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
        else if (dmy) isoDate = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
        else throw new Error(`Formato de fecha inválido (usa dd/mm/yyyy) en solicitud ${key}.`);

        const docs: CartolaDocument[] = groupRows.map((r: any) => {
          const pnr = String(r.PNR).toUpperCase();
          if (pnr.length !== 6 || !/^[a-zA-Z0-9]+$/.test(pnr))
            throw new Error(`PNR inválido (${pnr}) en solicitud ${key}.`);
          const pnrAmt = Number(r.MontoPNR);
          if (isNaN(pnrAmt) || pnrAmt <= 0)
            throw new Error(`MontoPNR inválido para PNR ${pnr} en solicitud ${key}.`);

          return {
            id: `PNR-${Math.random()}`,
            reference: pnr,
            amount: pnrAmt,
            detail: 'Carga Masiva Agente',
          };
        });
        // --- Fin Validaciones ---

        // D 2d: match contra el servidor (no contra la lista completa en cliente).
        const matchingMov = await findMatchingMovement({
          bankAccountId: account.id,
          amount: totalAmount,
          transferDate: isoDate,
        });

        newRequests.push({
          id: generateRequestId(),
          bankAccountId: account.id,
          transferDate: isoDate,
          amount: totalAmount,
          clientId: client.id,
          authorizationCode: authCode,
          supportFileName: '',
          // La carga masiva NO trae comprobante: entra como Pendiente. Guardamos
          // el posible match para preaprobar automáticamente cuando se adjunte
          // el comprobante más tarde.
          status: 'Pendiente',
          associatedMovementId: matchingMov?.movementId,
          documents: docs,
        });
      }
      setRequests([...newRequests, ...requests]);
      alert(`Carga masiva exitosa. Se crearon ${newRequests.length} solicitudes.`);
    } catch (err: any) {
      setError(err.message || 'Error al procesar carga masiva.');
    } finally {
      event.target.value = ''; // Clear file input
    }
  };

  const onSubmitRequest = async () => {
    setError(null);

    // Validación de campos obligatorios
    if (
      !selectedAccId ||
      !transferDate ||
      !totalAmount ||
      !selectedClientId ||
      !authorizationCode.trim()
    ) {
      setError('Todos los campos son obligatorios, incluyendo el código de autorización.');
      return;
    }
    if (!editingRequestId && supportFiles.length === 0) {
      setError('Debe adjuntar al menos un comprobante.');
      return;
    }

    if (tempDocs.length === 0) {
      setError('Debe ingresar al menos un PNR en el detalle de documentos.');
      return;
    }

    const total = Number(totalAmount);
    if (isNaN(total) || total <= 0) {
      setError('El monto total debe ser un número positivo.');
      return;
    }

    const docsSum = tempDocs.reduce((sum, d) => sum + d.amount, 0);
    if (Math.round(total) !== Math.round(docsSum)) {
      setError(
        `El monto total ($${total.toLocaleString()}) no coincide con la suma de los PNRs ($${docsSum.toLocaleString()}).`
      );
      return;
    }

    const account = bankAccounts.find((a) => a.id === selectedAccId);
    if (!account) {
      setError('La cuenta seleccionada no es válida.');
      return;
    }

    // Lógica de Preaprobación Automática Robusta
    // transferDate viene como YYYY-MM-DD desde el input
    // D 2d: preaprobacion automatica: el match lo resuelve el servidor (endpoint
    // de candidatos), sin depender de la cartola completa cargada en cliente.
    const matchingMovement = await findMatchingMovement({
      bankAccountId: selectedAccId,
      amount: total,
      transferDate,
    });

    // Pre-chequeo en cliente (mejor UX); el servidor valida de forma autoritativa
    // contra el historico completo aunque no este cargado en pantalla.
    const code = authorizationCode.trim();
    const duplicate = requests.find(
      (r) =>
        r.id !== editingRequestId &&
        (r.authorizationCode ?? '').trim().toUpperCase() === code.toUpperCase() &&
        r.bankAccountId === selectedAccId &&
        r.clientId === selectedClientId &&
        Math.round(r.amount) === Math.round(total)
    );
    if (duplicate) {
      setError(
        `Ya existe una solicitud (${duplicate.id}) con ese codigo de autorizacion para la misma cuenta, monto y cliente.`
      );
      return;
    }

    const existingReq = editingRequestId
      ? requests.find((r) => r.id === editingRequestId)
      : undefined;
    let uploaded: RequestAttachment[] = [];
    if (supportFiles.length > 0) {
      try {
        uploaded = await uploadAttachments(supportFiles);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudieron subir los comprobantes.');
        return;
      }
    }
    const mergedAttachments = [...(existingReq?.attachments ?? []), ...uploaded];

    const newRequest: CollectionRequest = {
      id: editingRequestId || generateRequestId(),
      bankAccountId: selectedAccId,
      transferDate,
      amount: total,
      clientId: selectedClientId,
      supportFileName: mergedAttachments[0]?.fileName ?? existingReq?.supportFileName ?? '',
      authorizationCode: code,
      attachments: mergedAttachments,
      attachmentIds: uploaded.map((a) => a.id),
      // Preaprobación automática SOLO si además hay comprobante adjunto.
      status: matchingMovement && mergedAttachments.length > 0 ? 'Preaprobado' : 'Pendiente',
      associatedMovementId: matchingMovement?.movementId,
      documents: tempDocs,
    };

    if (editingRequestId) {
      setRequests(requests.map((req) => (req.id === editingRequestId ? newRequest : req)));
      setEditingRequestId(null);
      alert('Solicitud actualizada correctamente.');
    } else {
      setRequests([newRequest, ...requests]);
      alert('Solicitud enviada correctamente.');
    }

    // Reset Form
    setTempDocs([]);
    setTotalAmount('');
    setTransferDate('');
    setSelectedAccId('');
    setSelectedClientId('');
    setSupportFiles([]);
    setAuthorizationCode('');
    setError(null);
  };

  const onEditRequest = (req: CollectionRequest) => {
    setEditingRequestId(req.id);
    setSelectedAccId(req.bankAccountId);
    setTransferDate(req.transferDate);
    setTotalAmount(req.amount.toString());
    setSelectedClientId(req.clientId);
    setTempDocs(req.documents);
    setAuthorizationCode(req.authorizationCode ?? '');
    // supportFile cannot be pre-filled for security reasons, user must re-upload if needed
    setSupportFiles([]);
    setError(null);
  };

  const onCancelEdit = () => {
    setEditingRequestId(null);
    setTempDocs([]);
    setTotalAmount('');
    setTransferDate('');
    setSelectedAccId('');
    setSelectedClientId('');
    setSupportFiles([]);
    setAuthorizationCode('');
    setError(null);
  };

  const onRequestInfo = (reqId: string) => {
    const req = requests.find((r) => r.id === reqId);
    if (!req) return;
    const comment = prompt('Indique qué información adicional se requiere (ej. SWIFT/MT103):');
    if (!comment) return;

    // El servidor libera el movimiento asociado (vuelve a "por identificar") de
    // forma atómica al guardar el estado InformacionSolicitada.
    setRequests(
      requests.map((r) =>
        r.id === reqId ? { ...r, status: 'InformacionSolicitada', infoRequestComment: comment } : r
      )
    );
    alert(
      'Se solicitó información al Agente CC. El movimiento asociado se liberará a "por identificar" y el caso quedó prioritario para él.'
    );
  };

  const onRespondInfo = (reqId: string) => {
    const req = requests.find((r) => r.id === reqId);
    if (!req) return;
    if (!req.attachments || req.attachments.length === 0) {
      alert('Adjunte el comprobante SWIFT/MT103 antes de responder.');
      return;
    }
    setRequests(requests.map((r) => (r.id === reqId ? { ...r, status: 'Pendiente' } : r)));
    alert('Información enviada. La solicitud volvió a la cola de Recaudación.');
  };

  const onProcessAction = (reqId: string, action: 'Aprobar' | 'Rechazar') => {
    const req = requests.find((r) => r.id === reqId);
    if (!req) return;

    if (action === 'Rechazar') {
      const comment = prompt('Ingrese el motivo del rechazo:');
      if (!comment) return;

      // La liberación del movimiento (volver a "por identificar") la hace el
      // servidor de forma atómica al guardar el estado Rechazado.
      setRequests(
        requests.map((r) =>
          r.id === reqId ? { ...r, status: 'Rechazado', rejectionComment: comment } : r
        )
      );
      alert('Solicitud rechazada. El movimiento asociado se liberará a "por identificar".');
    } else {
      // Aprobar. Comprobante obligatorio: no se puede aprobar sin al menos uno.
      if (!req.attachments || req.attachments.length === 0) {
        alert('No se puede aprobar sin un comprobante adjunto. Adjunta el comprobante primero.');
        return;
      }
      if (req.status === 'Pendiente') {
        const selectedId = manualMatchMovId[reqId];
        if (!selectedId) {
          alert('Debe vincular un movimiento de cartola para aprobar.');
          return;
        }
        onReconcile(selectedId, req.documents);
        // D 2d: guardamos displayId+banco del candidato elegido (denormalizado
        // optimista) para mostrar el vinculo sin depender de la cartola completa.
        const chosenMov = (candidatesByReq[reqId] ?? []).find((m) => m.movementId === selectedId);
        setRequests(
          requests.map((r) =>
            r.id === reqId
              ? {
                  ...r,
                  status: 'Aprobado',
                  associatedMovementId: selectedId,
                  associatedMovementDisplayId: chosenMov?.displayId ?? r.associatedMovementDisplayId,
                  associatedMovementBank: chosenMov?.bank ?? r.associatedMovementBank,
                }
              : r
          )
        );
      } else {
        // Preaprobado, solo confirmar
        setRequests(requests.map((r) => (r.id === req.id ? { ...r, status: 'Aprobado' } : r)));
      }
      alert('Solicitud aprobada correctamente.');
    }
  };

  // Reversa de un APROBADO (Recaudación/Admin): vuelve a "Info solicitada" con un
  // comentario y libera el movimiento asociado a "por identificar" (lo hace el
  // servidor). Bloqueado por el gate de cierre contable si el movimiento está
  // CerradoDefinitivo (solo Contabilidad podría en ese caso).
  const onReverseApproved = (reqId: string) => {
    const req = requests.find((r) => r.id === reqId);
    if (!req) return;
    const comment = prompt(
      'Motivo de la reversa (se enviará al Agente CC solicitando información):'
    );
    if (!comment) return;
    setRequests(
      requests.map((r) =>
        r.id === reqId
          ? { ...r, status: 'InformacionSolicitada', infoRequestComment: comment }
          : r
      )
    );
    alert(
      'Solicitud reversada. Volvió a "Info solicitada" con tu comentario y el movimiento se liberó a "por identificar".'
    );
  };

  // Estado FINAL del Agente CC: tras Aprobado, marca que ya gestionó el cobro con
  // el cliente final. El movimiento permanece identificado (no se libera).
  const onMarkGestionadoCC = (reqId: string) => {
    const req = requests.find((r) => r.id === reqId);
    if (!req || req.status !== 'Aprobado') return;
    if (
      !window.confirm(
        '¿Marcar como "Gestionado CC"? Es el estado final: confirma que ya gestionaste el cobro con el cliente.'
      )
    ) {
      return;
    }
    setRequests(requests.map((r) => (r.id === reqId ? { ...r, status: 'GestionadoCC' } : r)));
    alert('Caso marcado como Gestionado CC.');
  };

  // Anulación de un PENDIENTE por el Agente CC (su propio caso, sin conciliación).
  // Se quita de la lista: la sincronización lo anula en el servidor.
  const onAnnulPending = (reqId: string) => {
    if (
      !window.confirm(
        '¿Anular esta solicitud pendiente? Se eliminará de la lista y quedará anulada.'
      )
    ) {
      return;
    }
    setRequests(requests.map((r) => (r.id === reqId ? { ...r, status: 'Anulado' } : r)));
    alert('Solicitud anulada.');
  };

  const onUploadSupportFileForRequest = (req: CollectionRequest) => {
    setCurrentRequestToUploadSupport(req);
    setIsUploadSupportModalOpen(true);
  };

  const handleSupportFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    setNewSupportFilesForRequest(Array.from(event.target.files ?? []));
  };

  // Sube archivos al servidor (multipart). Con collectionRequestId quedan
  // vinculados de inmediato a esa solicitud.
  const uploadAttachments = async (
    files: File[],
    collectionRequestId?: string
  ): Promise<RequestAttachment[]> => {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    if (collectionRequestId) fd.append('collectionRequestId', collectionRequestId);
    const res = await fetch('/api/recaudacion/attachments', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudieron subir los comprobantes.');
    return data.attachments as RequestAttachment[];
  };

  const onConfirmUploadSupport = async () => {
    if (!currentRequestToUploadSupport || newSupportFilesForRequest.length === 0) {
      alert('Por favor, seleccione al menos un archivo.');
      return;
    }
    const targetId = currentRequestToUploadSupport.id;
    try {
      const uploaded = await uploadAttachments(newSupportFilesForRequest, targetId);
      let autoPreapproved = false;
      // D 2d: resolvemos el match contra el servidor ANTES de actualizar el estado
      // (no se puede await dentro del updater). Solo aplica si venia Pendiente.
      const targetReq = requests.find((r) => r.id === targetId);
      let matchedMov: CartolaMovement | undefined;
      if (targetReq && targetReq.status === 'Pendiente') {
        matchedMov = await findMatchingMovement({
          bankAccountId: targetReq.bankAccountId,
          amount: targetReq.amount,
          transferDate: targetReq.transferDate,
        });
      }
      setRequests((prev) =>
        prev.map((req) => {
          if (req.id !== targetId) return req;
          const withFiles = {
            ...req,
            supportFileName: req.supportFileName || uploaded[0]?.fileName || '',
            attachments: [...(req.attachments ?? []), ...uploaded],
          };
          if (withFiles.status === 'Pendiente' && matchedMov) {
            autoPreapproved = true;
            return {
              ...withFiles,
              status: 'Preaprobado',
              associatedMovementId: matchedMov.movementId,
            };
          }
          return withFiles;
        })
      );
      alert(
        autoPreapproved
          ? `Comprobante adjunto. La solicitud ${targetId} quedó Preaprobada (calzó con un movimiento).`
          : `Se adjuntaron ${uploaded.length} comprobante(s) a la solicitud ${targetId}.`
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudieron subir los comprobantes.');
      return;
    }
    setIsUploadSupportModalOpen(false);
    setNewSupportFilesForRequest([]);
    setCurrentRequestToUploadSupport(null);
  };

  const onDeleteAttachment = async (reqId: string, attachmentId: string) => {
    const res = await fetch(`/api/recaudacion/attachments/${attachmentId}`, { method: 'DELETE' });
    if (!res.ok) {
      alert('No se pudo eliminar el comprobante.');
      return;
    }
    setRequests((prev) =>
      prev.map((r) =>
        r.id === reqId
          ? { ...r, attachments: (r.attachments ?? []).filter((a) => a.id !== attachmentId) }
          : r
      )
    );
  };

  // Normaliza una fecha (ISO o dd/mm/yyyy) a 'yyyy-mm-dd' para comparar rangos.
  const toIsoDay = (v: string): string => {
    const raw = String(v ?? '').trim();
    const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
    const dmy = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(raw);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    return raw;
  };

  // Lista filtrada: la tabla Y el export usan ESTO, así el export nunca trae
  // filas fuera del rango/criterios seleccionados.
  const filteredRequests = requests.filter((r) => {
    // "Todos" incluye todo (también anulados). Un estado puntual filtra a ese estado.
    if (fEstado !== 'all' && r.status !== fEstado) return false;
    if (fCliente !== 'all' && r.clientId !== fCliente) return false;
    if (fCuenta !== 'all' && r.bankAccountId !== fCuenta) return false;
    const baseDate = fDateBasis === 'created' ? (r.createdAt ?? r.transferDate) : r.transferDate;
    const day = toIsoDay(baseDate);
    if (fDesde && day < fDesde) return false;
    if (fHasta && day > fHasta) return false;
    const q = fSearch.trim().toLowerCase();
    if (q) {
      const cli = clients.find((c) => c.id === r.clientId);
      const hay = [
        r.id,
        r.authorizationCode,
        r.associatedMovementId,
        cli?.name,
        cli?.appCode,
        cli?.navitaireCode,
        cli?.sapBP,
        ...r.documents.map((d) => d.reference),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Horas entre dos marcas ISO (para el informe de tiempos por etapa).
  const hoursBetween = (a?: string, b?: string): string => {
    if (!a || !b) return '';
    const ms = new Date(b).getTime() - new Date(a).getTime();
    if (!Number.isFinite(ms) || ms < 0) return '';
    return (ms / 3600000).toFixed(1);
  };

  const onExportRequests = () => {
    const data = filteredRequests.map((r) => {
      const acc = bankAccounts.find((a) => a.id === r.bankAccountId);
      const cli = clients.find((c) => c.id === r.clientId);
      const mov = r.associatedMovementId
        ? movements.find((m) => m.movementId === r.associatedMovementId)
        : undefined;
      return {
        ID: r.id,
        Estado: r.status,
        Cliente: cli?.name || 'N/A',
        Cliente_Codigo: cli?.appCode || cli?.navitaireCode || cli?.sapBP || cli?.id || '',
        Banco: acc?.bankName || 'N/A',
        Cuenta: acc?.accountNumber || 'N/A',
        Fecha_Transferencia: formatDate(r.transferDate),
        Monto_Total: r.amount,
        Codigo_Autorizacion: r.authorizationCode || '',
        Movimiento_Cartola: r.associatedMovementDisplayId || mov?.displayId || r.associatedMovementId || '',
        Cant_PNRs: r.documents.length,
        PNRs: r.documents.map((d) => d.reference).join(', '),
        Comprobantes: r.attachments?.length ?? 0,
        Motivo_Comentario: r.rejectionComment || r.infoRequestComment || '',
        // Tiempos por etapa
        Fecha_Creado: r.createdAt ? formatDate(r.createdAt) : '',
        Fecha_Preaprobado: r.preapprovedAt ? formatDate(r.preapprovedAt) : '',
        Fecha_Aprobado: r.approvedAt ? formatDate(r.approvedAt) : '',
        Fecha_Gestionado: r.gestionadoCcAt ? formatDate(r.gestionadoCcAt) : '',
        Fecha_Info_Solicitada: r.infoRequestedAt ? formatDate(r.infoRequestedAt) : '',
        Fecha_Reversado: r.reversedAt ? formatDate(r.reversedAt) : '',
        Horas_Creado_a_Preaprobado: hoursBetween(r.createdAt, r.preapprovedAt),
        Horas_Preaprobado_a_Aprobado: hoursBetween(r.preapprovedAt, r.approvedAt),
        Horas_Aprobado_a_Gestionado: hoursBetween(r.approvedAt, r.gestionadoCcAt),
        Horas_Total_Creado_a_Gestionado: hoursBetween(r.createdAt, r.gestionadoCcAt),
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Solicitudes');
    XLSX.writeFile(wb, `reporte_recaudacion_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {isAgente && (
        <Card className="p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              {editingRequestId ? 'Editar Solicitud' : 'Nueva Solicitud de Validación'} (Agente CC)
            </h3>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onDownloadMassUploadTemplate}>
                Descargar Plantilla
              </Button>
              <label className="flex items-center justify-center px-3 py-1.5 bg-slate-100 rounded-md cursor-pointer hover:bg-slate-200 transition-colors text-sm font-medium border border-slate-200">
                Carga Masiva{' '}
                <input type="file" className="hidden" onChange={onMassUploadRequests} />
              </label>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="space-y-1">
              <label className="text-xs font-medium">Cuenta Bancaria</label>
              <select
                className="w-full h-10 rounded-md border px-3 text-sm"
                value={selectedAccId}
                onChange={(e) => setSelectedAccId(e.target.value)}
              >
                <option value="">Seleccione cuenta...</option>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayId || a.id} | {a.bankName} - {a.accountNumber} | {a.currency}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Fecha Transferencia</label>
              <Input
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Monto Total</label>
              <Input
                type="number"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="100000"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Cliente</label>
              <select
                className="w-full h-10 rounded-md border px-3 text-sm"
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
              >
                <option value="">Buscar cliente...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.appCode || c.id} | {c.name} ({c.taxId})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Código de autorización</label>
              <Input
                value={authorizationCode}
                onChange={(e) => setAuthorizationCode(e.target.value)}
                placeholder="Código del comprobante bancario"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Comprobante(s) (PDF/JPG/PNG)</label>
              <Input
                type="file"
                multiple
                className="cursor-pointer"
                onChange={(e) => setSupportFiles(Array.from(e.target.files ?? []))}
              />
              {supportFiles.length > 0 && (
                <p className="text-[10px] text-slate-500">
                  {supportFiles.length} archivo(s) seleccionado(s)
                </p>
              )}
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-2">Detalle de PNRs</h4>
            <div className="flex gap-2 mb-3">
              <Input
                placeholder="PNR (6 caracteres)"
                value={pnrRef}
                onChange={(e) => setPnrRef(e.target.value)}
                maxLength={6}
              />
              <Input
                type="number"
                placeholder="Monto PNR"
                value={pnrAmount}
                onChange={(e) => setPnrAmount(e.target.value)}
              />
              <Button variant="outline" onClick={onAddPnr}>
                Añadir
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {tempDocs.map((d, i) => (
                <Badge key={i} variant="secondary" className="py-1">
                  {d.reference}: ${d.amount.toLocaleString()}
                  <button
                    className="ml-2 text-red-500"
                    onClick={() => setTempDocs(tempDocs.filter((_, idx) => idx !== i))}
                  >
                    x
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

          <div className="flex gap-3 mt-4">
            <Button className="flex-1" onClick={onSubmitRequest}>
              {editingRequestId ? 'Actualizar Solicitud' : 'Enviar Solicitud'}
            </Button>
            {editingRequestId && (
              <Button variant="outline" onClick={onCancelEdit}>
                Cancelar Edición
              </Button>
            )}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Panel de Gestión de Recaudación</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={onExportRequests}
            disabled={filteredRequests.length === 0}
          >
            Exportar Listado Actual
          </Button>
        </div>

        {/* Filtros (delimitan tabla y export) */}
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
          <select
            className="h-9 rounded-md border bg-white px-2 text-xs"
            value={fEstado}
            onChange={(e) => setFEstado(e.target.value)}
          >
            <option value="all">Todos los estados</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Preaprobado">Preaprobado</option>
            <option value="Aprobado">Aprobado</option>
            <option value="Rechazado">Rechazado</option>
            <option value="InformacionSolicitada">Info solicitada</option>
            <option value="GestionadoCC">Gestionado CC</option>
            <option value="Anulado">Anulado</option>
          </select>
          <select
            className="h-9 rounded-md border bg-white px-2 text-xs"
            value={fCliente}
            onChange={(e) => setFCliente(e.target.value)}
          >
            <option value="all">Todos los clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border bg-white px-2 text-xs"
            value={fCuenta}
            onChange={(e) => setFCuenta(e.target.value)}
          >
            <option value="all">Todas las cuentas</option>
            {bankAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.bankName} - {a.accountNumber}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border bg-white px-2 text-xs"
            value={fDateBasis}
            onChange={(e) => setFDateBasis(e.target.value as 'transfer' | 'created')}
            title="La fecha (desde/hasta) filtra por esta base"
          >
            <option value="transfer">Fecha: Transferencia</option>
            <option value="created">Fecha: Generación</option>
          </select>
          <input
            type="date"
            className="h-9 rounded-md border bg-white px-2 text-xs"
            value={fDesde}
            onChange={(e) => setFDesde(e.target.value)}
            title="Desde (según base de fecha elegida)"
          />
          <input
            type="date"
            className="h-9 rounded-md border bg-white px-2 text-xs"
            value={fHasta}
            onChange={(e) => setFHasta(e.target.value)}
            title="Fecha transferencia hasta"
          />
          <input
            type="text"
            className="h-9 rounded-md border bg-white px-2 text-xs"
            value={fSearch}
            onChange={(e) => setFSearch(e.target.value)}
            placeholder="Buscar (cód. aut. / PNR / ID)"
          />
        </div>
        <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500">
          <span>
            Mostrando <span className="font-semibold">{filteredRequests.length}</span> de{' '}
            {requests.length} solicitudes
          </span>
          {(fEstado !== 'all' ||
            fCliente !== 'all' ||
            fCuenta !== 'all' ||
            fDesde ||
            fHasta ||
            fSearch) && (
            <button
              className="text-jetsmart-blue underline"
              onClick={() => {
                setFEstado('all');
                setFCliente('all');
                setFCuenta('all');
                setFDesde('');
                setFHasta('');
                setFSearch('');
                setFDateBasis('transfer');
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Datos Pago / Cartola</th>
                <th className="px-3 py-2">Solicitud</th>
                <th className="px-3 py-2">Cód. Aut.</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">PNRs</th>
                <th className="px-3 py-2">Soporte</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Acción</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-4 text-slate-400">
                    No hay solicitudes que coincidan con los filtros.
                  </td>
                </tr>
              ) : (
                [...filteredRequests]
                  .sort(
                    (a, b) =>
                      (a.status === 'InformacionSolicitada' ? 0 : 1) -
                      (b.status === 'InformacionSolicitada' ? 0 : 1)
                  )
                  .map((r) => {
                  const associatedAccount = bankAccounts.find((acc) => acc.id === r.bankAccountId);
                  const associatedClient = clients.find((c) => c.id === r.clientId);
                  // D 2c: preferimos el vinculo denormalizado del servidor; el
                  // fallback a `movements` cubre el caso recien validado en cliente.
                  const linkedMov = r.associatedMovementId
                    ? movements.find((m) => m.movementId === r.associatedMovementId)
                    : undefined;
                  const hasMovLink = Boolean(r.associatedMovementId);
                  const movLinkBank = r.associatedMovementBank || linkedMov?.bank || '';
                  const movLinkDisplay =
                    r.associatedMovementDisplayId ||
                    linkedMov?.displayId ||
                    r.associatedMovementId ||
                    '';

                  return (
                    <tr
                      key={r.id}
                      className={`border-b ${r.status === 'Rechazado' ? 'bg-red-50/40' : r.status === 'Aprobado' ? 'bg-emerald-50/40' : r.status === 'InformacionSolicitada' ? 'bg-amber-100/70' : ''}`}
                    >
                      <td className="px-3 py-3 font-mono text-[10px]">{r.id}</td>
                      <td className="px-3 py-3">
                        <div className="text-xs font-medium">
                          {associatedAccount?.displayId || associatedAccount?.id} |{' '}
                          {associatedAccount?.bankName} - {associatedAccount?.accountNumber} (
                          {associatedAccount?.country})
                        </div>
                        <div className="text-xs">
                          Transferencia: {formatDate(r.transferDate)} |{' '}
                          <b>${r.amount.toLocaleString()}</b>
                        </div>
                        {hasMovLink && (
                          <div className="text-[10px] text-emerald-600 mt-1 bg-emerald-50 p-1 rounded border border-emerald-100">
                            Vínculo Cartola: {movLinkBank} ({movLinkDisplay})
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs whitespace-nowrap">
                        {r.createdAt ? formatDate(r.createdAt) : '—'}
                      </td>
                      <td className="px-3 py-3 text-xs font-mono whitespace-nowrap">
                        {r.authorizationCode || '—'}
                      </td>
                      <td className="px-3 py-3">
                        <div>{associatedClient?.name}</div>
                        <div className="font-mono text-[10px] text-slate-500">
                          {associatedClient?.appCode || associatedClient?.id}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="secondary">{r.documents.length} PNRs</Badge>
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 ml-2 text-xs"
                          onClick={() => {
                            setViewingPnrs(r.documents);
                            setIsPnrsModalOpen(true);
                          }}
                        >
                          Ver PNRs
                        </Button>
                        <div>
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 mt-1 text-[10px] text-slate-500"
                            onClick={() => setTiemposReq(r)}
                          >
                            Ver tiempos
                          </Button>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {r.attachments && r.attachments.length > 0 ? (
                          <div className="space-y-1">
                            {r.attachments.map((a) => (
                              <div key={a.id} className="flex items-center gap-1">
                                <a
                                  href={`/api/recaudacion/attachments/${a.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-blue-600 underline"
                                >
                                  {a.fileName}
                                </a>
                                {(isAgente || isRecaudacion) && (
                                  <button
                                    type="button"
                                    className="text-[10px] text-red-500"
                                    onClick={() => onDeleteAttachment(r.id, a.id)}
                                    title="Eliminar comprobante"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-500 text-xs">Sin soporte</span>
                        )}
                        {isAgente &&
                          (r.status === 'Pendiente' ||
                            r.status === 'Preaprobado' ||
                            r.status === 'Rechazado' ||
                            r.status === 'InformacionSolicitada') && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-auto p-1 mt-1 text-[10px]"
                              onClick={() => onUploadSupportFileForRequest(r)}
                            >
                              Adjuntar comprobante
                            </Button>
                          )}
                      </td>
                      <td className="px-3 py-3">
                        <Badge
                          variant={
                            r.status === 'Aprobado'
                              ? 'default'
                              : r.status === 'Rechazado'
                                ? 'destructive'
                                : 'outline'
                          }
                          className={
                            r.status === 'Preaprobado'
                              ? 'bg-amber-100 text-amber-700 border-amber-200'
                              : r.status === 'InformacionSolicitada'
                                ? 'bg-orange-100 text-orange-700 border-orange-200'
                                : r.status === 'GestionadoCC'
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : r.status === 'Anulado'
                                    ? 'bg-slate-200 text-slate-600 border-slate-300'
                                    : ''
                          }
                        >
                          {r.status === 'InformacionSolicitada'
                            ? 'Info solicitada'
                            : r.status === 'GestionadoCC'
                              ? 'Gestionado CC'
                              : r.status}
                        </Badge>
                        {r.rejectionComment && (
                          <div className="text-[10px] text-red-600 mt-1 italic">
                            Motivo: {r.rejectionComment}
                          </div>
                        )}
                        {r.status === 'InformacionSolicitada' && r.infoRequestComment && (
                          <div className="text-[10px] text-orange-700 mt-1 italic font-medium">
                            Requerido: {r.infoRequestComment}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {isRecaudacion &&
                          r.status !== 'Aprobado' &&
                          r.status !== 'Rechazado' &&
                          r.status !== 'GestionadoCC' &&
                          r.status !== 'Anulado' && (
                          <div className="flex flex-col gap-2">
                            {r.status === 'Pendiente' && (
                              <select
                                className="h-8 text-[10px] border rounded bg-white w-full p-1"
                                value={manualMatchMovId[r.id] || ''}
                                onChange={(e) =>
                                  setManualMatchMovId({
                                    ...manualMatchMovId,
                                    [r.id]: e.target.value,
                                  })
                                }
                                onFocus={() => loadCandidates(r)}
                              >
                                <option value="">Vincular Movimiento...</option>
                                {(candidatesByReq[r.id] ?? [])
                                  .map((m) => (
                                    <option key={m.movementId} value={m.movementId}>
                                      {m.date} - {m.bank} (${m.amount.toLocaleString()})
                                    </option>
                                  ))}
                              </select>
                            )}
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px] flex-1"
                                onClick={() => onProcessAction(r.id, 'Aprobar')}
                              >
                                {r.status === 'Preaprobado' ? 'Confirmar' : 'Validar'}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 text-[10px]"
                                onClick={() => onProcessAction(r.id, 'Rechazar')}
                              >
                                Rechazar
                              </Button>
                            </div>
                            {r.status !== 'InformacionSolicitada' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px]"
                                onClick={() => onRequestInfo(r.id)}
                              >
                                Solicitar info (SWIFT/MT103)
                              </Button>
                            )}
                          </div>
                        )}
                        {isAgente && r.status === 'InformacionSolicitada' && (
                          <Button
                            size="sm"
                            className="h-7 text-[10px] bg-orange-600 hover:bg-orange-700"
                            onClick={() => onRespondInfo(r.id)}
                          >
                            Responder (reenviar)
                          </Button>
                        )}
                        {isAgente && (r.status === 'Pendiente' || r.status === 'Preaprobado') && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px]"
                            onClick={() => onEditRequest(r)}
                          >
                            Editar
                          </Button>
                        )}
                        {/* Agente CC puede anular su propio caso PENDIENTE (sin conciliar). */}
                        {isAgente && r.status === 'Pendiente' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px] mt-1 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                            onClick={() => onAnnulPending(r.id)}
                          >
                            Anular
                          </Button>
                        )}
                        {/* Agente CC: estado FINAL "Gestionado CC" sobre un Aprobado. */}
                        {isAgente && r.status === 'Aprobado' && (
                          <Button
                            size="sm"
                            className="h-7 text-[10px] bg-emerald-600 text-white hover:bg-emerald-700"
                            onClick={() => onMarkGestionadoCC(r.id)}
                          >
                            Gestionado CC
                          </Button>
                        )}
                        {/* Recaudación/Admin puede REVERSAR un Aprobado o un Gestionado CC
                            (la reversa de Recaudación prima sobre el Gestionado del agente;
                            el caso vuelve a revisión y se prioriza para el agente). */}
                        {isRecaudacion &&
                          (r.status === 'Aprobado' || r.status === 'GestionadoCC') && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[10px] text-amber-700 border-amber-300 hover:bg-amber-50 hover:text-amber-800"
                              onClick={() => onReverseApproved(r.id)}
                            >
                              Reversar
                            </Button>
                          )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal para ver PNRs */}
      {/* Modal Ver tiempos por etapa */}
      <Dialog open={!!tiemposReq} onOpenChange={(o) => !o && setTiemposReq(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Tiempos del caso {tiemposReq?.id}</DialogTitle>
          </DialogHeader>
          <div className="mt-3 space-y-1 text-sm">
            {tiemposReq &&
              (() => {
                const fmtDur = (a?: string, b?: string): string => {
                  if (!a || !b) return '';
                  const ms = new Date(b).getTime() - new Date(a).getTime();
                  if (!Number.isFinite(ms) || ms < 0) return '';
                  const h = ms / 3600000;
                  return h >= 24 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(1)} h`;
                };
                const stages: { label: string; at?: string }[] = [
                  { label: 'Generada', at: tiemposReq.createdAt },
                  { label: 'Preaprobada', at: tiemposReq.preapprovedAt },
                  { label: 'Aprobada', at: tiemposReq.approvedAt },
                  { label: 'Gestionada CC', at: tiemposReq.gestionadoCcAt },
                ];
                const rows: React.ReactNode[] = [];
                let prevAt: string | undefined = undefined;
                for (const st of stages) {
                  const dur = prevAt ? fmtDur(prevAt, st.at) : '';
                  rows.push(
                    <div key={st.label} className="flex justify-between border-b py-1">
                      <span className="font-medium">{st.label}</span>
                      <span className="text-slate-600">
                        {st.at ? formatDate(st.at) : '—'}
                        {dur ? ` (+${dur})` : ''}
                      </span>
                    </div>
                  );
                  if (st.at) prevAt = st.at;
                }
                return (
                  <>
                    {rows}
                    {tiemposReq.infoRequestedAt && (
                      <div className="flex justify-between py-1 text-orange-700">
                        <span>Info solicitada</span>
                        <span>{formatDate(tiemposReq.infoRequestedAt)}</span>
                      </div>
                    )}
                    {tiemposReq.reversedAt && (
                      <div className="flex justify-between py-1 text-amber-700">
                        <span>Reversada</span>
                        <span>{formatDate(tiemposReq.reversedAt)}</span>
                      </div>
                    )}
                    <p className="pt-2 text-[10px] italic text-slate-400">
                      Los tiempos por etapa se registran desde esta versión; casos antiguos pueden
                      mostrar &quot;—&quot; hasta que cambien de estado.
                    </p>
                  </>
                );
              })()}
          </div>
          <DialogFooter>
            <Button onClick={() => setTiemposReq(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPnrsModalOpen} onOpenChange={setIsPnrsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalle de PNRs</DialogTitle>
            <DialogDescription>Documentos asociados a la solicitud.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {viewingPnrs.length === 0 ? (
              <p>No hay PNRs asociados.</p>
            ) : (
              viewingPnrs.map((doc) => (
                <div key={doc.id} className="flex justify-between items-center border-b pb-1">
                  <span className="font-medium">{doc.reference}</span>
                  <span>${doc.amount.toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsPnrsModalOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para subir soporte a solicitud existente */}
      <Dialog open={isUploadSupportModalOpen} onOpenChange={setIsUploadSupportModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjuntar Soporte a Solicitud</DialogTitle>
            <DialogDescription>
              Adjunte el archivo de soporte para la solicitud {currentRequestToUploadSupport?.id}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Input type="file" multiple onChange={handleSupportFileUpload} />
            {newSupportFilesForRequest.length > 0 && (
              <p className="text-sm text-slate-600">
                {newSupportFilesForRequest.length} archivo(s) seleccionado(s)
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadSupportModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={onConfirmUploadSupport} disabled={newSupportFilesForRequest.length === 0}>
              Adjuntar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
