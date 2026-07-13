import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from 'next-auth/middleware';

import { isAuthEnabled } from '@/lib/auth';

const authMiddleware = withAuth({
  callbacks: {
    authorized: ({ token, req }) => {
      const publicPaths = ['/auth', '/health', '/recursos'];

      const isPublic = publicPaths.some((path) => req.nextUrl.pathname.startsWith(path));

      if (isPublic) {
        return true;
      }

      // For all other routes, require a token
      return !!token;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
});

export default function middleware(req: NextRequest) {
  if (!isAuthEnabled) {
    // Auth disabled: let every request through without invoking NextAuth.
    return NextResponse.next();
  }

  // withAuth's handler is typed for NextRequestWithAuth; passing NextRequest is
  // safe for our usage (the matcher below scopes which paths reach this point).
  // @ts-expect-error - NextRequest vs NextRequestWithAuth signature mismatch
  return authMiddleware(req);
}

export const config = {
  /*
   * Match all request paths except for the ones starting with:
   * - _next/static (static files)
   * - _next/image (image optimization files)
   * - favicon.ico (favicon file)
   * - images (image files)
   * - logo (logo files)
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|logo).*)'],
};
