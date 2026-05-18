'use client';

import { useState, useEffect } from 'react';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserRecord, UserRole } from '@/types';

export function UserManagement() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('Agente CC');
  const [userFormError, setUserFormError] = useState<string | null>(null);
  const [generatedPasswordMessage, setGeneratedPasswordMessage] = useState<string | null>(null);

  useEffect(() => {
    // Carga inicial de datos de ejemplo para desarrollo local
    setUsers([
      { id: 'USR-001', name: 'Usuario Prueba', email: 'admin@smartycash.cl', role: 'Administrador', isActive: true },
      { id: 'USR-002', name: 'Andrea Soto', email: 'asoto@smartycash.cl', role: 'Agente CC', isActive: true },
    ]);
  }, []);

  const onAddUser = () => {
    setUserFormError(null);
    const userSchema = z.object({
      name: z.string().trim().min(1, 'El nombre es obligatorio.'),
      email: z.string().trim().email('Debes ingresar un email válido.'),
      role: z.custom<UserRole>(),
    });

    const parsedUser = userSchema.safeParse({
      name: newUserName,
      email: newUserEmail,
      role: newUserRole,
    });

    if (!parsedUser.success) {
      setUserFormError(parsedUser.error.issues[0]?.message ?? 'Datos inválidos.');
      return;
    }

    // Lógica local sin base de datos
    const mockNewUser: UserRecord = {
        id: `USR-${Math.floor(Math.random() * 1000)}`,
        ...parsedUser.data,
        isActive: true
    };
    setUsers((prev) => [mockNewUser, ...prev]);
    setGeneratedPasswordMessage(`Usuario creado (Modo local). Contraseña temporal: Temp1234`);
    setNewUserName('');
    setNewUserEmail('');
  };

  const onToggleUser = (userId: string) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, isActive: !u.isActive } : u))
    );
  };

  return (
    <div className="rounded-lg border bg-white p-4">
      <h3 className="mb-3 text-lg font-semibold">Módulo de Usuarios</h3>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-col gap-2">
          <label className="text-sm font-medium">Nombre</label>
          <Input value={newUserName} onChange={(e) => setNewUserName(e.target.value)} placeholder="Ej: Andrea Soto" />
        </div>
        <div className="flex min-w-56 flex-col gap-2">
          <label className="text-sm font-medium">Email</label>
          <Input type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} placeholder="usuario@smartycash.cl" />
        </div>
        <div className="flex min-w-56 flex-col gap-2">
          <label className="text-sm font-medium">Rol</label>
          <select
            className="h-10 rounded-md border bg-white px-3 text-sm"
            value={newUserRole}
            onChange={(e) => setNewUserRole(e.target.value as UserRole)}
          >
            {['Administrador', 'Contabilidad', 'Recaudación', 'Conciliación medios de pago', 'Agente CC', 'Cobranza'].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <Button onClick={onAddUser}>Agregar usuario</Button>
      </div>
      {userFormError && <p className="mb-3 text-sm text-red-600">{userFormError}</p>}
      {generatedPasswordMessage && <p className="mb-3 text-sm text-emerald-700">{generatedPasswordMessage}</p>}

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Acción</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t">
                <td className="px-4 py-3">{user.id}</td>
                <td className="px-4 py-3">{user.name}</td>
                <td className="px-4 py-3">{user.email}</td>
                <td className="px-4 py-3">{user.role}</td>
                <td className="px-4 py-3">
                  <Badge variant={user.isActive ? 'default' : 'secondary'}>
                    {user.isActive ? 'Activo' : 'Inactivo'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Button variant="outline" size="sm" onClick={() => onToggleUser(user.id)}>
                    {user.isActive ? 'Desactivar' : 'Activar'}
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