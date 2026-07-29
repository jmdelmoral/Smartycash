/**
 * Shared query builder for Cartola movement listing/export.
 * Reads filters from URL search params and returns a Prisma `where` plus the
 * pagination settings. Used by both the paginated GET and the export endpoint.
 */
import type { Prisma } from '@/lib/generated/prisma';
import { uiIdentificationToPrisma } from '@/lib/business-mappers';

const VALID_STATUSES = ['Unidentified', 'PartiallyAllocated', 'FullyAllocated'] as const;

export function buildMovementWhere(sp: URLSearchParams): Prisma.CartolaMovementWhereInput {
  // Reversed movements are treated as deleted and never listed.
  const and: Prisma.CartolaMovementWhereInput[] = [{ status: { not: 'Reversed' } }];

  const bank = sp.get('bank');
  if (bank && bank !== 'all') and.push({ bank });

  const account = sp.get('account');
  if (account && account !== 'all') and.push({ bankAccountNumber: account });

  const country = sp.get('country');
  if (country && country !== 'all') and.push({ country });

  const identification = sp.get('identification');
  if (identification && identification !== 'all') {
    and.push({
      identificationType: uiIdentificationToPrisma(
        identification
      ) as Prisma.CartolaMovementWhereInput['identificationType'],
    });
  }

  const status = sp.get('status');
  if (status && (VALID_STATUSES as readonly string[]).includes(status)) {
    and.push({ status: status as Prisma.CartolaMovementWhereInput['status'] });
  }

  const amount = sp.get('amount');
  if (amount && !Number.isNaN(Number(amount))) {
    and.push({ amount: Number(amount) });
  } else {
    const amountMin = sp.get('amountMin');
    const amountMax = sp.get('amountMax');
    const gte = amountMin && !Number.isNaN(Number(amountMin)) ? Number(amountMin) : undefined;
    const lte = amountMax && !Number.isNaN(Number(amountMax)) ? Number(amountMax) : undefined;
    if (gte !== undefined || lte !== undefined) {
      and.push({ amount: { ...(gte !== undefined ? { gte } : {}), ...(lte !== undefined ? { lte } : {}) } });
    }
  }

  const dateFrom = sp.get('dateFrom');
  const dateTo = sp.get('dateTo');
  if (dateFrom || dateTo) {
    const gte = dateFrom ? new Date(`${dateFrom}T00:00:00.000Z`) : undefined;
    const lte = dateTo ? new Date(`${dateTo}T23:59:59.999Z`) : undefined;
    and.push({ date: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } });
  }

  const search = sp.get('search')?.trim();
  if (search) {
    and.push({
      OR: [
        { description: { contains: search } },
        { bank: { contains: search } },
        { bankAccountNumber: { contains: search } },
        { allocations: { some: { saleReference: { reference: { contains: search } } } } },
      ],
    });
  }

  return { AND: and };
}

export function parsePagination(sp: URLSearchParams): {
  paginate: boolean;
  page: number;
  pageSize: number | undefined;
} {
  const rawSize = sp.get('pageSize');
  const paginate = rawSize !== null;
  const pageSize = paginate
    ? Math.min(Math.max(parseInt(rawSize ?? '20', 10) || 20, 1), 200)
    : undefined;
  const page = Math.max(parseInt(sp.get('page') ?? '1', 10) || 1, 1);
  return { paginate, page, pageSize };
}
