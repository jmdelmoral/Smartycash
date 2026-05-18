'use client';

import { signOut } from 'next-auth/react';
import { useEffect } from 'react';

/**
 * Esta página finaliza el proceso de cierre de sesión.
 * Llama a signOut() para limpiar la cookie de sesión local de la aplicación
 * y luego redirige al usuario a la página de inicio.
 */
export default function LoggedOutPage() {
  useEffect(() => {
    // Limpiar la sesión local y redirigir a la página de inicio
    signOut({ redirect: true, callbackUrl: '/' });
  }, []);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Has cerrado sesión</h1>
        <p className="text-muted-foreground">Finalizando y redirigiendo a la página de inicio...</p>
      </div>
    </div>
  );
}
