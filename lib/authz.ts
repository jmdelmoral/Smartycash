/**
 * Authorization helpers (role-based).
 *
 * Model confirmed with the business:
 *   - Cartola:     read & write for everyone EXCEPT AgenteCC.
 *   - Cobranza:    read & write for everyone EXCEPT AgenteCC.
 *   - Recaudacion (Grupos y Charters): module access for AgenteCC, Recaudacion
 *     and Administrador. AgenteCC creates/edits requests and their submit button
 *     leaves them as "Preaprobado" (NOT a restricted action). Only Recaudacion
 *     and Administrador may APPROVE or REJECT (see canApproveRecaudacion).
 *   - Clientes / BankAccounts / Usuarios: Administrador only for writes
 *     (enforced directly in those routes).
 *
 * Change the maps below to adjust the matrix in one place.
 */
import type { Session } from 'next-auth';

import type { UserRole } from '@/lib/user-store';

export type BusinessModule =
  | 'Cartola'
  | 'Cobranza'
  | 'Recaudacion'
  | 'Clientes'
  | 'BankAccounts'
  | 'Usuarios';

const ALL_ROLES: readonly UserRole[] = [
  'Administrador',
  'Contabilidad',
  'Recaudacion',
  'ConciliacionMediosDePago',
  'AgenteCC',
  'Cobranza',
];

const ALL_EXCEPT_AGENTE: readonly UserRole[] = ALL_ROLES.filter((r) => r !== 'AgenteCC');

/** Roles allowed to READ each module. */
const READ_ROLES: Record<BusinessModule, readonly UserRole[]> = {
  Cartola: ALL_EXCEPT_AGENTE,
  Cobranza: ALL_EXCEPT_AGENTE,
  Recaudacion: ['Administrador', 'Recaudacion', 'AgenteCC'],
  Clientes: ALL_ROLES,
  BankAccounts: ALL_ROLES,
  Usuarios: ['Administrador'],
};

/** Roles allowed to WRITE (create/edit) in each module. */
const WRITE_ROLES: Record<BusinessModule, readonly UserRole[]> = {
  Cartola: ALL_EXCEPT_AGENTE,
  Cobranza: ALL_EXCEPT_AGENTE,
  Recaudacion: ['Administrador', 'Recaudacion', 'AgenteCC'],
  Clientes: ['Administrador'],
  BankAccounts: ['Administrador'],
  Usuarios: ['Administrador'],
};

/**
 * Roles allowed to APPROVE or REJECT a collection request.
 * AgenteCC is intentionally excluded. "Preaprobado" is NOT restricted: it is
 * the normal result of AgenteCC's submit button, so any role with write access
 * to the module may leave a request as Preaprobado.
 */
const RECAUDACION_APPROVE_ROLES: readonly UserRole[] = ['Administrador', 'Recaudacion'];

/**
 * Estados de solicitud restringidos: solo Recaudacion/Admin pueden fijarlos.
 * Incluye 'InformacionSolicitada' (mandar el caso al AgenteCC pidiendo SWIFT/MT103),
 * ademas de aprobar/rechazar.
 */
export const RECAUDACION_APPROVAL_STATUSES: readonly string[] = [
  'Aprobado',
  'Rechazado',
  'InformacionSolicitada',
];

/** Extract the effective role from a session (credentials or Keycloak). */
export function getSessionRole(session: Session | null): UserRole | undefined {
  const role = session?.user?.role ?? session?.roles?.[0];
  return role as UserRole | undefined;
}

/** True if the session has an authenticated user. */
export function isAuthenticated(session: Session | null): boolean {
  return Boolean(session?.user?.email);
}

function hasRole(session: Session | null, roles: readonly UserRole[]): boolean {
  const role = getSessionRole(session);
  return !!role && roles.includes(role);
}

/** True if the session's role may read the given module. */
export function canRead(session: Session | null, module: BusinessModule): boolean {
  return hasRole(session, READ_ROLES[module]);
}

/** True if the session's role may write (create/edit) in the given module. */
export function canWrite(session: Session | null, module: BusinessModule): boolean {
  return hasRole(session, WRITE_ROLES[module]);
}

/** True if the session's role may approve or reject collection requests. */
export function canApproveRecaudacion(session: Session | null): boolean {
  return hasRole(session, RECAUDACION_APPROVE_ROLES);
}
