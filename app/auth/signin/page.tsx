'use client';

import { Lock, Shield } from 'lucide-react';
import Image from 'next/image';
import { signIn } from 'next-auth/react';
import { useState } from 'react';

import packageInfo from '../../../package.json';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const { name, version } = packageInfo;

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCredentialsSignIn = async () => {
    setErrorMessage(null);
    const response = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });
    if (response?.error) {
      setErrorMessage(response.error || 'Credenciales inválidas o usuario inactivo.');
      return;
    }
    window.location.href = '/';
  };

  const keycloakAvailable =
    !!process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER &&
    !process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER.includes('tu-servidor-keycloak');

  const handleKeycloakSignIn = () => {
    signIn('keycloak', {
      callbackUrl: '/',
      redirect: true,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header Section - Con degradado diagonal más oscuro */}
          <div className="bg-gradient-to-tl from-slate-500 via-slate-400 to-slate-100 p-6 text-center relative overflow-hidden">
            <div className="relative z-10">
              <div className="mb-4">
                <Image
                  src="/logo-limitless-sf.png"
                  alt="Limitless Logo"
                  width={150}
                  height={45}
                  className="w-auto h-8 mx-auto mb-2 brightness-0 invert"
                />
              </div>
              <div className={`inline-flex items-center justify-center mb-2 text-white`}>
                <div className="flex flex-col">
                  <span className="text-xl sm:text-2xl md:text-3xl font-bold text-[#153e69] leading-tight tracking-tight">
                    {name}
                  </span>
                  <span className="text-sm sm:text-base text-blue-500 font-medium tracking-wider">
                    v {version}
                  </span>
                </div>
              </div>
              <p className="text-white/90 text-sm font-medium">
                Powered by <span className="text-white font-semibold">Limitless</span> •{' '}
                <span className="text-white font-semibold">JetSMART</span>
              </p>
            </div>
            {/* Overlay gradient para más profundidad */}
            <div className="absolute inset-0 bg-gradient-to-tl from-black/20 via-transparent to-transparent"></div>
          </div>

          {/* Content Section */}
          <div className="p-6">
            <div className="text-center mb-6">
              <h1 className="text-xl font-semibold text-blue-900 mb-2">Acceso Seguro Requerido</h1>
              <p className="text-blue-500 text-sm">
                Para acceder a SMARTGPT, debes autenticarte con tu cuenta de JetSMART
              </p>
            </div>

            {/* Security Info */}
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-3 mb-2">
                <Shield className="w-5 h-5 text-blue-500" />
                <span className="text-sm font-medium text-blue-900">Conexión Segura</span>
              </div>
              <p className="text-xs text-blue-700">
                Tu información está protegida con autenticación empresarial de JetSMART
              </p>
            </div>

            {/* Login Button */}
            <div className="space-y-3 mb-4">
              <Input
                type="email"
                placeholder="Correo"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Input
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
              <Button
                onClick={handleCredentialsSignIn}
                className="w-full bg-gradient-to-r from-[#153e69] to-[#1d558f] hover:opacity-90 text-white py-3 rounded-xl shadow-lg transition-all duration-300 group"
                size="lg"
              >
                <Lock className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
                Ingresar con correo y contraseña
              </Button>
            </div>

            {keycloakAvailable ? (
              <Button
                onClick={handleKeycloakSignIn}
                className="w-full bg-gradient-to-r from-[#a62733] to-[#8a1f2a] hover:from-[#8a1f2a] hover:to-[#6d1520] text-white hover:text-white py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 group"
                size="lg"
              >
                <Lock className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
                Iniciar Sesión con JetSMART
              </Button>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                El acceso con JetSMART no está configurado. Usa la opción de correo y contraseña.
              </div>
            )}

            {/* Footer */}
            <div className="mt-6 text-center">
              <p className="text-xs text-gray-500 leading-relaxed">
                JetSMART
                <br />
                <span className="text-[#a62733] font-medium"></span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
