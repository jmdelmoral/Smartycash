'use client';

import { signOut, useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { z } from 'zod';

import { AdquirienteManagement } from '@/components/AdquirienteManagement';
import { BankAccountManagement } from '@/components/BankAccountManagement';
import { BankStatementManagement } from '@/components/BankStatementManagement';
import { ClientManagement } from '@/components/ClientManagement';
import { CobranzaManagement } from '@/components/CobranzaManagement';
import { ContabilidadManagement } from '@/components/ContabilidadManagement';
import { RecaudacionManagement } from '@/components/RecaudacionManagement';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserManagement } from '@/components/UserManagement';
import {
  Adquiriente,
  BankAccount,
  CartolaDocument,
  Client,
  CollectionRequest,
  CobranzaMainDocument,
} from '@/types';

type UserRole =
  | 'Administrador'
  | 'Contabilidad'
  | 'Recaudacion'
  | 'ConciliacionMediosDePago'
  | 'AgenteCC'
  | 'Cobranza';

type ApplicationTab =
  | 'usuarios'
  | 'cuentas'
  | 'clientes'
  | 'adquirientes'
  | 'cartola'
  | 'recaudacion'
  | 'contabilidad'
  | 'cobranza-credito';

const ROLE_ACCESS: Record<ApplicationTab, UserRole[]> = {
  usuarios: ['Administrador'],
  cuentas: [
    'Administrador',
    'Recaudacion',
    'Cobranza',
    'Contabilidad',
    'ConciliacionMediosDePago',
    'AgenteCC',
  ],
  clientes: [
    'Administrador',
    'AgenteCC',
    'Recaudacion',
    'Cobranza',
    'Contabilidad',
    'ConciliacionMediosDePago',
  ],
  adquirientes: ['Administrador', 'ConciliacionMediosDePago'],
  cartola: ['Contabilidad', 'Recaudacion', 'ConciliacionMediosDePago', 'Cobranza'],
  recaudacion: ['Recaudacion', 'AgenteCC', 'Cobranza'],
  contabilidad: ['Contabilidad'],
  'cobranza-credito': ['Cobranza', 'Recaudacion'],
};

