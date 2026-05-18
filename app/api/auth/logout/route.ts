import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * Inicia el proceso de cierre de sesión global.
 * Redirige al usuario a Keycloak para invalidar la sesión del proveedor.
 * Keycloak luego redirigirá de vuelta a /auth/logged-out para limpiar la sesión local.
 */
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (token && token.idToken) {
      const keycloakIssuer = process.env.KEYCLOAK_ISSUER;
      if (!keycloakIssuer) {
        throw new Error('KEYCLOAK_ISSUER no está configurado');
      }

      const logoutUrl = new URL(`${keycloakIssuer}/protocol/openid-connect/logout`);

      // La URL a la que Keycloak redirigirá después del logout
      const postLogoutRedirectUri = new URL('/auth/logged-out', req.nextUrl.origin).toString();

      logoutUrl.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);
      logoutUrl.searchParams.set('id_token_hint', token.idToken);

      // Redirigir al usuario a Keycloak
      return NextResponse.redirect(logoutUrl);
    }
  } catch (error) {
    console.error('Error al construir la URL de logout de Keycloak:', error);
  }

  // Si no hay token o hay un error, simplemente redirigir a la página de inicio
  return NextResponse.redirect(new URL('/', req.nextUrl.origin));
}
