'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Client } from '@/types';

interface ClientManagementProps {
  clients: Client[];
  onAddClient: (client: Client) => void;
  onDeleteClient: (id: string) => void;
}

export function ClientManagement({ clients, onAddClient, onDeleteClient }: ClientManagementProps) {
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [navitaireCode, setNavitaireCode] = useState('');
  const [sapBP, setSapBP] = useState('');

  const handleAdd = () => {
    if (!name || !taxId) return;
    onAddClient({ id: `CLI-${Date.now()}`, name, taxId, navitaireCode, sapBP, isActive: true });
    setName('');
    setTaxId('');
    setNavitaireCode('');
    setSapBP('');
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-white p-4">
        <h3 className="mb-4 text-lg font-semibold">Gestión de Clientes</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-5 items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium">Nombre Cliente / Agencia</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Latam Travel"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">RUT / Tax ID</label>
            <Input
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder="77.123.456-K"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Cód. Navitaire</label>
            <Input
              value={navitaireCode}
              onChange={(e) => setNavitaireCode(e.target.value)}
              placeholder="N-123"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">BP SAP</label>
            <Input value={sapBP} onChange={(e) => setSapBP(e.target.value)} placeholder="1000456" />
          </div>
          <Button onClick={handleAdd}>Registrar Cliente</Button>
        </div>
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">RUT / Tax ID</th>
              <th className="px-4 py-3">Navitaire</th>
              <th className="px-4 py-3">SAP BP</th>
              <th className="px-4 py-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3">{c.taxId}</td>
                <td className="px-4 py-3 font-mono text-xs">{c.navitaireCode || '-'}</td>
                <td className="px-4 py-3 font-mono text-xs">{c.sapBP || '-'}</td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600"
                    onClick={() => onDeleteClient(c.id)}
                  >
                    Eliminar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
