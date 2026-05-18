import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import { UserNav } from '@/components/auth/user-nav';
import { NextAuthSessionProvider } from '@/components/providers/session-provider';

import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Limitless AI',
  description: 'Powered by Limitless • JetSMART',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
        />
        <link rel="icon" href="/logo-icon.png" type="image/png" />
        <link rel="shortcut icon" href="/logo-icon.png" type="image/png" />
      </head>
      <body className={inter.className}>
        <NextAuthSessionProvider>
          <header className="border-b bg-gray-100/80 backdrop-blur">
            <div className="container mx-auto flex h-16 items-center justify-end px-6">
              <UserNav />
            </div>
          </header>
          <main>{children}</main>
        </NextAuthSessionProvider>
      </body>
    </html>
  );
}
