'use client';

import { signOut, useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { z } from 'zod';

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
  BankAccount,
  CartolaMovement,
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
  | 'cartola'
  | 'recaudacion'
  | 'contabilidad'
  | 'cobranza-credito';

const ROLE_ACCESS: Record<ApplicationTab, UserRole[]> = {
  usuarios: ['Administrador'],
  cuentas: ['Administrador', 'Recaudacion', 'Cobranza'],
  clientes: ['Administrador', 'AgenteCC', 'Recaudacion'],
  cartola: ['Contabilidad', 'Recaudacion', 'ConciliacionMediosDePago', 'Cobranza'],
  recaudacion: ['Recaudacion', 'Contabilidad', 'AgenteCC', 'Cobranza'],
  contabilidad: ['Contabilidad'],
  'cobranza-credito': ['Cobranza'],
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
  const [masterDataError, setMasterDataError] = useState<string | null>(null);
  const [businessLoading, setBusinessLoading] = useState(true);
  const businessDataLoadedRef = useRef(false);
  // Baseline of IDs the client has loaded, per module. Sent as knownIds so the
  // server only reverses/annuls records this client actually knew about.
  const knownMovementIdsRef = useRef<Set<string>>(new Set());
  const knownRequestIdsRef = useRef<Set<string>>(new Set());
  const knownDocIdsRef = useRef<Set<string>>(new Set());
  // Sincronización de Cartola: evita POSTs solapados (que colisionarían en el
  // displayId único) y reintenta si llegaron cambios mientras había uno en vuelo.
  const cartolaSyncInFlightRef = useRef(false);
  const cartolaSyncDirtyRef = useRef(false);
  // Cuando refrescamos movimientos desde el servidor tras un guardado, saltamos
  // UNA re-sincronización para no crear un bucle sync -> refetch -> sync.
  const suppressCartolaSyncRef = useRef(false);
  // Igual para la sincronización de Recaudación (guarda solicitudes y, del lado
  // servidor, reconcilia atómicamente el movimiento asociado).
  const recaudacionSyncInFlightRef = useRef(false);
  const recaudacionSyncDirtyRef = useRef(false);
  const suppressRecaudacionSyncRef = useRef(false);

  // Estado global de cuentas bancarias permitidas (Simulado)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  /*
    { id: 'ACC-2', bankName: 'BCP', accountNumber: '987654321', country: 'Perú' },

  // Lifting movements state to synchronize Cartola and Recaudación
  */
  const [movements, setMovements] = useState<CartolaMovement[]>([]);
  // Referencia siempre actualizada de los movimientos (para el re-sync diferido).
  const movementsRef = useRef<CartolaMovement[]>(movements);
  movementsRef.current = movements;

  // Lifting Clients state
  const [clients, setClients] = useState<Client[]>([]);
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
    if (currentStatus !== 'authenticated' || !isAuthEnabled) return;

    const loadMasterData = async () => {
      setMasterDataError(null);
      setBusinessLoading(true);
      try {
        const [
          bankAccountsResponse,
          clientsResponse,
          movementsResponse,
          requestsResponse,
          cobranzaResponse,
        ] = await Promise.all([
          fetch('/api/bank-accounts'),
          fetch('/api/clients'),
          fetch('/api/cartola/movements'),
          fetch('/api/recaudacion/requests'),
          fetch('/api/cobranza/documents'),
        ]);

        if (
          !bankAccountsResponse.ok ||
          !clientsResponse.ok ||
          !movementsResponse.ok ||
          !requestsResponse.ok ||
          !cobranzaResponse.ok
        ) {
          throw new Error('No fue posible cargar datos desde la base.');
        }

        const bankAccountsPayload = (await bankAccountsResponse.json()) as {
          accounts: BankAccount[];
        };
        const clientsPayload = (await clientsResponse.json()) as { clients: Client[] };
        const movementsPayload = (await movementsResponse.json()) as {
          movements: CartolaMovement[];
        };
        const requestsPayload = (await requestsResponse.json()) as {
          requests: CollectionRequest[];
        };
        const cobranzaPayload = (await cobranzaResponse.json()) as {
          documents: CobranzaMainDocument[];
        };

        setBankAccounts(bankAccountsPayload.accounts);
        setClients(clientsPayload.clients);
        setMovements(movementsPayload.movements);
        setRequests(requestsPayload.requests);
        setCobranzaDocs(cobranzaPayload.documents);
        knownMovementIdsRef.current = new Set(
          movementsPayload.movements.map((m) => m.movementId)
        );
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

  const syncCartola = useCallback(async (payload: CartolaMovement[]) => {
    if (payload.length === 0) return;
    // Un solo POST en vuelo a la vez: dos concurrentes podrían calcular el
    // mismo correlativo de displayId y colisionar en la restricción única.
    if (cartolaSyncInFlightRef.current) {
      cartolaSyncDirtyRef.current = true;
      return;
    }
    cartolaSyncInFlightRef.current = true;
    try {
      // Upsert NO destructivo de los movimientos en memoria. Las reversiones
      // (eliminar) se manejan aparte con DELETE desde la vista de Cartola.
      const res = await fetch('/api/cartola/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movements: payload }),
      });
      // IMPORTANTE: fetch NO lanza en respuestas 4xx/5xx, así que hay que
      // revisar res.ok explícitamente. Antes esto se ignoraba y los cambios
      // rechazados por el servidor se perdían en silencio al recargar.
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setMasterDataError(
          `Sincronización de Cartola: ${data.error ?? 'no fue posible guardar.'} Tus últimos cambios NO se guardaron; corrige e inténtalo de nuevo antes de recargar.`
        );
      } else {
        // Limpia solo un error PREVIO de sincronización de Cartola (no toca
        // errores de otros módulos que comparten este estado).
        setMasterDataError((prev) =>
          prev && prev.startsWith('Sincronización de Cartola:') ? null : prev
        );
        // Refresca desde el servidor para reflejar campos calculados por el
        // backend (código visible displayId, estado). Evita tener que recargar
        // la página a mano para ver el CL-BAN-...
        try {
          const refetch = await fetch('/api/cartola/movements', { cache: 'no-store' });
          if (refetch.ok) {
            const fresh = (await refetch.json()) as { movements: CartolaMovement[] };
            suppressCartolaSyncRef.current = true;
            knownMovementIdsRef.current = new Set(
              (fresh.movements ?? []).map((m) => m.movementId)
            );
            setMovements(fresh.movements ?? []);
          }
        } catch {
          /* refresh best-effort: si falla, los datos locales siguen visibles */
        }
      }
    } catch {
      setMasterDataError(
        'Sincronización de Cartola: error de red. Tus últimos cambios NO se guardaron; no recargues hasta reintentar.'
      );
    } finally {
      cartolaSyncInFlightRef.current = false;
      // Si llegaron cambios mientras había un POST en vuelo, re-sincroniza el
      // estado más reciente para no perderlos.
      if (cartolaSyncDirtyRef.current) {
        cartolaSyncDirtyRef.current = false;
        void syncCartola(movementsRef.current);
      }
    }
  }, []);

  useEffect(() => {
    if (!businessDataLoadedRef.current || currentStatus !== 'authenticated') return;
    // Este cambio de `movements` vino de un refetch post-guardado: no re-sincronizar.
    if (suppressCartolaSyncRef.current) {
      suppressCartolaSyncRef.current = false;
      return;
    }
    const timeout = window.setTimeout(() => {
      void syncCartola(movementsRef.current);
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [currentStatus, movements, syncCartola]);

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
      // Refresca SOLO los movimientos desde el servidor para reflejar la
      // reconciliación atómica (identificar/liberar). NO refrescamos las
      // solicitudes: su estado lo maneja el cliente y ya se persistió con el PUT;
      // refrescarlas pisaría cambios optimistas aún no sincronizados (causaba que
      // una solicitud recién validada "volviera" a Pendiente/Preaprobado).
      try {
        const movRes = await fetch('/api/cartola/movements', { cache: 'no-store' });
        if (movRes.ok) {
          const fresh = (await movRes.json()) as { movements: CartolaMovement[] };
          suppressCartolaSyncRef.current = true;
          knownMovementIdsRef.current = new Set((fresh.movements ?? []).map((m) => m.movementId));
          setMovements(fresh.movements ?? []);
        }
      } catch {
        /* refresh best-effort */
      }
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
              />
            </TabsContent>

            <TabsContent value="clientes">
              <ClientManagement
                clients={clients}
                onAddClient={handleAddClient}
                onUpdateClient={handleUpdateClient}
                onDeleteClient={handleDeactivateClient}
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
                  movements={movements}
                  setMovements={setMovements}
                  loading={businessLoading}
                />
              )}
            </TabsContent>

            <TabsContent value="recaudacion">
              <RecaudacionManagement
                userRole={activeRole}
                bankAccounts={activeBankAccounts}
                clients={activeClients}
                movements={movements}
                setMovements={setMovements}
                requests={requests}
                setRequests={setRequests}
                onReconcile={handleReconcileFromRecaudacion}
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
