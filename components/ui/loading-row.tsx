import { cn } from '@/lib/utils';

/**
 * Spinner reutilizable (mismo estilo que usa Cartola) para indicar carga en curso.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600',
        className
      )}
    />
  );
}

/**
 * Fila de tabla que ocupa todo el ancho con un spinner + texto de carga.
 * Se usa transversalmente en los módulos (Recaudación, Cobranza, Clientes,
 * Cuentas, Usuarios, Contabilidad) mientras se consultan las APIs, para que el
 * indicador de "cargando" sea consistente en toda la aplicación.
 */
export function TableLoadingRow({
  colSpan,
  label = 'Cargando…',
}: {
  colSpan: number;
  label?: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-12 text-center text-slate-500">
        <span className="inline-flex items-center gap-2">
          <Spinner />
          {label}
        </span>
      </td>
    </tr>
  );
}
