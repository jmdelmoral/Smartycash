'use client';

import { Lock, Shield } from 'lucide-react';
import Image from 'next/image';
import { signIn } from 'next-auth/react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function LoginModal() {
  const handleKeycloakSignIn = () => {
    signIn('keycloak', {
      callbackUrl: '/',
      redirect: true,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex items-center justify-center p-4">
      <Dialog open={true}>
        <DialogContent className="sm:max-w-md border-0 shadow-2xl bg-white rounded-2xl p-0 overflow-hidden">
          {/* Header Section - Invertido para mejor contraste */}
          <div className="bg-gradient-to-r from-slate-50 to-gray-100 p-6 text-center border-b border-gray-200">
            <div className="mb-4">
              <Image
                src="/logo-limitless.png"
                alt="Limitless Logo"
                width={150}
                height={45}
                className="w-auto h-8 mx-auto mb-2"
              />
            </div>
            <DialogDescription className="text-gray-700 text-sm font-medium">
              Powered by <span className="text-[#a62733] font-semibold">Limitless</span> •{' '}
              <span className="text-[#153e69] font-semibold">JetSMART</span>
            </DialogDescription>
          </div>

          {/* Content Section */}
          <div className="p-6">
            <DialogHeader className="text-center mb-6">
              <DialogTitle className="text-xl font-semibold text-gray-900 mb-2">
                Acceso Seguro Requerido
              </DialogTitle>
              <DialogDescription className="text-gray-600 text-sm">
                Para acceder a SMARTGPT, debes autenticarte con tu cuenta de JetSMART
              </DialogDescription>
            </DialogHeader>

            {/* Security Info */}
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-3 mb-2">
                <Shield className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">Conexión Segura</span>
              </div>
              <p className="text-xs text-blue-700">
                Tu información está protegida con autenticación empresarial de JetSMART
              </p>
            </div>

            {/* Login Button */}
            <Button
              onClick={handleKeycloakSignIn}
              className="w-full bg-gradient-to-r from-[#a62733] to-[#8a1f2a] hover:from-[#8a1f2a] hover:to-[#6d1520] text-white py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 group"
              size="lg"
            >
              <Lock className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
              Iniciar Sesión con JetSMART
            </Button>

            {/* Footer */}
            <div className="mt-6 text-center">
              <p className="text-xs text-gray-500 leading-relaxed">
                Al continuar, aceptas las políticas de seguridad y uso de IA de JetSMART.
                <br />
                <span className="text-[#a62733] font-medium">Solo personal autorizado.</span>
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
