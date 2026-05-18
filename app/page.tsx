'use client';

import { useEffect, useMemo, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import * as XLSX from 'xlsx';
import { z } from 'zod';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BankStatementManagement } from '@/components/BankStatementManagement';
import { BankAccountManagement } from '@/components/BankAccountManagement';
import { ClientManagement } from '@/components/ClientManagement';
import { RecaudacionManagement } from '@/components/RecaudacionManagement';
import { UserManagement } from '@/components/UserManagement';
import { BankAccount, CartolaMovement, CartolaDocument, Client, CollectionRequest, CobranzaMainDocument } from '@/types';
import { CobranzaManagement } from '@/components/CobranzaManagement';

type UserRole =
  | 'Administrador'
  | 'Contabilidad'
  | 'Recaudación'
  | 'Conciliación medios de pago'
  | 'Agente CC'
  | 'Cobranza';

type ApplicationTab = 'usuarios' | 'cuentas' | 'clientes' | 'cartola' | 'recaudacion' | 'contabilidad' | 'cobranza-credito';

const ROLE_ACCESS: Record<ApplicationTab, UserRole[]> = {
  usuarios: ['Administrador'],
  cuentas: ['Administrador'],
  clientes: ['Administrador', 'Agente CC', 'Recaudación'],
  cartola: ['Contabilidad', 'Recaudación', 'Conciliación medios de pago', 'Cobranza'],
  recaudacion: ['Recaudación', 'Contabilidad'],
  contabilidad: ['Contabilidad'],
  'cobranza-credito': ['Cobranza', 'Agente CC'],
};

const tabLabel: Record<ApplicationTab, string> = {
  cartola: 'Cartola',
  cuentas: 'Cuentas Bancarias',
  clientes: 'Clientes',
  recaudacion: 'Recaudación grupos y charters',
  contabilidad: 'Contabilidad',
  'cobranza-credito': 'Cobranza crédito',
  usuarios: 'Usuarios',
};

