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
  Client,
  CartolaDocument,
  UserRole,
  CobranzaMainDocument,
  CobranzaDocumentType,
  MainIdentificationType,
} from '@/types';

interface CobranzaManagementProps {
  userRole: UserRole;
  clients: Client[];
  movements: CartolaMovement[];
  setMovements: React.Dispatch<React.SetStateAction<CartolaMovement[]>>;
  cobranzaDocs: CobranzaMainDocument[];
  setCobranzaDocs: React.Dispatch<React.SetStateAction<CobranzaMainDocument[]>>;
}

export function CobranzaManagement({
  userRole,
  clients,
  movements,
  setMovements,
  cobranzaDocs,
  setCobranzaDocs,
}: CobranzaManagementProps) {
  const [clientFilter, setClientFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [cutOffDate, setCutOffDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState<'general' | 'edoCuenta'>('general');
  const [startDate, setStartDate] = useState(''); // Emisión desde
  const [endDate, setEndDate] = useState(''); // Emisión hasta
  const [paymentSourceType, setPaymentSourceType] = useState<'bank' | 'nc'>('bank');
  const [paymentAmount, setPaymentAmount] = useState('');

  const [isSubDocsModalOpen, setIsSubDocsModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [viewingSubDocs, setViewingSubDocs] = useState<CartolaDocument[]>([]);
  const [paymentMovId, setPaymentMovId] = useState('');
  const [isPayDetailModalOpen, setIsPayDetailModalOpen] = useState(false);
  const [selectedDocForDetails, setSelectedDocForDetails] = useState<CobranzaMainDocument | null>(
    null
  );

  // New Detail Addition State
  const [isAddDetailModalOpen, setIsAddDetailModalOpen] = useState(false);
  const [newDetailRef, setNewDetailRef] = useState('');
  const [newDetailAmount, setNewDetailAmount] = useState('');
  const [addDetailError, setAddDetailError] = useState<string | null>(null);

  // Documento seleccionado para ver detalles/pagos
  const currentViewingDoc = useMemo(() => {
    return cobranzaDocs.find((doc) => doc.id === selectedDocId) || null;
  }, [cobranzaDocs, selectedDocId]);

  // Massive Detail Upload State
  const [isMassiveDetailUploadModalOpen, setIsMassiveDetailUploadModalOpen] = useState(false);
  const [massiveDetailFile, setMassiveDetailFile] = useState<File | null>(null);
  const [massiveDetailError, setMassiveDetailError] = useState<string | null>(null);

  const isAuthorized =
    userRole === 'Cobranza' || userRole === 'Recaudacion' || userRole === 'Administrador';

  // Helper para normalizar cualquier formato de fecha a YYYY-MM-DD (ISO) para comparaciones seguras
  const toISODate = (dateStr: string) => {
    if (!dateStr) return '';
    // Si ya es YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

    // Intentar separar por / o - (Formatos DD/MM/YYYY o DD-MM-YYYY)
    const parts = dateStr.split(/[/|-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY?MM?DD
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
      if (parts[2].length === 4) {
        // DD?MM?YYYY
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    // Fallback: intentar parsear con el objeto Date
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : dateStr;
  };

  const processedDocs = useMemo(() => {
    const isoCutOff = toISODate(cutOffDate);
    const isoStart = toISODate(startDate);
    const isoEnd = toISODate(endDate);

    if (viewMode === 'general') {
      return cobranzaDocs
        .filter((d) => {
          const docIso = toISODate(d.date);
          const matchClient = clientFilter === 'all' || d.clientId === clientFilter;
          const matchStatus = statusFilter === 'all' || d.status === statusFilter;

          // Comparación de strings ISO funciona alfabéticamente de forma cronológica
          const matchStart = !startDate || docIso >= isoStart;
          const matchEnd = !endDate || docIso <= isoEnd;

          return matchClient && matchStatus && matchStart && matchEnd;
        })
        .map((d) => ({
          ...d,
          displayBalance: d.pendingAmount, // En vista general mostramos el saldo actual real
          displayStatus: d.status,
          displayPayments: d.payments.length,
          normalizedDate: toISODate(d.date),
        }));
    } else {
      // MODO ESTADO DE CUENTA: Lógica histórica "Point-in-time"
      return cobranzaDocs
        .filter((d) => {
          const docIso = toISODate(d.date);
          const matchClient = clientFilter === 'all' || d.clientId === clientFilter;

          // 1. Solo documentos emitidos ANTES o EN la fecha de corte
          if (!matchClient || docIso > isoCutOff) return false;

          // 2. Calcular cuánto se había pagado HASTA esa fecha
          const paidAtCutoff = d.payments
            .filter((p) => toISODate(p.date) <= isoCutOff)
            .reduce((s, p) => s + p.amount, 0);

          const balanceAtCutoff = d.totalAmount - paidAtCutoff;

          // 3. Mostrar si en esa fecha el saldo era pendiente (mayor a 0)
          return balanceAtCutoff > 0.01;
        })
        .map((d) => {
          const paidAtCutoff = d.payments
            .filter((p) => toISODate(p.date) <= isoCutOff)
            .reduce((s, p) => s + p.amount, 0);

          const balanceAtCutoff = d.totalAmount - paidAtCutoff;
          return {
            ...d,
            displayBalance: balanceAtCutoff,
            displayStatus: paidAtCutoff > 0 ? 'Parcial' : 'Pendiente',
            displayPayments: d.payments.filter((p) => toISODate(p.date) <= isoCutOff).length,
            normalizedDate: toISODate(d.date),
          };
        });
    }
  }, [cobranzaDocs, clientFilter, statusFilter, startDate, endDate, viewMode, cutOffDate]);

  const onDownloadCobranzaTemplate = () => {
    const headers = [
      'Tipo',
      'DocumentoID',
      'Fecha',
      'Pais',
      'ClienteID',
      'PNR',
      'MontoPNR',
      'MontoTotal',
    ].join(';');
    const sample = 'Factura;FAC-1001;21/05/2024;Chile;CLI-1;ABC123;50000;50000';
    const blob = new Blob(['\uFEFF' + `${headers}\n${sample}\n`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'plantilla-cobranza-masiva.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const onMassUploadCobranza = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const rows = XLSX.utils.sheet_to_json<any>(workbook.Sheets[workbook.SheetNames[0]]);

      const existingIds = new Set(cobranzaDocs.map((d) => d.id.toLowerCase()));
      const fileIds = new Set<string>();
      let skippedCount = 0;

      // Estructura: Tipo, DocumentoID, Fecha, Pais, ClienteID, PNR, MontoPNR, MontoTotal
      const groups = rows.reduce((acc: any, row: any) => {
        const key = String(row.DocumentoID);
        if (!acc[key]) acc[key] = [];
        acc[key].push(row);
        return acc;
      }, {});

      const newDocs: CobranzaMainDocument[] = Object.keys(groups)
        .filter((docId) => {
          const normalizedId = docId.toLowerCase();
          // Validar contra sistema y contra duplicados en el mismo archivo
          if (existingIds.has(normalizedId) || fileIds.has(normalizedId)) {
            skippedCount++;
            return false;
          }
          fileIds.add(normalizedId);
          return true;
        })
        .map((docId) => {
          const group = groups[docId];
          const first = group[0];

          const tipo = String(first.Tipo ?? '').trim();
          if (!['Factura', 'Nota de cobro', 'Nota de Crédito'].includes(tipo)) {
            throw new Error(
              `Documento ${docId}: Tipo inválido "${tipo}". Use Factura, Nota de cobro o Nota de Crédito.`
            );
          }

          const totalAmount = Number(first.MontoTotal);
          if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
            throw new Error(`Documento ${docId}: MontoTotal inválido.`);
          }

          const clientId = String(first.ClienteID);
          if (!clients.some((c) => c.id === clientId)) {
            throw new Error(`Documento ${docId}: ClienteID ${clientId} no existe.`);
          }

          // Fecha: acepta dd/mm/yyyy (o yyyy-mm-dd) y normaliza a ISO.
          const rawFecha = String(first.Fecha ?? '').trim();
          const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawFecha);
          const dmy = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(rawFecha);
          let isoDate: string;
          if (ymd) isoDate = `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
          else if (dmy) isoDate = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
          else throw new Error(`Documento ${docId}: fecha inválida (usa dd/mm/yyyy).`);

          // Detalle (PNR) OPCIONAL. Si se incluye, cada PNR debe ser válido y sumar el total.
          const subDocuments = group
            .filter((r: any) => r.PNR && String(r.PNR).toLowerCase() !== 'undefined')
            .map((r: any) => {
              const amt = Number(r.MontoPNR);
              if (!Number.isFinite(amt) || amt <= 0) {
                throw new Error(`Documento ${docId}: MontoPNR inválido para PNR ${r.PNR}.`);
              }
              return {
                id: `SUB-${Math.random()}`,
                reference: String(r.PNR).toUpperCase(),
                amount: amt,
                detail: 'Carga Masiva Cobranza',
              };
            });

          if (subDocuments.length > 0) {
            const round2 = (n: number) => Math.round(n * 100) / 100;
            const pnrSum = round2(subDocuments.reduce((acc: number, sd: { amount: number }) => acc + sd.amount, 0));
            if (Math.abs(pnrSum - round2(totalAmount)) > 0.01) {
              throw new Error(
                `Documento ${docId}: la suma de PNR (${pnrSum}) no cuadra con el total (${round2(totalAmount)}).`
              );
            }
          }

          return {
            id: String(docId),
            type: tipo as CobranzaDocumentType,
            date: isoDate,
            country: String(first.Pais),
            clientId,
            totalAmount,
            pendingAmount: totalAmount,
            status: 'Pendiente',
            payments: [],
            subDocuments,
          };
        });

      setCobranzaDocs((prev) => [...newDocs, ...prev]);
      if (skippedCount > 0) {
        alert(
          `Carga completada: ${newDocs.length} nuevos, ${skippedCount} omitidos por ser duplicados.`
        );
      } else {
        alert(`Se cargaron ${newDocs.length} documentos de cobro.`);
      }
    } catch (err: any) {
      alert(`Error en el formato del archivo: ${err.message || 'Verifique la estructura.'}`);
    } finally {
      event.target.value = ''; // Clear file input
    }
  };

  const onAssociatePayment = () => {
    if (!selectedDocId || !paymentMovId) return;

    if (typeof setMovements !== 'function') {
      console.error(
        "CRITICAL ERROR: 'setMovements' prop is missing or not a function in CobranzaManagement. This will prevent cartola updates."
      );
      alert(
        "Error: El componente no recibió la función 'setMovements' del padre. La cartola no se podrá actualizar. Revisa la consola para más detalles."
      );
      return;
    }

    const targetDoc = cobranzaDocs.find((d) => d.id === selectedDocId);
    if (!targetDoc) return;

    if (targetDoc.payments.some((p) => p.movementId === paymentMovId)) {
      alert('Este pago o nota de crédito ya está aplicado a este documento.');
      return;
    }

    const amountToApply = Number(paymentAmount);
    if (isNaN(amountToApply) || amountToApply <= 0) {
      alert('Por favor ingrese un monto válido.');
      return;
    }

    if (paymentSourceType === 'bank') {
      const movement = movements.find((m) => m.movementId === paymentMovId);
      if (!movement) return;

      const usedAmount = movement.documents.reduce((sum, d) => sum + d.amount, 0);
      const availableInBank = movement.amount - usedAmount;

      if (amountToApply > availableInBank + 0.01) {
        alert(
          `El monto ingresado ($${amountToApply}) excede el saldo disponible en el movimiento ($${availableInBank}).`
        );
        return;
      }

      if (amountToApply > targetDoc.pendingAmount + 0.01) {
        alert('El monto de pago no puede ser superior al saldo pendiente de la factura.');
        return;
      }

      const newPending = targetDoc.pendingAmount - amountToApply;

      setCobranzaDocs((prev) =>
        prev.map((doc) =>
          doc.id === selectedDocId
            ? {
                ...doc,
                pendingAmount: newPending,
                status: newPending <= 0.01 ? 'Pagado' : ('Parcial' as any),
                payments: [
                  ...doc.payments,
                  {
                    movementId: movement.movementId,
                    amount: amountToApply,
                    date: movement.date,
                    bank: movement.bank,
                  },
                ],
              }
            : doc
        )
      );

      // Actualizar Cartola: Marcamos como identificado y registramos el consumo
      setMovements((prev) =>
        prev.map((m) => {
          if (m.movementId === paymentMovId) {
            const newDocs = [
              ...m.documents,
              {
                id: `DOC-MANUAL-${Date.now()}`,
                reference: targetDoc.id,
                amount: amountToApply,
                detail: 'Asociación Manual',
              },
            ];

            return {
              ...m,
              documents: newDocs,
              mainIdentification: 'Cobranza crédito',
              mainIdentificationId: 'IDN-CC',
            };
          }
          return m;
        })
      );
    } else {
      // Lógica de Nota de Crédito
      const nc = cobranzaDocs.find((d) => d.id === paymentMovId && d.type === 'Nota de Crédito');
      if (!nc) return;

      const amountToApply = Math.min(nc.pendingAmount, targetDoc.pendingAmount);

      setCobranzaDocs((prev) =>
        prev.map((doc) => {
          if (doc.id === targetDoc.id) {
            const n = doc.pendingAmount - amountToApply;
            return {
              ...doc,
              pendingAmount: n,
              status: n <= 0.01 ? 'Pagado' : ('Parcial' as any),
              payments: [
                ...doc.payments,
                { movementId: nc.id, amount: amountToApply, date: nc.date, bank: 'Aplicación NC' },
              ],
            };
          }
          if (doc.id === nc.id) {
            const n = doc.pendingAmount - amountToApply;
            return { ...doc, pendingAmount: n, status: n <= 0.01 ? 'Pagado' : ('Parcial' as any) };
          }
          return doc;
        })
      );
    }

    setIsPaymentModalOpen(false);
    setPaymentMovId('');
    setPaymentAmount('');
    alert('Pago asociado exitosamente.');
  };

  const generateEdoCuenta = () => {
    // Lógica Point-in-time: Pendientes a la fecha de corte
    const isoCutOff = toISODate(cutOffDate);
    const docsToReport = cobranzaDocs.filter((d) => {
      const matchClient = clientFilter === 'all' || d.clientId === clientFilter;
      const isCreatedBeforeCutoff = toISODate(d.date) <= isoCutOff;

      if (!matchClient || !isCreatedBeforeCutoff) return false;

      const totalPaidAtCutoff = d.payments
        .filter((p) => toISODate(p.date) <= isoCutOff)
        .reduce((sum, p) => sum + p.amount, 0);

      return d.totalAmount - totalPaidAtCutoff > 0.01; // Tiene saldo pendiente a la fecha
    });

    if (docsToReport.length === 0) {
      alert('No hay documentos pendientes para el filtro y fecha de corte seleccionados.');
      return;
    }

    // 1. Exportar Excel Detallado
    const reportData = docsToReport.map((d) => {
      const totalPaidAtCutoff = d.payments
        .filter((p) => toISODate(p.date) <= isoCutOff)
        .reduce((sum, p) => sum + p.amount, 0);

      const isNC = d.type === 'Nota de Crédito';
      const pendingAtCutoff = Math.max(0, d.totalAmount - totalPaidAtCutoff);
      const statusAtCutoff = pendingAtCutoff <= 0.01 ? 'Pagado' : 'Pendiente';

      const client = clients.find((c) => c.id === d.clientId);

      return {
        Cliente_ID: d.clientId,
        Cliente_Nombre: client?.name || 'N/A',
        Cliente_Navitaire: client?.navitaireCode || 'N/A',
        Cliente_SAP_BP: client?.sapBP || 'N/A',
        Documento_ID: d.id,
        Tipo_Documento: d.type,
        Fecha_Emision: formatDate(d.date),
        Monto_Total: isNC ? -d.totalAmount : d.totalAmount,
        Monto_Pendiente_a_Corte: isNC ? -pendingAtCutoff : pendingAtCutoff,
        Estado_a_Corte: statusAtCutoff,
        PNRs: d.subDocuments.map((s) => s.reference).join(', '),
        Pagos_Asociados: d.payments.map((p) => `${p.bank} ${formatDate(p.date)} $${p.amount}`).join('; '),
      };
    });

    const ws = XLSX.utils.json_to_sheet(reportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estado de Cuenta');
    const clientNameForFilename =
      clientFilter === 'all'
        ? 'Consolidado'
        : clients.find((c) => c.id === clientFilter)?.name || 'Cliente';
    const filename = `EdoCta_${clientNameForFilename}_${cutOffDate}.xlsx`;
    XLSX.writeFile(wb, filename);

    // 2. Simulación de PDF (Summary)
    const totalPending = reportData.reduce((s, d) => s + d.Monto_Pendiente_a_Corte, 0);
    alert(`Reporte generado.\nDeuda total al ${cutOffDate}: $${totalPending.toLocaleString()}`);
  };

  const onExportCurrentView = () => {
    if (processedDocs.length === 0) return;

    const data = processedDocs.map((d) => {
      const client = clients.find((c) => c.id === d.clientId);
      return {
        Documento_ID: d.id,
        Tipo: d.type,
        Fecha: formatDate(d.date),
        Pais: d.country,
        Cliente: client?.name || d.clientId,
        Navitaire: client?.navitaireCode || '',
        SAP_BP: client?.sapBP || '',
        Monto_Total: d.totalAmount,
        Saldo_Pendiente: d.displayBalance,
        Estado: d.displayStatus,
        Cant_Pagos: d.payments.length,
        PNRs: d.subDocuments.map((s) => s.reference).join(', '),
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vista Cobranza');
    XLSX.writeFile(wb, `export_cobranza_actual_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const onAddDetailToDoc = () => {
    setAddDetailError(null);
    if (!selectedDocId || !newDetailRef || !newDetailAmount) return;
    const amount = Number(newDetailAmount);
    if (isNaN(amount) || amount <= 0) {
      setAddDetailError('El monto debe ser un número positivo.');
      return;
    }
    setCobranzaDocs((prev) =>
      prev.map((d) => {
        if (d.id === selectedDocId) {
          const newSub = {
            id: `SUB-${Date.now()}`,
            reference: newDetailRef.toUpperCase(),
            amount,
            detail: 'Manual',
          };
          const updatedSubDocs = [...d.subDocuments, newSub];
          return { ...d, subDocuments: updatedSubDocs };
        }
        return d;
      })
    );
    setIsAddDetailModalOpen(false);
    setNewDetailRef('');
    setNewDetailAmount('');
  };

  const onMassUploadSubDocuments = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedDocId) return;
    setMassiveDetailError(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const rows = XLSX.utils.sheet_to_json<any>(workbook.Sheets[workbook.SheetNames[0]]);

      // Expected structure: PNR, MontoPNR
      const newSubDocs: CartolaDocument[] = rows.map((r: any) => {
        if (!r.PNR || !r.MontoPNR) throw new Error('Cada fila debe tener PNR y MontoPNR.');
        const amount = Number(r.MontoPNR);
        if (isNaN(amount) || amount <= 0) throw new Error(`MontoPNR inválido para PNR ${r.PNR}.`);
        return {
          id: `SUB-${Math.random()}`,
          reference: String(r.PNR).toUpperCase(),
          amount: amount,
          detail: 'Carga Masiva de Detalles',
        };
      });

      setCobranzaDocs((prev) =>
        prev.map((doc) => {
          if (doc.id === selectedDocId) {
            const updatedSubDocs = [...doc.subDocuments, ...newSubDocs];
            const currentSubDocsSum = updatedSubDocs.reduce((sum, s) => sum + s.amount, 0);

            if (currentSubDocsSum > doc.totalAmount) {
              throw new Error(
                `La suma de los PNRs (${currentSubDocsSum.toLocaleString()}) excede el monto total del documento (${doc.totalAmount.toLocaleString()}).`
              );
            }
            return { ...doc, subDocuments: updatedSubDocs };
          }
          return doc;
        })
      );
      alert(`Se cargaron ${newSubDocs.length} detalles al documento ${selectedDocId}.`);
      setIsMassiveDetailUploadModalOpen(false);
      setMassiveDetailFile(null);
    } catch (err: any) {
      setMassiveDetailError(err.message || 'Error al procesar la carga masiva de detalles.');
    } finally {
      event.target.value = ''; // Clear file input
    }
  };

  const onDownloadMassiveDetailTemplate = () => {
    const headers = ['PNR', 'MontoPNR'].join(',');
    const sample = 'ABC123,10000\nDEF456,20000';
    const blob = new Blob([`${headers}\n${sample}\n`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'plantilla-detalles-cobranza-masiva.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const onDownloadPaymentsTemplate = () => {
    const headers = ['DocumentoID', 'MovimientoID', 'Monto'].join(';');
    const sample = 'FAC-1001;MOV-20240521-X1Y2;50000';
    const blob = new Blob([`${headers}\n${sample}\n`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'plantilla-pagos-masivos.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const onMassUploadPayments = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const rows = XLSX.utils.sheet_to_json<any>(workbook.Sheets[workbook.SheetNames[0]]);

      if (typeof setMovements !== 'function') {
        alert('Error interno: No se puede actualizar la cartola bancaria.');
        return;
      }

      // Clones para trabajar sobre ellos y actualizar al final
      let updatedDocs = [...cobranzaDocs];
      let updatedMovements = [...movements];

      // Mapas para rastrear saldos disponibles reales (considerando documentos ya asociados en cartola)
      const movementBalances = new Map(
        updatedMovements.map((m) => {
          const used = m.documents.reduce((s, d) => s + d.amount, 0);
          return [m.movementId, m.amount - used];
        })
      );

      const ncBalances = new Map(
        updatedDocs.filter((d) => d.type === 'Nota de Crédito').map((d) => [d.id, d.pendingAmount])
      );

      let successCount = 0;

      for (const row of rows) {
        const docId = String(row.DocumentoID);
        const movId = String(row.MovimientoID);
        const requestedAmount =
          row.Monto === undefined || row.Monto === null || row.Monto === ''
            ? null
            : Number(row.Monto);

        const dIdx = updatedDocs.findIndex((d) => d.id === docId);
        if (dIdx === -1) continue;

        const doc = updatedDocs[dIdx];
        if (doc.pendingAmount <= 0.01) continue; // Documento ya pagado

        // Validar que el monto sea un número positivo si se especifica
        if (requestedAmount !== null && (isNaN(requestedAmount) || requestedAmount <= 0)) {
          console.warn(
            `Skipping row for DocumentoID: ${docId}, MovimientoID: ${movId}. Monto inválido: ${requestedAmount}`
          );
          continue;
        }

        let paymentSource: { amount: number; date: string; bank: string } | null = null;
        let isBankMovement = false;

        // 1. Intentar buscar en Cartola Bancaria
        const mIdx = updatedMovements.findIndex((m) => m.movementId === movId);
        if (mIdx !== -1 && (movementBalances.get(movId) || 0) > 0.01) {
          // Check for available balance
          const mov = updatedMovements[mIdx];
          paymentSource = { amount: movementBalances.get(movId)!, date: mov.date, bank: mov.bank };
          isBankMovement = true;
        }
        // 2. Si no es banco, intentar buscar en Notas de Crédito
        else if (ncBalances.has(movId) && ncBalances.get(movId)! > 0.01) {
          // Check for available balance
          const nc = updatedDocs.find((d) => d.id === movId)!;
          paymentSource = { amount: ncBalances.get(movId)!, date: nc.date, bank: 'Aplicación NC' };
        }

        if (paymentSource && !doc.payments.some((p) => p.movementId === movId)) {
          // El monto a aplicar es el menor entre: lo solicitado, lo disponible en la fuente, o lo que debe el documento
          let appliedAmount = Math.min(paymentSource.amount, doc.pendingAmount);
          if (requestedAmount !== null) {
            appliedAmount = Math.min(appliedAmount, requestedAmount);
          }

          if (appliedAmount <= 0.01) continue; // No aplicar si el monto es insignificante

          // Validar que el monto a aplicar no exceda el saldo disponible de la fuente
          if (appliedAmount > paymentSource.amount + 0.01) {
            console.warn(
              `Skipping row for DocumentoID: ${docId}, MovimientoID: ${movId}. Monto a aplicar (${appliedAmount}) excede el saldo disponible de la fuente (${paymentSource.amount}).`
            );
            continue;
          }

          const newDocPending = doc.pendingAmount - appliedAmount;

          // Actualizar Documento Principal
          updatedDocs[dIdx] = {
            ...doc,
            pendingAmount: newDocPending,
            status: newDocPending <= 0.01 ? 'Pagado' : ('Parcial' as any),
            payments: [
              ...doc.payments,
              {
                movementId: movId,
                amount: appliedAmount,
                date: paymentSource.date,
                bank: paymentSource.bank,
              },
            ],
          };

          // Actualizar Saldo de la fuente (Banco o NC)
          if (isBankMovement) {
            movementBalances.set(movId, paymentSource.amount - appliedAmount);

            // Importante: Agregar el detalle del documento al movimiento bancario para la pestaña de Cartola
            const currentMov = updatedMovements[mIdx];
            updatedMovements[mIdx] = {
              ...currentMov,
              mainIdentification: 'Cobranza crédito',
              mainIdentificationId: 'IDN-CC',
              documents: [
                ...currentMov.documents,
                {
                  id: `DOC-MASS-${Date.now()}-${successCount}`,
                  reference: doc.id,
                  amount: appliedAmount,
                  detail: 'Carga Masiva',
                },
              ],
            };
          } else {
            ncBalances.set(movId, paymentSource.amount - appliedAmount);
            const ncIdx = updatedDocs.findIndex((d) => d.id === movId);
            updatedDocs[ncIdx] = {
              ...updatedDocs[ncIdx],
              pendingAmount: paymentSource.amount - appliedAmount,
              status: (paymentSource.amount - appliedAmount <= 0.01 ? 'Pagado' : 'Parcial') as any,
            };
          }
          successCount++;
        }
      }

      setCobranzaDocs(updatedDocs);
      setMovements(updatedMovements);
      alert(`Se procesaron correctamente ${successCount} asociaciones de pago.`);
    } catch (err) {
      alert('Error al procesar el archivo de pagos masivos.');
    } finally {
      event.target.value = '';
    }
  };

  if (!isAuthorized)
    return <div className="p-8 text-center text-slate-500">Acceso Restringido</div>;

  return (
    <div className="space-y-6">
      <Card className="p-4 bg-slate-50/50">
        <div className="flex justify-between items-center mb-6 border-b pb-4">
          <div>
            <h3 className="text-xl font-bold text-jetsmart-blue">Gestión de Cobranzas</h3>
            <p className="text-xs text-slate-500">
              Carga de facturas y conciliación de pagos pendientes
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-1 items-center border rounded-lg p-1 bg-white">
              <Button
                variant="ghost"
                size="sm"
                className="text-[10px] h-7"
                onClick={onDownloadCobranzaTemplate}
              >
                Template Docs
              </Button>
              <label className="flex items-center px-2 h-7 bg-slate-50 hover:bg-slate-100 rounded border cursor-pointer text-[10px] font-medium">
                Carga Invoices{' '}
                <input type="file" className="hidden" onChange={onMassUploadCobranza} />
              </label>
            </div>
            <div className="flex gap-1 items-center border border-emerald-200 rounded-lg p-1 bg-emerald-50/30">
              <Button
                variant="ghost"
                size="sm"
                className="text-[10px] h-7 text-emerald-700"
                onClick={onDownloadPaymentsTemplate}
              >
                Template Pagos
              </Button>
              <label className="flex items-center px-2 h-7 bg-emerald-600 text-white hover:bg-emerald-700 rounded cursor-pointer text-[10px] font-medium">
                Carga Pagos <input type="file" className="hidden" onChange={onMassUploadPayments} />
              </label>
            </div>
          </div>
        </div>

        {/* Toggle de Vista */}
        <div className="flex bg-slate-100 p-1 rounded-lg w-fit mb-4">
          <button
            className={`px-4 py-1.5 text-xs rounded-md transition-all ${viewMode === 'general' ? 'bg-white shadow-sm font-bold text-jetsmart-blue' : 'text-slate-500 hover:text-slate-700'}`}
            onClick={() => setViewMode('general')}
          >
            Vista General
          </button>
          <button
            className={`px-4 py-1.5 text-xs rounded-md transition-all ${viewMode === 'edoCuenta' ? 'bg-white shadow-sm font-bold text-jetsmart-blue' : 'text-slate-500 hover:text-slate-700'}`}
            onClick={() => setViewMode('edoCuenta')}
          >
            Modo Estado de Cuenta
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
          <div className="md:col-span-3 space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-400">
              Filtrar por Cliente
            </label>
            <select
              className="w-full h-9 border rounded-md bg-white text-sm"
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
            >
              <option value="all">Todos los clientes</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.appCode || c.id} | {c.name}
                </option>
              ))}
            </select>
          </div>

          {viewMode === 'general' ? (
            <>
              <div className="md:col-span-3 space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400">
                  Estado Actual
                </label>
                <select
                  className="w-full h-9 border rounded-md bg-white text-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">Cualquier estado</option>
                  <option value="Pendiente">Pendiente</option>
                  <option value="Pagado">Pagado</option>
                  <option value="Parcial">Parcial</option>
                </select>
              </div>
              <div className="md:col-span-4 space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400">
                  Filtro de Emisión (Rango Opcional)
                </label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    className="h-9 text-xs"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  <Input
                    type="date"
                    className="h-9 text-xs"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="md:col-span-2 pt-5">
                <Button variant="outline" className="w-full h-9" onClick={onExportCurrentView}>
                  Exportar Excel
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="md:col-span-3 space-y-1">
                <label className="text-[10px] uppercase font-bold text-jetsmart-blue">
                  Fecha de Corte Edo. Cuenta
                </label>
                <Input
                  type="date"
                  className="h-9"
                  value={cutOffDate}
                  onChange={(e) => setCutOffDate(e.target.value)}
                />
              </div>
              <div className="md:col-span-3 pt-5">
                <Button className="w-full h-9 bg-jetsmart-blue" onClick={generateEdoCuenta}>
                  Exportar Excel Point-in-time
                </Button>
              </div>
              <div className="md:col-span-3 pt-5 text-[10px] text-slate-400 italic flex items-center h-9">
                * Visualizando deuda histórica al {cutOffDate}
              </div>
            </>
          )}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-600 font-bold border-b">
              <tr>
                <th className="px-4 py-3">Doc ID</th>
                <th className="px-4 py-3">Tipo / Fecha</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3 text-right">Monto</th>
                <th className="px-4 py-3 text-right">Saldo</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {processedDocs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                    No se encontraron documentos
                  </td>
                </tr>
              ) : (
                processedDocs.map((d) => (
                  <tr
                    key={d.id}
                    className={`border-b hover:bg-slate-50/80 transition-colors ${d.displayStatus === 'Pagado' ? 'bg-emerald-50/20' : d.displayStatus === 'Parcial' ? 'bg-amber-50/20' : ''}`}
                  >
                    <td className="px-4 py-4 font-mono text-[11px] text-slate-500">{d.id}</td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-slate-700">{d.type}</div>
                      <div className="text-[10px] text-slate-400">{formatDate(d.date)}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium">
                        {clients.find((c) => c.id === d.clientId)?.name}
                      </div>
                      <div className="text-[10px] text-slate-400 uppercase">{d.country}</div>
                    </td>
                    <td className="px-4 py-4 text-right font-medium">
                      ${d.totalAmount.toLocaleString()}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span
                        className={`font-bold ${d.displayBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}
                      >
                        ${d.displayBalance.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center space-y-1">
                      <Badge
                        variant={
                          d.displayStatus === 'Pagado'
                            ? 'default'
                            : d.displayStatus === 'Parcial'
                              ? 'secondary'
                              : 'outline'
                        }
                        className={
                          d.displayStatus === 'Pagado'
                            ? 'bg-emerald-600'
                            : d.displayStatus === 'Parcial'
                              ? 'bg-amber-100 text-amber-800'
                              : ''
                        }
                      >
                        {d.displayStatus}
                      </Badge>
                      {d.displayPayments > 0 && (
                        <Button
                          variant="link"
                          className="h-auto p-0 text-[10px] block w-full text-jetsmart-blue"
                          onClick={() => {
                            setSelectedDocForDetails(d);
                            setIsPayDetailModalOpen(true);
                          }}
                        >
                          Ver {d.displayPayments} pago(s)
                        </Button>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-[10px]"
                          onClick={() => {
                            setSelectedDocId(d.id);
                            setIsSubDocsModalOpen(true);
                          }}
                        >
                          Detalle PNR
                        </Button>
                        {d.status !== 'Pagado' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-[10px] border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            onClick={() => {
                              setSelectedDocId(d.id);
                              setIsPaymentModalOpen(true);
                            }}
                          >
                            Asociar Pago
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal Detalle PNR */}
      <Dialog open={isSubDocsModalOpen} onOpenChange={setIsSubDocsModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Composición del Documento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            {!currentViewingDoc || currentViewingDoc.subDocuments.length === 0 ? (
              <div className="text-center py-4 text-slate-400 italic">
                No hay detalles registrados.
              </div>
            ) : (
              currentViewingDoc.subDocuments.map((s) => (
                <div
                  key={s.id}
                  className="flex justify-between items-center p-2 rounded bg-slate-50 text-sm border"
                >
                  <span className="font-mono font-bold text-jetsmart-blue">{s.reference}</span>
                  <span className="text-slate-600">${s.amount.toLocaleString()}</span>
                </div>
              ))
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-[10px] mt-2 border-dashed"
                onClick={() => setIsAddDetailModalOpen(true)}
              >
                + Agregar PNR / Detalle Manual
              </Button>
              <label className="flex items-center justify-center px-3 py-1.5 bg-slate-100 rounded-md cursor-pointer hover:bg-slate-200 transition-colors text-[10px] font-medium border border-slate-200">
                Carga Masiva PNRs{' '}
                <input type="file" className="hidden" onChange={onMassUploadSubDocuments} />
              </label>
            </div>
            {massiveDetailError && (
              <p className="text-xs text-red-600 mt-2">{massiveDetailError}</p>
            )}
            <div className="pt-3 border-t flex justify-between font-bold text-lg">
              <span>Total</span>
              <span>
                $
                {currentViewingDoc?.subDocuments
                  .reduce((a, b) => a + b.amount, 0)
                  .toLocaleString() || 0}
              </span>
            </div>
            <div className="text-xs text-slate-500">
              Monto Total Documento: $
              {cobranzaDocs.find((d) => d.id === selectedDocId)?.totalAmount.toLocaleString()}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsSubDocsModalOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Agregar Detalle Manual */}
      <Dialog open={isAddDetailModalOpen} onOpenChange={setIsAddDetailModalOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Nuevo PNR / Referencia</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              placeholder="Referencia (Ej: ABC123)"
              value={newDetailRef}
              onChange={(e) => setNewDetailRef(e.target.value)}
            />
            <Input
              type="number"
              placeholder="Monto"
              value={newDetailAmount}
              onChange={(e) => setNewDetailAmount(e.target.value)}
            />
            {addDetailError && <p className="text-xs text-red-600 mt-1">{addDetailError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDetailModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={onAddDetailToDoc}>Agregar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Detalle de Pagos Recibidos */}
      <Dialog open={isPayDetailModalOpen} onOpenChange={setIsPayDetailModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pagos Asociados - {selectedDocForDetails?.id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            {selectedDocForDetails?.payments.length === 0 ? (
              <div className="text-center py-4 text-slate-400 italic">No hay pagos asociados.</div>
            ) : (
              <>
                {selectedDocForDetails?.payments.map((p, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg border bg-emerald-50/50 flex justify-between items-center text-xs"
                  >
                    <div>
                      <div className="font-bold text-emerald-800">{p.bank}</div>
                      <div className="text-slate-500">
                        Fecha: {formatDate(p.date)} | ID: {p.movementId}
                      </div>
                    </div>
                    <div className="text-right font-bold text-emerald-700 text-sm">
                      + ${p.amount.toLocaleString()}
                    </div>
                  </div>
                ))}
                <div className="pt-3 border-t text-right">
                  <span className="text-xs text-slate-500 mr-2">Total Pagado:</span>
                  <span className="font-bold text-emerald-600">
                    $
                    {selectedDocForDetails?.payments
                      .reduce((s, p) => s + p.amount, 0)
                      .toLocaleString()}
                  </span>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsPayDetailModalOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Vincular Pago */}
      <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aplicar Pago o Nota de Crédito</DialogTitle>
            <DialogDescription>
              Seleccione la fuente para rebajar el saldo del documento.
            </DialogDescription>
          </DialogHeader>

          <div className="flex bg-slate-100 p-1 rounded-md w-full mb-2">
            <button
              className={`flex-1 py-1 text-[10px] rounded ${paymentSourceType === 'bank' ? 'bg-white shadow-sm font-bold' : ''}`}
              onClick={() => {
                setPaymentSourceType('bank');
                setPaymentMovId('');
              }}
            >
              Movimiento Bancario
            </button>
            <button
              className={`flex-1 py-1 text-[10px] rounded ${paymentSourceType === 'nc' ? 'bg-white shadow-sm font-bold' : ''}`}
              onClick={() => {
                setPaymentSourceType('nc');
                setPaymentMovId('');
              }}
            >
              Nota de Crédito
            </button>
          </div>

          <div className="py-4 space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500">
                {paymentSourceType === 'bank'
                  ? 'Abonos en Cartola'
                  : 'Notas de Crédito Disponibles'}
              </label>
              <select
                className="w-full h-10 border rounded-md px-2 text-sm"
                value={paymentMovId}
                onChange={(e) => setPaymentMovId(e.target.value)}
              >
                <option value="">Seleccionar...</option>
                {paymentSourceType === 'bank'
                  ? movements
                      .filter((m) => {
                        const used = m.documents.reduce((s, d) => s + d.amount, 0);
                        // Mostrar si no tiene tipo o si es de cobranza pero aún le queda saldo
                        return (
                          (m.mainIdentification === 'Sin identificar' ||
                            m.mainIdentification === 'Cobranza crédito') &&
                          used < m.amount - 0.01
                        );
                      })
                      .map((m) => {
                        const used = m.documents.reduce((s, d) => s + d.amount, 0);
                        const available = m.amount - used;
                        return (
                          <option key={m.movementId} value={m.movementId}>
                            {formatDate(m.date)} - {m.bank} (Disp: ${available.toLocaleString()} / Total: $
                            {m.amount.toLocaleString()})
                          </option>
                        );
                      })
                  : cobranzaDocs
                      .filter(
                        (d) =>
                          d.type === 'Nota de Crédito' &&
                          d.pendingAmount > 0 &&
                          d.clientId === cobranzaDocs.find((x) => x.id === selectedDocId)?.clientId
                      )
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.id} (Saldo: ${d.pendingAmount.toLocaleString()})
                        </option>
                      ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500">Monto a Aplicar</label>
              <Input
                type="number"
                placeholder="Ej: 50000"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
              <p className="text-[10px] text-slate-400">
                Saldo Pendiente del Documento: $
                {cobranzaDocs.find((d) => d.id === selectedDocId)?.pendingAmount.toLocaleString()}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={onAssociatePayment}
              disabled={!paymentMovId}
            >
              Confirmar Conciliación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
