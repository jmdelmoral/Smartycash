'use client';

import { useEffect, useRef, useState } from 'react';

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  /** Si se pasa, agrega una opción "todos" al inicio con value "all". */
  allLabel?: string;
  className?: string;
}

/**
 * Select con búsqueda tipeable, sin dependencias externas. Muestra la etiqueta
 * seleccionada; al enfocar/escribir despliega la lista filtrada por texto. Pensado
 * para reemplazar los <select> de listas largas (clientes, cuentas) donde antes solo
 * se podía seleccionar.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Buscar…',
  allLabel,
  className = '',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const allOptions: SearchableSelectOption[] = allLabel
    ? [{ value: 'all', label: allLabel }, ...options]
    : options;
  const selected = allOptions.find((o) => o.value === value);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q ? allOptions.filter((o) => o.label.toLowerCase().includes(q)) : allOptions;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        className="h-9 w-full rounded-md border bg-white px-2 text-xs"
        value={open ? query : (selected?.label ?? '')}
        placeholder={selected?.label ?? placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-white shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-slate-400">Sin resultados</div>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`block w-full px-2 py-1.5 text-left text-xs hover:bg-slate-100 ${
                  o.value === value ? 'bg-slate-50 font-medium' : ''
                }`}
                onMouseDown={(e) => {
                  // onMouseDown (no onClick) para no perder el foco antes de seleccionar.
                  e.preventDefault();
                  onChange(o.value);
                  setQuery('');
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
