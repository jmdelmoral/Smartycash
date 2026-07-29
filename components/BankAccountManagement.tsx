'use client';

import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BankAccount } from '@/types';

interface BankAccountManagementProps {
  accounts: BankAccount[];
  onAddAccount: (account: BankAccount) => void | Promise<void>;
  onUpdateAccount: (account: BankAccount) => void | Promise<void>;
  onDeleteAccount: (id: string) => void;
}

type AccountImportRow = {
  Banco?: string;
  NumeroCuenta?: string;
  Pais?: string;
  Moneda?: string;
  TaxID?: string;
  RazonSocial?: string;
};

const countryOptions = ['Chile', 'Peru', 'Colombia'];
const currencyOptions = ['CLP', 'USD', 'PEN', 'COP'];

export function BankAccountManagement({
  accounts,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
}: BankAccountManagementProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [country, setCountry] = useState('Chile');
  const [currency, setCurrency] = useState('CLP');
  const [taxId, setTaxId] = useState('');
  const [legalName, setLegalName] = useState('');
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [importMessage, setImportMessage] = useState('');

  const resetForm = () => {
    setBankName('');
    setAccountNumber('');
    setCountry('Chile');
    setCurrency('CLP');
    setTaxId('');
    setLegalName('');
  };

  const handleAdd = async () => {
    if (!bankName || !accountNumber) return;
    await onAddAccount({
      id: '',
      bankName,
      accountNumber,
      country,
      currency,
      taxId,
      legalName,
      isActive: true,
    });
    resetForm();
  };

  const startEdit = (account: BankAccount) => {
    setEditingAccount({
      ...account,
      currency: account.currency ?? 'CLP',
      taxId: account.taxId ?? '',
      legalName: account.legalName ?? '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingAccount?.bankName || !editingAccount.accountNumber) return;
    await onUpdateAccount(editingAccount);
    setEditingAccount(null);
  };

  const downloadTemplate = () => {
    const rows = [
      {
        Banco: 'Banco Estado',
        NumeroCuenta: '12345678',
        Pais: 'Chile',
        Moneda: 'CLP',
        TaxID: '76.123.456-7',
        RazonSocial: 'Empresa Demo SpA',
      },
    ];
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Cuentas');
    XLSX.writeFile(workbook, 'plantilla-cuentas-bancarias-smartycash.xlsx');
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<AccountImportRow>(worksheet, { defval: '' });
    const validRows = rows.filter((row) => row.Banco && row.NumeroCuenta);

    for (const row of validRows) {
      await onAddAccount({
        id: '',
        bankName: String(row.Banco ?? '').trim(),
        accountNumber: String(row.NumeroCuenta ?? '').trim(),
        country: String(row.Pais || 'Chile').trim(),
        currency: String(row.Moneda || 'CLP')
          .trim()
          .toUpperCase(),
        taxId: String(row.TaxID ?? '').trim(),
        legalName: String(row.RazonSocial ?? '').trim(),
        isActive: true,
      });
    }

    setImportMessage(`Carga procesada: ${validRows.length} cuentas enviadas a base de datos.`);
    event.target.value = '';
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-white p-4">
        <h3 className="mb-4 text-lg font-semibold">Configuracion de Cuentas Bancarias</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6 items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium">Banco</label>
            <Input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="Ej: Banco Estado"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Nro. de Cuenta</label>
            <Input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="12345678"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Pais</label>
            <select
              className="h-10 w-full rounded-md border bg-white px-3 text-sm"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              {countryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Moneda</label>
            <select
              className="h-10 w-full rounded-md border bg-white px-3 text-sm"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {currencyOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Tax ID</label>
            <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Razon social</label>
            <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleImportFile}
          />
          <Button variant="outline" onClick={downloadTemplate}>
            Descargar plantilla
          </Button>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            Carga masiva
          </Button>
          <Button onClick={handleAdd}>Registrar Cuenta</Button>
        </div>
        {importMessage && <p className="mt-3 text-sm text-slate-600">{importMessage}</p>}
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-4 py-3">ID Cuenta</th>
              <th className="px-4 py-3">Banco</th>
              <th className="px-4 py-3">Numero</th>
              <th className="px-4 py-3">Pais</th>
              <th className="px-4 py-3">Moneda</th>
              <th className="px-4 py-3">Tax ID</th>
              <th className="px-4 py-3">Razon social</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Accion</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500 italic">
                  No hay cuentas registradas.
                </td>
              </tr>
            ) : (
              accounts.map((account) => (
                <tr key={account.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs">{account.displayId || account.id}</td>
                  <td className="px-4 py-3 font-medium">{account.bankName}</td>
                  <td className="px-4 py-3">{account.accountNumber}</td>
                  <td className="px-4 py-3">{account.country}</td>
                  <td className="px-4 py-3">{account.currency || '-'}</td>
                  <td className="px-4 py-3">{account.taxId || '-'}</td>
                  <td className="px-4 py-3">{account.legalName || '-'}</td>
                  <td className="px-4 py-3">
                    {account.isActive === false ? 'Inactiva' : 'Activa'}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <Button variant="outline" size="sm" onClick={() => startEdit(account)}>
                      Modificar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => onDeleteAccount(account.id)}
                      disabled={account.isActive === false}
                    >
                      Desactivar
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editingAccount && (
        <div className="rounded-lg border bg-white p-4">
          <h3 className="mb-4 text-lg font-semibold">Modificar Cuenta Bancaria</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-6 items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium">ID Cuenta</label>
              <Input value={editingAccount.displayId || editingAccount.id} disabled />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Banco</label>
              <Input
                value={editingAccount.bankName}
                onChange={(e) => setEditingAccount({ ...editingAccount, bankName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nro. de Cuenta</label>
              <Input
                value={editingAccount.accountNumber}
                onChange={(e) =>
                  setEditingAccount({ ...editingAccount, accountNumber: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Pais</label>
              <select
                className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                value={editingAccount.country}
                onChange={(e) => setEditingAccount({ ...editingAccount, country: e.target.value })}
              >
                {countryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Moneda</label>
              <select
                className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                value={editingAccount.currency ?? 'CLP'}
                onChange={(e) => setEditingAccount({ ...editingAccount, currency: e.target.value })}
              >
                {currencyOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tax ID</label>
              <Input
                value={editingAccount.taxId ?? ''}
                onChange={(e) => setEditingAccount({ ...editingAccount, taxId: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Razon social</label>
              <Input
                value={editingAccount.legalName ?? ''}
                onChange={(e) =>
                  setEditingAccount({ ...editingAccount, legalName: e.target.value })
                }
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingAccount(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit}>Guardar cambios</Button>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500">
        * Estas cuentas estaran disponibles para la carga manual y validacion de cartola.
      </p>
    </div>
  );
}
