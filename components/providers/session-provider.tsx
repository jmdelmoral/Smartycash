'use client';

import { SessionProvider } from 'next-auth/react';
import { type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export function NextAuthSessionProvider({ children }: Props) {
  return <SessionProvider>{children}</SessionProvider>;
}
