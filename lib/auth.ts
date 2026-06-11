/**
 * Configuration and helper utilities for authentication.
 */
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import * as jose from 'jose';
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import KeycloakProvider from 'next-auth/providers/keycloak';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { authenticateUser, ensureSeedAdminUser, getUserByEmail } from '@/lib/user-store';

interface KeycloakJwtPayload extends jose.JWTPayload {
  realm_access?: {
    roles: string[];
  };
  resource_access?: {
    [key: string]: {
      roles: string[];
    };
  };
}

/**
 * Check if authentication is enabled via environment variables.
 */
export const isAuthEnabled = process.env.AUTH_ENABLED === 'true';

const isKeycloakConfigured =
  isAuthEnabled &&
  !!(process.env.KEYCLOAK_ID && process.env.KEYCLOAK_SECRET && process.env.KEYCLOAK_ISSUER);

/**
 * Configuration options for NextAuth.js.
 * This is the central place for all authentication configurations.
 * @see https://next-auth.js.org/configuration/options
 */
export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET ?? 'dev-smartycash-secret-change-this',
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: 'jwt',
  },
  providers: [
    CredentialsProvider({
      name: 'Credenciales SmartyCash',
      credentials: {
        email: { label: 'Correo', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        await ensureSeedAdminUser();
        const credentialsSchema = z.object({
          email: z.string().trim().email(),
          password: z.string().min(1),
        });
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }
        const user = await authenticateUser(parsed.data.email, parsed.data.password);
        if (!user) {
          return null;
        }
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
    ...(isKeycloakConfigured
      ? [
          KeycloakProvider({
            clientId: process.env.KEYCLOAK_ID!,
            clientSecret: process.env.KEYCLOAK_SECRET!,
            issuer: process.env.KEYCLOAK_ISSUER!,
            authorization: {
              params: {
                scope: 'openid profile email',
                kc_idp_hint: 'jetsmart',
              },
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, account, profile, user }) {
      if (account?.provider === 'credentials') {
        token.id = user?.id ?? token.sub;
        token.email = user?.email ?? token.email;
        token.roles = user && 'role' in user ? [String(user.role)] : token.roles;
        token.mustChangePassword =
          user && 'mustChangePassword' in user
            ? Boolean(user.mustChangePassword)
            : token.mustChangePassword;
      }
      if (account && profile) {
        token.id = profile.sub; // Guardar el ID de usuario de Keycloak
        token.idToken = account.id_token; // Necesario para el logout de Keycloak
        token.accessToken = account.access_token; // Necesario para extraer los roles

        // Decodificar el accessToken para extraer los roles
        if (token.accessToken) {
          try {
            const decodedToken: KeycloakJwtPayload = jose.decodeJwt(token.accessToken);
            const realmRoles = decodedToken.realm_access?.roles || [];
            const clientId = process.env.KEYCLOAK_ID;
            let clientRoles: string[] = [];
            if (
              clientId &&
              decodedToken.resource_access &&
              decodedToken.resource_access[clientId]
            ) {
              clientRoles = decodedToken.resource_access[clientId].roles || [];
            }
            token.roles = [...new Set([...realmRoles, ...clientRoles])];
          } catch (error) {
            console.error('Error decoding access token for roles', error);
            token.roles = [];
          }
        }
      }

      if (token.email) {
        const storedUser = await getUserByEmail(String(token.email));
        if (storedUser) {
          token.roles = [storedUser.role];
          token.mustChangePassword = storedUser.mustChangePassword;
          token.name = storedUser.name;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = (token.name as string) ?? session.user.name;
      }
      session.roles = token.roles;
      session.user.role = (token.roles?.[0] as string | undefined) ?? session.user.role;
      session.user.mustChangePassword = Boolean(token.mustChangePassword);
      session.id_token = token.idToken; // Pasar id_token a la sesión
      return session;
    },
  },
  debug: process.env.NODE_ENV === 'development',
};
