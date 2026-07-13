'use client';

import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

import { Badge } from '@/components/ui/badge';
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

  const generateRequestId = () =>
    `REQ-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

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
    const headers = ['Cuenta', 'Fecha', 'ClienteID', 'PNR', 'MontoPNR', 'MontoTotal'].join(',');
    const sample = '12345678,2024-05-21,CLI-1,ABC123,50000,50000';
    const blob = new Blob([`${headers}\n${sample}\n`], { type: 'text/csv;charset=utf-8;' });
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

      // Agrupamos por una "llave" única de solicitud en el Excel
      const groups = rows.reduce((acc: any, row: any) => {
        const key = `${row.Cuenta}-${row.Fecha}-${row.MontoTotal}-${row.ClienteID}`;
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

        const client = clients.find((c) => c.id === String(first.ClienteID));
        if (!client) throw new Error(`ClienteID ${first.ClienteID} no registrado.`);

        // Fecha: Validar formato YYYY-MM-DD
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(first.Fecha)))
          throw new Error(`Formato de fecha inválido (esperado YYYY-MM-DD) en solicitud ${key}.`);

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

        const [year, month, day] = String(first.Fecha).split('-');
        const reversedDate = `${day}-${month}-${year}`;

        const matchingMov = movements.find(
          (m) =>
            m.bankAccount.toString().replace(/\D/g, '') ===
              String(first.Cuenta).replace(/\D/g, '') &&
            Math.round(m.amount) === Math.round(totalAmount) &&
            m.mainIdentification === 'Sin identificar' &&
            (m.date.includes(String(first.Fecha)) || m.date.includes(reversedDate)) &&
            m.bank.toLowerCase().includes(account.bankName.toLowerCase())
        );

        newRequests.push({
          id: generateRequestId(),
          bankAccountId: account.id,
          transferDate: String(first.Fecha),
          amount: totalAmount,
          clientId: client.id,
          supportFileName: 'archivo_masivo.zip', // Placeholder, will be updated later
          status: matchingMov ? 'Preaprobado' : 'Pendiente',
          associatedMovementId: matchingMov?.movementId,
          documents: docs,
        });

        if (matchingMov) onReconcile(matchingMov.movementId, docs);
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
    const [year, month, day] = transferDate.split('-');
    const reversedDate = `${day}-${month}-${year}`; // Formato DD-MM-YYYY común en cartolas

    const matchingMovement = movements.find(
      (m) =>
        // 1. Comparación de Cuenta (solo dígitos)
        m.bankAccount.toString().replace(/\D/g, '') === account.accountNumber.replace(/\D/g, '') &&
        // 2. Comparación de Monto (redondeado para evitar problemas de decimales)
        Math.round(m.amount) === Math.round(total) &&
        // 3. Solo movimientos no identificados
        m.mainIdentification === 'Sin identificar' &&
        // 4. Comparación de Fecha Flexible
        // Valida si la fecha de la cartola contiene YYYY-MM-DD o coincide con DD-MM-YYYY
        (m.date.includes(transferDate) || m.date.includes(reversedDate)) &&
        // 5. El banco debe coincidir (búsqueda parcial)
        m.bank.toLowerCase().includes(account.bankName.toLowerCase())
    );

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
      status: matchingMovement ? 'Preaprobado' : 'Pendiente',
      associatedMovementId: matchingMovement?.movementId,
      documents: tempDocs,
    };

    if (matchingMovement) {
      onReconcile(matchingMovement.movementId, tempDocs);
    }

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
    const comment = prompt('Indique qué información adicional se requiere (ej. SWIFT/MT103):');
    if (!comment) return;
    setRequests(
      requests.map((r) =>
        r.id === reqId ? { ...r, status: 'InformacionSolicitada', infoRequestComment: comment } : r
      )
    );
    alert('Se solicitó información al Agente CC. El caso quedó marcado como prioritario para él.');
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

      const targetMovId = req.associatedMovementId || manualMatchMovId[reqId];
      if (targetMovId && (req.status === 'Preaprobado' || req.status === 'Pendiente')) {
        // Revertir si estaba preaprobado o si se había vinculado manualmente y no se ha aprobado
        setMovements((prev) =>
          prev.map((m) =>
            m.movementId === targetMovId
              ? {
                  ...m,
                  documents: [],
                  mainIdentification: 'Sin identificar' as MainIdentificationType,
                  mainIdentificationId: 'IDN-SIN-ID',
                }
              : m
          )
        );
      }

      setRequests(
        requests.map((r) =>
          r.id === reqId ? { ...r, status: 'Rechazado', rejectionComment: comment } : r
        )
      );
      alert(
        'Solicitud rechazada y movimiento de cartola liberado (si estaba asociado automáticamente).'
      );
    } else {
      // Aprobar
      if (req.status === 'Pendiente') {
        const selectedId = manualMatchMovId[reqId];
        if (!selectedId) {
          alert('Debe vincular un movimiento de cartola para aprobar.');
          return;
        }
        onReconcile(selectedId, req.documents);
        setRequests(
          requests.map((r) =>
            r.id === reqId ? { ...r, status: 'Aprobado', associatedMovementId: selectedId } : r
          )
        );
      } else {
        // Preaprobado, solo confirmar
        setRequests(requests.map((r) => (r.id === req.id ? { ...r, status: 'Aprobado' } : r)));
      }
      alert('Solicitud aprobada correctamente.');
    }
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
      setRequests((prev) =>
        prev.map((req) =>
          req.id === targetId
            ? {
                ...req,
                supportFileName: req.supportFileName || uploaded[0]?.fileName || '',
                attachments: [...(req.attachments ?? []), ...uploaded],
              }
            : req
        )
      );
      alert(`Se adjuntaron ${uploaded.length} comprobante(s) a la solicitud ${targetId}.`);
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

  const onExportRequests = () => {
    const data = requests.map((r) => {
      const acc = bankAccounts.find((a) => a.id === r.bankAccountId);
      const cli = clients.find((c) => c.id === r.clientId);
      return {
        ID: r.id,
        Banco: acc?.bankName || 'N/A',
        Cuenta: acc?.accountNumber || 'N/A',
        Fecha_Transferencia: r.transferDate,
        Monto_Total: r.amount,
        Cliente: cli?.name || 'N/A',
        Cant_PNRs: r.documents.length,
        PNRs: r.documents.map((d) => d.reference).join(', '),
        Estado: r.status,
        Motivo_Rechazo: r.rejectionComment || '',
        ID_Movimiento_Cartola: r.associatedMovementId || '',
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
            <Button className="flex-1 bg-jetsmart-blue" onClick={onSubmitRequest}>
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
            disabled={requests.length === 0}
          >
            Exportar Listado Actual
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Datos Pago / Cartola</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">PNRs</th>
                <th className="px-3 py-2">Soporte</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Acción</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-4 text-slate-400">
                    No hay solicitudes pendientes.
                  </td>
                </tr>
              ) : (
                [...requests]
                  .sort(
                    (a, b) =>
                      (a.status === 'InformacionSolicitada' ? 0 : 1) -
                      (b.status === 'InformacionSolicitada' ? 0 : 1)
                  )
                  .map((r) => {
                  const associatedAccount = bankAccounts.find((acc) => acc.id === r.bankAccountId);
                  const associatedClient = clients.find((c) => c.id === r.clientId);
                  const associatedMovement = r.associatedMovementId
                    ? movements.find((m) => m.movementId === r.associatedMovementId)
                    : null;

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
                          {r.transferDate} | <b>${r.amount.toLocaleString()}</b>
                        </div>
                        {r.authorizationCode && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Cód. autorización:{' '}
                            <span className="font-mono">{r.authorizationCode}</span>
                          </div>
                        )}
                        {associatedMovement && (
                          <div className="text-[10px] text-emerald-600 mt-1 bg-emerald-50 p-1 rounded border border-emerald-100">
                            Vínculo Cartola: {associatedMovement.bank} (
                            {associatedMovement.movementId})
                          </div>
                        )}
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
                                : ''
                          }
                        >
                          {r.status === 'InformacionSolicitada' ? 'Info solicitada' : r.status}
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
                        {isRecaudacion && r.status !== 'Aprobado' && r.status !== 'Rechazado' && (
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
                              >
                                <option value="">Vincular Movimiento...</option>
                                {movements
                                  .filter(
                                    (m) =>
                                      m.mainIdentification === 'Sin identificar' &&
                                      Math.abs(m.amount - r.amount) < 1
                                  )
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
