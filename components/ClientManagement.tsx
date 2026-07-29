'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Client } from '@/types';

interface ClientManagementProps {
  clients: Client[];
  onAddClient: (client: Client) => void;
  onUpdateClient: (client: Client) => void;
  onDeleteClient: (id: string) => void;
}

export function ClientManagement({
  clients,
  onAddClient,
  onUpdateClient,
  onDeleteClient,
}: ClientManagementProps) {
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [navitaireCode, setNavitaireCode] = useState('');
  const [sapBP, setSapBP] = useState('');
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const handleAdd = () => {
    if (!name || !taxId) return;
    onAddClient({ id: '', name, taxId, navitaireCode, sapBP, isActive: true });
    setName('');
    setTaxId('');
    setNavitaireCode('');
    setSapBP('');
  };

  const startEdit = (client: Client) => {
    setEditingClient({
      ...client,
      navitaireCode: client.navitaireCode ?? '',
      sapBP: client.sapBP ?? '',
    });
  };

  const handleSaveEdit = () => {
    if (!editingClient?.name || !editingClient.taxId) return;
    onUpdateClient(editingClient);
    setEditingClient(null);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-white p-4">
        <h3 className="mb-4 text-lg font-semibold">Gestion de Clientes</h3>
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
            <label className="text-sm font-medium">Cod. Navitaire</label>
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
              <th className="px-4 py-3">ID App</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">RUT / Tax ID</th>
              <th className="px-4 py-3">Navitaire</th>
              <th className="px-4 py-3">SAP BP</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Accion</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{client.appCode || client.id}</td>
                <td className="px-4 py-3 font-medium">{client.name}</td>
                <td className="px-4 py-3">{client.taxId}</td>
                <td className="px-4 py-3 font-mono text-xs">{client.navitaireCode || '-'}</td>
                <td className="px-4 py-3 font-mono text-xs">{client.sapBP || '-'}</td>
                <td className="px-4 py-3">{client.isActive === false ? 'Inactivo' : 'Activo'}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <Button variant="outline" size="sm" onClick={() => startEdit(client)}>
                    Modificar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600"
                    onClick={() => onDeleteClient(client.id)}
                    disabled={client.isActive === false}
                  >
                    Desactivar
                  </Button>
                </td>
              </tr>
            ))}
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
              <label className="text-sm font-medium">Nombre Cliente / Agencia</label>
              <Input
                value={editingClient.name}
                onChange={(e) => setEditingClient({ ...editingClient, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">RUT / Tax ID</label>
              <Input
                value={editingClient.taxId}
                onChange={(e) => setEditingClient({ ...editingClient, taxId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cod. Navitaire</label>
              <Input
                value={editingClient.navitaireCode ?? ''}
                onChange={(e) =>
                  setEditingClient({ ...editingClient, navitaireCode: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">BP SAP</label>
              <Input
                value={editingClient.sapBP ?? ''}
                onChange={(e) => setEditingClient({ ...editingClient, sapBP: e.target.value })}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingClient(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit}>Guardar cambios</Button>
          </div>
        </div>
      )}
    </div>
  );
}