const tabLabel: Record<ApplicationTab, string> = {
  cartola: 'Cartola',
  cuentas: 'Cuentas Bancarias',
  clientes: 'Clientes',
  adquirientes: 'Adquirientes',
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
  const [masterDataError, setMasterDataError] = useState<string | null>(null);
  const [businessLoading, setBusinessLoading] = useState(true);
  const businessDataLoadedRef = useRef(false);
  // Baseline of IDs the client has loaded, per module. Sent as knownIds so the
  // server only reverses/annuls records this client actually knew about.
  const knownRequestIdsRef = useRef<Set<string>>(new Set());
  const knownDocIdsRef = useRef<Set<string>>(new Set());
  // Sincronización de Recaudación (guarda solicitudes y, del lado servidor,
  // reconcilia atómicamente el movimiento asociado).
  const recaudacionSyncInFlightRef = useRef(false);
  const recaudacionSyncDirtyRef = useRef(false);
  const suppressRecaudacionSyncRef = useRef(false);

  // Estado global de cuentas bancarias permitidas (Simulado)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  // Fase 5 (D 3c): Cartola ya NO usa un array compartido en page.tsx. Cada módulo se
  // autoabastece por endpoint (Cartola lee su página y persiste por registro;
  // Cobranza aplica/reversa pagos por endpoint). Se eliminó el estado `movements` y
  // el `syncCartola` para no "pisar" las asignaciones creadas server-side.

  // Lifting Clients state
  const [clients, setClients] = useState<Client[]>([]);
  const [adquirientes, setAdquirientes] = useState<Adquiriente[]>([]);
  /*
    { id: 'CLI-2', name: 'Turavion', taxId: '88.987.654-3' },

  // Lifting Collection Requests state
  */
  const [requests, setRequests] = useState<CollectionRequest[]>([]);
  const requestsRef = useRef<CollectionRequest[]>(requests);
  requestsRef.current = requests;

  // Lifting Cobranza Documents state
  const [cobranzaDocs, setCobranzaDocs] = useState<CobranzaMainDocument[]>([]);

  // La reconciliación del movimiento de cartola ahora la hace el SERVIDOR de forma
  // atómica junto con la solicitud (ver PUT /api/recaudacion/requests). El cliente
  // ya no muta el movimiento aquí: así nunca queda identificado sin una solicitud
  // efectivamente guardada. El movimiento se refresca tras sincronizar recaudación.
  const handleReconcileFromRecaudacion = (_movementId: string, _documents: CartolaDocument[]) => {
    /* no-op intencional: reconciliación server-side y atómica */
  };

  // Detectar si la autenticación está habilitada desde las variables de entorno
  const isAuthEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true';

  // Crear una sesión ficticia si la autenticación está desactivada
  const effectiveSession = useMemo(() => {
    if (!isAuthEnabled) {
      return {
        user: {
          name: 'Admin Local',
          email: 'admin@local.test',
          role: 'Administrador' as UserRole,
          mustChangePassword: false,
        },
      };
    }
    return session;
  }, [session, isAuthEnabled]);

  const currentStatus = isAuthEnabled ? status : 'authenticated';

  const canAccessTab = (tab: ApplicationTab): boolean =>
    activeRole === 'Administrador' || ROLE_ACCESS[tab].includes(activeRole);

  const activeBankAccounts = useMemo(
    () => bankAccounts.filter((account) => account.isActive !== false),
    [bankAccounts]
  );

  const activeClients = useMemo(
    () => clients.filter((client) => client.isActive !== false),
    [clients]
  );

  useEffect(() => {
    const role = effectiveSession?.user?.role as UserRole | undefined;
    if (role) {
      setActiveRole(role);
    }
  }, [effectiveSession?.user?.role]);

  useEffect(() => {
    // Nota: en modo SIN login (AUTH_ENABLED=false) también cargamos datos maestros.
    // El servidor entrega una sesión de desarrollo (getAppSession) para el rol
    // Administrador, así que las llamadas funcionan y `businessLoading` se resuelve
    // (antes quedaba en true y la tabla de Cartola se quedaba "Cargando…" para siempre).
    if (currentStatus !== 'authenticated') return;

    const loadMasterData = async () => {
      setMasterDataError(null);
      setBusinessLoading(true);
      try {
        const [
          bankAccountsResponse,
          clientsResponse,
          adquirientesResponse,
          requestsResponse,
          cobranzaResponse,
        ] = await Promise.all([
          fetch('/api/bank-accounts'),
          fetch('/api/clients'),
          fetch('/api/adquirientes'),
          fetch('/api/recaudacion/requests'),
          fetch('/api/cobranza/documents'),
        ]);

        if (
          !bankAccountsResponse.ok ||
          !clientsResponse.ok ||
          !adquirientesResponse.ok ||
          !requestsResponse.ok ||
          !cobranzaResponse.ok
        ) {
          throw new Error('No fue posible cargar datos desde la base.');
        }

        const bankAccountsPayload = (await bankAccountsResponse.json()) as {
          accounts: BankAccount[];
        };
        const clientsPayload = (await clientsResponse.json()) as { clients: Client[] };
        const adquirientesPayload = (await adquirientesResponse.json()) as {
          adquirientes: Adquiriente[];
        };
        const requestsPayload = (await requestsResponse.json()) as {
          requests: CollectionRequest[];
        };
        const cobranzaPayload = (await cobranzaResponse.json()) as {
          documents: CobranzaMainDocument[];
        };

        setBankAccounts(bankAccountsPayload.accounts);
        setClients(clientsPayload.clients);
        setAdquirientes(adquirientesPayload.adquirientes);
        setRequests(requestsPayload.requests);
        setCobranzaDocs(cobranzaPayload.documents);
        knownRequestIdsRef.current = new Set(requestsPayload.requests.map((r) => r.id));
        knownDocIdsRef.current = new Set(cobranzaPayload.documents.map((d) => d.id));
        businessDataLoadedRef.current = true;
      } catch (error) {
        setMasterDataError(
          error instanceof Error ? error.message : 'No fue posible cargar datos maestros.'
        );
      } finally {
        setBusinessLoading(false);
      }
    };

    loadMasterData();
  }, [currentStatus, isAuthEnabled]);

  const handleAddBankAccount = async (account: BankAccount) => {
    const response = await fetch('/api/bank-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(account),
    });
    const payload = (await response.json()) as { account?: BankAccount; error?: string };
    if (!response.ok || !payload.account) {
      setMasterDataError(payload.error ?? 'No se pudo registrar la cuenta bancaria.');
      return;
    }
    setBankAccounts((prev) => [payload.account!, ...prev]);
  };

  const handleDeactivateBankAccount = async (id: string) => {
    const response = await fetch('/api/bank-accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive: false }),
    });
    const payload = (await response.json()) as { account?: BankAccount; error?: string };
    if (!response.ok || !payload.account) {
      setMasterDataError(payload.error ?? 'No se pudo desactivar la cuenta bancaria.');
      return;
    }
    setBankAccounts((prev) =>
      prev.map((account) => (account.id === id ? payload.account! : account))
    );
  };

  const handleUpdateBankAccount = async (account: BankAccount) => {
    const response = await fetch('/api/bank-accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(account),
    });
    const payload = (await response.json()) as { account?: BankAccount; error?: string };
    if (!response.ok || !payload.account) {
      setMasterDataError(payload.error ?? 'No se pudo modificar la cuenta bancaria.');
      return;
    }
    setBankAccounts((prev) =>
      prev.map((current) => (current.id === account.id ? payload.account! : current))
    );
  };

  const handleAddClient = async (client: Client) => {
    const response = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(client),
    });
    const payload = (await response.json()) as { client?: Client; error?: string };
    if (!response.ok || !payload.client) {
      setMasterDataError(payload.error ?? 'No se pudo registrar el cliente.');
      return;
    }
    setClients((prev) => [payload.client!, ...prev]);
  };

  const handleDeactivateClient = async (id: string) => {
    const response = await fetch('/api/clients', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive: false }),
    });
    const payload = (await response.json()) as { client?: Client; error?: string };
    if (!response.ok || !payload.client) {
      setMasterDataError(payload.error ?? 'No se pudo desactivar el cliente.');
      return;
    }
    setClients((prev) => prev.map((client) => (client.id === id ? payload.client! : client)));
  };

  const handleUpdateClient = async (client: Client) => {
    const response = await fetch('/api/clients', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(client),
    });
    const payload = (await response.json()) as { client?: Client; error?: string };
    if (!response.ok || !payload.client) {
      setMasterDataError(payload.error ?? 'No se pudo modificar el cliente.');
      return;
    }
    setClients((prev) =>
      prev.map((current) => (current.id === client.id ? payload.client! : current))
    );
  };

  // #9 Validar cliente (Recaudación/Cobranza/Admin): marca "Validado". Los códigos
  // Navitaire/BP SAP se completan antes con "Modificar" si hacen falta.
  const handleValidateClient = async (id: string) => {
    const response = await fetch('/api/clients', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, validationStatus: 'Validado' }),
    });
    const payload = (await response.json()) as { client?: Client; error?: string };
    if (!response.ok || !payload.client) {
      setMasterDataError(payload.error ?? 'No se pudo validar el cliente.');
      return;
    }
    setClients((prev) => prev.map((current) => (current.id === id ? payload.client! : current)));
  };

  // ---- Adquirientes (Conciliación medios de pago) ----
  const handleAddAdquiriente = async (adquiriente: Adquiriente) => {
    const response = await fetch('/api/adquirientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adquiriente),
    });
    const payload = (await response.json()) as { adquiriente?: Adquiriente; error?: string };
    if (!response.ok || !payload.adquiriente) {
      setMasterDataError(payload.error ?? 'No se pudo crear el adquiriente.');
      return;
    }
    setAdquirientes((prev) => [payload.adquiriente!, ...prev]);
  };

  const handleUpdateAdquiriente = async (adquiriente: Adquiriente) => {
    const response = await fetch('/api/adquirientes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adquiriente),
    });
    const payload = (await response.json()) as { adquiriente?: Adquiriente; error?: string };
    if (!response.ok || !payload.adquiriente) {
      setMasterDataError(payload.error ?? 'No se pudo modificar el adquiriente.');
      return;
    }
    setAdquirientes((prev) =>
      prev.map((current) => (current.id === adquiriente.id ? payload.adquiriente! : current))
    );
  };

  const handleDeactivateAdquiriente = async (id: string) => {
    const response = await fetch('/api/adquirientes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive: false }),
    });
    const payload = (await response.json()) as { adquiriente?: Adquiriente; error?: string };
    if (!response.ok || !payload.adquiriente) {
      setMasterDataError(payload.error ?? 'No se pudo desactivar el adquiriente.');
      return;
    }
    setAdquirientes((prev) => prev.map((current) => (current.id === id ? payload.adquiriente! : current)));
  };

  const syncRecaudacion = useCallback(async (payload: CollectionRequest[]) => {
    const ids = payload.map((r) => r.id);
    if (ids.length === 0) return;
    if (recaudacionSyncInFlightRef.current) {
      recaudacionSyncDirtyRef.current = true;
      return;
    }
    recaudacionSyncInFlightRef.current = true;
    try {
      const res = await fetch('/api/recaudacion/requests', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: payload, knownIds: Array.from(knownRequestIdsRef.current) }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setMasterDataError(
          `Sincronización de Recaudación: ${data.error ?? 'no fue posible guardar.'} Tus últimos cambios NO se guardaron.`
        );
        return;
      }
      knownRequestIdsRef.current = new Set(ids);
      setMasterDataError((prev) =>
        prev && prev.startsWith('Sincronización de Recaudación:') ? null : prev
      );
      // La reconciliación del movimiento asociado la hace el servidor de forma
      // atómica en el PUT. Recaudación muestra el vínculo con los campos
      // denormalizados (associatedMovementDisplayId/Bank) que ya trae la solicitud,
      // así que ya no necesitamos refrescar el array de Cartola aquí.
    } catch {
      setMasterDataError('Sincronización de Recaudación: error de red. Tus últimos cambios NO se guardaron.');
    } finally {
      recaudacionSyncInFlightRef.current = false;
      if (recaudacionSyncDirtyRef.current) {
        recaudacionSyncDirtyRef.current = false;
        void syncRecaudacion(requestsRef.current);
      }
    }
  }, []);

  useEffect(() => {
    if (!businessDataLoadedRef.current || currentStatus !== 'authenticated') return;
    if (suppressRecaudacionSyncRef.current) {
      suppressRecaudacionSyncRef.current = false;
      return;
    }
    const timeout = window.setTimeout(() => {
      void syncRecaudacion(requestsRef.current);
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [currentStatus, requests, syncRecaudacion]);

  useEffect(() => {
    if (!businessDataLoadedRef.current || currentStatus !== 'authenticated') return;
    const timeout = window.setTimeout(() => {
      const ids = cobranzaDocs.map((d) => d.id);
      if (ids.length === 0) return;
      void (async () => {
        try {
          const res = await fetch('/api/cobranza/documents', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              documents: cobranzaDocs,
              knownIds: Array.from(knownDocIdsRef.current),
            }),
          });
          if (res.ok) {
            knownDocIdsRef.current = new Set(ids);
            setMasterDataError((prev) =>
              prev && prev.startsWith('Sincronización de Cobranza:') ? null : prev
            );
          } else {
            const data = (await res.json().catch(() => ({}))) as { error?: string };
            setMasterDataError(
              `Sincronización de Cobranza: ${data.error ?? 'no fue posible guardar.'} Tus últimos cambios NO se guardaron.`
            );
          }
        } catch {
          setMasterDataError(
            'Sincronización de Cobranza: error de red. Tus últimos cambios NO se guardaron.'
          );
        }
      })();
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [cobranzaDocs, currentStatus]);

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
          <Button onClick={() => (window.location.href = '/auth/signin')}>
            Ir a iniciar sesión
          </Button>
        </Card>
      </main>
    );
  }

  const realRole = effectiveSession?.user?.role as UserRole | undefined;
  const appEnv = (process.env.NEXT_PUBLIC_APP_ENV ?? 'test').toLowerCase();
  const isProdEnv = appEnv === 'prod' || appEnv === 'production' || appEnv === 'produccion';
  const viewRoleOptions: UserRole[] = [
    'Administrador',
    'Contabilidad',
    'Recaudacion',
    'ConciliacionMediosDePago',
    'AgenteCC',
    'Cobranza',
  ];
  const tabOrderForRole: ApplicationTab[] = [
    'cartola',
    'recaudacion',
    'cobranza-credito',
    'contabilidad',
    'clientes',
    'adquirientes',
    'cuentas',
    'usuarios',
  ];
  // Solo el Administrador puede "ver como" otro rol (previsualización de vistas;
  // el servidor sigue validando permisos por el rol real de sesión).
  const onChangeViewRole = (role: UserRole) => {
    setActiveRole(role);
    const first =
      tabOrderForRole.find((t) => role === 'Administrador' || ROLE_ACCESS[t].includes(role)) ?? null;
    setActiveTab(first);
  };

  const mustChangePassword = Boolean(effectiveSession.user?.mustChangePassword);

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-3xl font-bold">SmartyCash</h1>
                <p className="text-sm text-slate-600">
                  Gestión de cobranza y recaudación con control por roles y seguimiento de cartola.
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${isProdEnv ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-amber-100 text-amber-800 border border-amber-300'}`}
                title="Entorno de la base de datos configurada"
              >
                {isProdEnv ? 'PRODUCCIÓN' : 'PRUEBA'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {realRole === 'Administrador' && (
                <div className="flex flex-col">
                  <label className="text-[10px] font-medium text-slate-400">Ver como</label>
                  <select
                    className="h-9 rounded-md border bg-white px-2 text-sm"
                    value={activeRole}
                    onChange={(e) => onChangeViewRole(e.target.value as UserRole)}
                    title="Previsualiza la app como otro rol (solo vista)"
                  >
                    {viewRoleOptions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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

        {masterDataError ? (
          <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {masterDataError}
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
                onAddAccount={handleAddBankAccount}
                onUpdateAccount={handleUpdateBankAccount}
                onDeleteAccount={handleDeactivateBankAccount}
                userRole={activeRole}
                loading={businessLoading}
              />
            </TabsContent>

            <TabsContent value="clientes">
              <ClientManagement
                clients={clients}
                onAddClient={handleAddClient}
                onUpdateClient={handleUpdateClient}
                onDeleteClient={handleDeactivateClient}
                onValidateClient={handleValidateClient}
                onClientsBulkLoaded={setClients}
                userRole={activeRole}
                currentUserId={session?.user?.id}
                loading={businessLoading}
              />
            </TabsContent>

            <TabsContent value="adquirientes">
              <AdquirienteManagement
                adquirientes={adquirientes}
                onAddAdquiriente={handleAddAdquiriente}
                onUpdateAdquiriente={handleUpdateAdquiriente}
                onDeleteAdquiriente={handleDeactivateAdquiriente}
                onAdquirientesBulkLoaded={setAdquirientes}
                userRole={activeRole}
                loading={businessLoading}
              />
            </TabsContent>

            <TabsContent value="cartola" className="space-y-5">
              {!canAccessTab('cartola') ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                  Tu perfil no tiene acceso a Cartola.
                </p>
              ) : (
                <BankStatementManagement
                  availableAccounts={activeBankAccounts}
                  clients={activeClients}
                  adquirientes={adquirientes}
                  loading={businessLoading}
                />
              )}
            </TabsContent>

            <TabsContent value="recaudacion">
              <RecaudacionManagement
                userRole={activeRole}
                bankAccounts={activeBankAccounts}
                clients={activeClients}
                requests={requests}
                setRequests={setRequests}
                onReconcile={handleReconcileFromRecaudacion}
                loading={businessLoading}
              />
            </TabsContent>

            <TabsContent value="contabilidad">
              {!canAccessTab('contabilidad') ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                  Tu perfil no tiene acceso a Contabilidad.
                </p>
              ) : (
                <ContabilidadManagement />
              )}
            </TabsContent>

            <TabsContent value="cobranza-credito">
              <CobranzaManagement
                userRole={activeRole}
                clients={activeClients}
                cobranzaDocs={cobranzaDocs}
                setCobranzaDocs={setCobranzaDocs}
                loading={businessLoading}
              />
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </main>
  );
}
