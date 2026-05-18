'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BankAccount } from '@/types';

interface BankAccountManagementProps {
  accounts: BankAccount[];
  onAddAccount: (account: BankAccount) => void;
  onDeleteAccount: (id: string) => void;
}

export function BankAccountManagement({ accounts, onAddAccount, onDeleteAccount }: BankAccountManagementProps) {
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [country, setCountry] = useState('Chile');

  const handleAdd = () => {
    if (!bankName || !accountNumber) return;
    onAddAccount({
      id: `ACC-${Date.now()}`,
      bankName,
      accountNumber,
      country
    });
    setBankName('');
    setAccountNumber('');
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-white p-4">
        <h3 className="mb-4 text-lg font-semibold">Configuración de Cuentas Bancarias</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4 items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium">Banco</label>
            <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Ej: Banco Estado" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">N° de Cuenta</label>
            <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="12345678" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">País</label>
            <select 
              className="h-10 w-full rounded-md border bg-white px-3 text-sm"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              <option value="Chile">Chile</option>
              <option value="Perú">Perú</option>
              <option value="Colombia">Colombia</option>
            </select>
          </div>
          <Button onClick={handleAdd}>Registrar Cuenta</Button>
        </div>
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-4 py-3">Banco</th>
              <th className="px-4 py-3">Número de Cuenta</th>
              <th className="px-4 py-3">País</th>
              <th className="px-4 py-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500 italic">
                  No hay cuentas registradas.
                </td>
              </tr>
            ) : (
              accounts.map((acc) => (
                <tr key={acc.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{acc.bankName}</td>
                  <td className="px-4 py-3">{acc.accountNumber}</td>
                  <td className="px-4 py-3">{acc.country}</td>
                  <td className="px-4 py-3 text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-red-600 hover:text-red-700"
                      onClick={() => onDeleteAccount(acc.id)}
                    >
                      Eliminar
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        * Estas cuentas estarán disponibles para la carga manual y validación de cartola.
      </p>
    </div>
  );
}