import { AlertTriangle, ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

const errorMessages = {
  Configuration: 'Hay un problema con la configuración del servidor.',
  AccessDenied: 'Acceso denegado. No tienes permisos para acceder.',
  Verification: 'El token ha expirado o ya fue usado.',
  Default: 'Ha ocurrido un error durante la autenticación.',
  OAuthSignin: 'Error al conectar con el proveedor de autenticación.',
  OAuthCallback: 'Error en el callback de autenticación.',
  OAuthCreateAccount: 'No se pudo crear la cuenta.',
  EmailCreateAccount: 'No se pudo crear la cuenta con este email.',
  Callback: 'Error en el callback de autenticación.',
  OAuthAccountNotLinked: 'Esta cuenta ya está asociada con otro proveedor.',
  EmailSignin: 'No se pudo enviar el email de verificación.',
  CredentialsSignin: 'Credenciales incorrectas.',
  SessionRequired: 'Debes iniciar sesión para acceder a esta página.',
};

type AuthErrorPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const resolvedSearchParams = await searchParams;
  const rawError = resolvedSearchParams.error;
  const errorCode = Array.isArray(rawError) ? rawError[0] : rawError;
  const error = errorCode as keyof typeof errorMessages | undefined;
  const errorMessage = error
    ? errorMessages[error] || errorMessages.Default
    : errorMessages.Default;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header Section */}
          <div className="bg-gradient-to-r from-[#153e69] to-[#a62733] p-6 text-white text-center">
            <div className="mb-4">
              <Image
                src="/logo-limitless-white.png"
                alt="Limitless Logo"
                width={150}
                height={45}
                className="w-auto h-8 mx-auto mb-2"
              />
            </div>
            <p className="text-white/90 text-sm">Powered by Limitless • JetSMART</p>
          </div>

          {/* Content Section */}
          <div className="p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h1 className="text-xl font-semibold text-gray-900 mb-2">Error de Autenticación</h1>
              <p className="text-gray-600 text-sm">{errorMessage}</p>
            </div>

            {/* Error Details */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm text-red-800">
                  <strong>Código de error:</strong> {error}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3">
              <Button
                asChild
                className="w-full bg-gradient-to-r from-[#a62733] to-[#8a1f2a] hover:from-[#8a1f2a] hover:to-[#6d1520] text-white py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
                size="lg"
              >
                <Link href="/auth/signin">Intentar de Nuevo</Link>
              </Button>

              <Button
                asChild
                variant="outline"
                className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 py-3 rounded-xl"
                size="lg"
              >
                <Link href="/">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Volver al Inicio
                </Link>
              </Button>
            </div>

            {/* Footer */}
            <div className="mt-6 text-center">
              <p className="text-xs text-gray-500">
                Si el problema persiste, contacta al administrador del sistema.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
