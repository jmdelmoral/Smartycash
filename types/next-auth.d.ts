import { type DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id?: string;
      role?: string;
      mustChangePassword?: boolean;
    } & DefaultSession['user'];
    roles?: string[];
    id_token?: string; // Añadido para el logout de Keycloak
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    roles?: string[];
    idToken?: string;
    accessToken?: string; // Lo necesitamos para extraer roles
    mustChangePassword?: boolean;
  }
}