export default function HomePage() {
  const { data: session, status, update } = useSession();
  const [activeRole, setActiveRole] = useState<UserRole>('Administrador');
  const [activeTab, setActiveTab] = useState<ApplicationTab | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  
  // Estado global de cuentas bancarias permitidas (Simulado)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([
    { id: 'ACC-1', bankName: 'Banco Estado', accountNumber: '12345678', country: 'Chile' },
    { id: 'ACC-2', bankName: 'BCP', accountNumber: '987654321', country: 'Perú' },
  ]);

  // Lifting movements state to synchronize Cartola and Recaudación
  const [movements, setMovements] = useState<CartolaMovement[]>([]);
  
  // Lifting Clients state
  const [clients, setClients] = useState<Client[]>([
    { id: 'CLI-1', name: 'Viajes Falabella', taxId: '77.123.456-K' },
    { id: 'CLI-2', name: 'Turavion', taxId: '88.987.654-3' },
  ]);

  // Lifting Collection Requests state
  const [requests, setRequests] = useState<CollectionRequest[]>([]);

  // Lifting Cobranza Documents state
  const [cobranzaDocs, setCobranzaDocs] = useState<CobranzaMainDocument[]>([]);

  const handleReconcileFromRecaudacion = (movementId: string, documents: CartolaDocument[]) => {
    setMovements(prev => prev.map(m => 
      m.movementId === movementId ? { 
        ...m, 
        documents, 
        mainIdentification: 'GC',
        mainIdentificationId: 'IDN-GC'
      } : m
    ));
  };

  // Detectar si la autenticación está habilitada desde las variables de entorno
  const isAuthEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true';

  // Crear una sesión ficticia si la autenticación está desactivada
  const effectiveSession = useMemo(() => {
    if (!isAuthEnabled) {
      return {
        user: { name: 'Admin Local', email: 'admin@local.test', role: 'Administrador' as UserRole, mustChangePassword: false },
      };
    }
    return session;
  }, [session, isAuthEnabled]);

  const currentStatus = isAuthEnabled ? status : 'authenticated';

  const canAccessTab = (tab: ApplicationTab): boolean =>
    activeRole === 'Administrador' || ROLE_ACCESS[tab].includes(activeRole);

  useEffect(() => {
    const role = effectiveSession?.user?.role as UserRole | undefined;
    if (role) {
      setActiveRole(role);
    }
  }, [effectiveSession?.user?.role]);

  const onChangeFirstPassword = async () => {
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError('La nueva contraseña debe tener mínimo 8 caracteres.');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordError('Las contraseñas no coinciden.');
      return;
    }
    const response = await fetch('/api/users/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setPasswordError(payload.error ?? 'No se pudo cambiar la contraseña.');
      return;
    }
    await update?.();
    await signOut({ callbackUrl: '/auth/signin' });
  };

  if (currentStatus === 'loading') {
    return <main className="p-6">Cargando sesión...</main>;
  }

  if (currentStatus !== 'authenticated' || !effectiveSession) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Card className="p-6">
          <p className="mb-3 text-sm">Debes iniciar sesión para entrar a SmartyCash.</p>
          <Button onClick={() => (window.location.href = '/auth/signin')}>Ir a iniciar sesión</Button>
        </Card>
      </main>
    );
  }

  const mustChangePassword = Boolean(effectiveSession.user?.mustChangePassword);

  return (
        <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
                <Card className="p-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-bold">SmartyCash</h1>
                            <p className="text-sm text-slate-600">
                                Gestión de cobranza y recaudación con control por roles y seguimiento de
                                cartola.
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="rounded-md border bg-white px-3 py-2 text-sm">
                                <span className="font-medium">Perfil activo:</span> {effectiveSession.user?.name} (
                                {activeRole})
                            </div>
                            <Button variant="outline" onClick={() => signOut({ callbackUrl: '/auth/signin' })}>
                                Cerrar sesión
                            </Button>
                        </div>
                    </div>
                </Card>

                {mustChangePassword ? (
                    <Card className="p-6">
                        <h2 className="mb-3 text-xl font-semibold">Cambio obligatorio de contraseña</h2>
                        <p className="mb-4 text-sm text-slate-600">
                            Debes cambiar tu contraseña temporal antes de usar el aplicativo.
                        </p>
                        <div className="flex max-w-xl flex-col gap-3">
                            <Input
                                type="password"
                                placeholder="Nueva contraseña"
                                value={newPassword}
                                onChange={(event) => setNewPassword(event.target.value)}
                            />
                            <Input
                                type="password"
                                placeholder="Confirmar nueva contraseña"
                                value={newPasswordConfirm}
                                onChange={(event) => setNewPasswordConfirm(event.target.value)}
                            />
                            {passwordError ? <p className="text-sm text-red-600">{passwordError}</p> : null}
                            <Button onClick={onChangeFirstPassword}>Actualizar contraseña</Button>
                        </div>
                    </Card>
                ) : null}

                <Card className="p-6">
                    <Tabs
                        value={activeTab ?? undefined}
                        onValueChange={(nextTab) => setActiveTab((nextTab || null) as ApplicationTab | null)}
                    >
                        <TabsList className="mb-4 h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
                            {(Object.keys(tabLabel) as ApplicationTab[]).map((tab) => (
                                <TabsTrigger
                                    key={tab}
                                    value={tab}
                                    disabled={!canAccessTab(tab) || mustChangePassword}
                                    className="border data-[state=active]:border-slate-400"
                                >
                                    {tabLabel[tab]}
                                </TabsTrigger>
                            ))}
                        </TabsList>

                        <TabsContent value="usuarios" className="space-y-5">
                            {!canAccessTab('usuarios') ? (
                                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                                    Solo Administrador puede gestionar usuarios.
                                </p>
                            ) : (
                                <UserManagement />
                            )}
                        </TabsContent>

                        <TabsContent value="cuentas">
                            <BankAccountManagement 
                                accounts={bankAccounts}
                                onAddAccount={(acc) => setBankAccounts([...bankAccounts, acc])}
                                onDeleteAccount={(id) => setBankAccounts(bankAccounts.filter(a => a.id !== id))}
                            />
                        </TabsContent>

                        <TabsContent value="clientes">
                            <ClientManagement 
                                clients={clients}
                                onAddClient={(c) => setClients([...clients, c])}
                                onDeleteClient={(id) => setClients(clients.filter(c => c.id !== id))}
                            />
                        </TabsContent>

                        <TabsContent value="cartola" className="space-y-5">
                            {!canAccessTab('cartola') ? (
                                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                                    Tu perfil no tiene acceso a Cartola.
                                </p>
                            ) : (
                                <BankStatementManagement 
                                    availableAccounts={bankAccounts} 
                                    movements={movements}
                                    setMovements={setMovements}
                                />
                            )}
                        </TabsContent>

                        <TabsContent value="recaudacion">
                            <RecaudacionManagement 
                                userRole={activeRole}
                                bankAccounts={bankAccounts}
                                clients={clients}
                                movements={movements}
                                requests={requests}
                                setRequests={setRequests}
                                onReconcile={handleReconcileFromRecaudacion}
                            />
                        </TabsContent>

                        <TabsContent value="contabilidad">
                            <Card className="p-4 text-sm text-slate-700">
                                Módulo de Contabilidad listo para conciliaciones y análisis financiero.
                            </Card>
                        </TabsContent>

                        <TabsContent value="cobranza-credito">
                            <CobranzaManagement
                                userRole={activeRole}
                                clients={clients}
                                movements={movements}
                                setMovements={setMovements} // <--- Esta es la línea que faltaba
                                cobranzaDocs={cobranzaDocs}
                                setCobranzaDocs={setCobranzaDocs}
                            />
                        </TabsContent>

                    </Tabs>
                </Card>
            </div>
        </main>
    );
}
