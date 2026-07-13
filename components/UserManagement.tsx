'use client';

import { useState, useEffect } from 'react';
import { z } from 'zod';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { USER_ROLE_LABELS, UserRecord, UserRole } from '@/types';

const roleOptions: Array<{ value: UserRole; label: string }> = [
  { value: 'Administrador', label: USER_ROLE_LABELS.Administrador },
  { value: 'Contabilidad', label: USER_ROLE_LABELS.Contabilidad },
  { value: 'Recaudacion', label: USER_ROLE_LABELS.Recaudacion },
  { value: 'ConciliacionMediosDePago', label: USER_ROLE_LABELS.ConciliacionMediosDePago },
  { value: 'AgenteCC', label: USER_ROLE_LABELS.AgenteCC },
  { value: 'Cobranza', label: USER_ROLE_LABELS.Cobranza },
];

export function UserManagement() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('AgenteCC');
  const [userFormError, setUserFormError] = useState<string | null>(null);
  const [generatedPasswordMessage, setGeneratedPasswordMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadUsers = async () => {
    setIsLoading(true);
    setUserFormError(null);

    try {
      const response = await fetch('/api/users', { cache: 'no-store' });
      const data = (await response.json()) as { users?: UserRecord[]; error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'No se pudieron cargar los usuarios.');
      }
      setUsers(data.users ?? []);
    } catch (error) {
      setUserFormError(error instanceof Error ? error.message : 'Error cargando usuarios.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const onAddUser = async () => {
    setUserFormError(null);
    const userSchema = z.object({
      name: z.string().trim().min(1, 'El nombre es obligatorio.'),
      email: z.string().trim().email('Debes ingresar un email válido.'),
      role: z.enum(roleOptions.map((role) => role.value) as [UserRole, ...UserRole[]]),
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

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedUser.data),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'No se pudo crear el usuario.');
      }
      setUsers((prev) => [data.user, ...prev]);
      setGeneratedPasswordMessage(`Usuario creado. Contraseña temporal: ${data.temporaryPassword}`);
      setNewUserName('');
      setNewUserEmail('');
    } catch (error) {
      setUserFormError(error instanceof Error ? error.message : 'No se pudo crear el usuario.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const onToggleUser = async (userId: string) => {
    setUserFormError(null);
    setIsSubmitting(true);

    const targetUser = users.find((user) => user.id === userId);
    if (!targetUser) {
      setUserFormError('Usuario no encontrado.');
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, isActive: !targetUser.isActive }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'No se pudo actualizar el usuario.');
      }
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...data.user } : u)));
      setGeneratedPasswordMessage(null);
    } catch (error) {
      setUserFormError(
        error instanceof Error ? error.message : 'No se pudo actualizar el usuario.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border bg-white p-4">
      <h3 className="mb-3 text-lg font-semibold">Módulo de Usuarios</h3>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-col gap-2">
          <label className="text-sm font-medium">Nombre</label>
          <Input
            value={newUserName}
            onChange={(e) => setNewUserName(e.target.value)}
            placeholder="Ej: Andrea Soto"
          />
        </div>
        <div className="flex min-w-56 flex-col gap-2">
          <label className="text-sm font-medium">Email</label>
          <Input
            type="email"
            value={newUserEmail}
            onChange={(e) => setNewUserEmail(e.target.value)}
            placeholder="usuario@smartycash.cl"
          />
        </div>
        <div className="flex min-w-56 flex-col gap-2">
          <label className="text-sm font-medium">Rol</label>
          <select
            className="h-10 rounded-md border bg-white px-3 text-sm"
            value={newUserRole}
            onChange={(e) => setNewUserRole(e.target.value as UserRole)}
          >
            {roleOptions.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={onAddUser} disabled={isSubmitting}>
          {isSubmitting ? 'Creando...' : 'Agregar usuario'}
        </Button>
      </div>
      {userFormError && <p className="mb-3 text-sm text-red-600">{userFormError}</p>}
      {generatedPasswordMessage && (
        <p className="mb-3 text-sm text-emerald-700">{generatedPasswordMessage}</p>
      )}

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
            {isLoading ? (
              <tr>
                <td className="px-4 py-3" colSpan={6}>
                  Cargando usuarios...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td className="px-4 py-3" colSpan={6}>
                  No se encontraron usuarios.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="border-t">
                  <td className="px-4 py-3">{user.id}</td>
                  <td className="px-4 py-3">{user.name}</td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">{USER_ROLE_LABELS[user.role]}</td>
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
