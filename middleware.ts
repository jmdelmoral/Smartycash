import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from 'next-auth/middleware';

import { isAuthEnabled } from '@/lib/auth';

const authMiddleware = withAuth(
  // NOTE: `withAuth` augments the `Request` object with `req.nextauth.token`
  function middleware(req) {
    console.log('🔐 Middleware executed for:', req.nextUrl.pathname);
    console.log('🔐 Token exists:', !!req.nextauth.token);
  },
  {
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
  }
);

export default function middleware(req: NextRequest) {
  if (!isAuthEnabled) {
    // If auth is disabled, don't do anything
    return NextResponse.next();
  }

  // If auth is enabled, run the auth middleware

  // @ts-expect-error
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
