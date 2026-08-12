import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions, getAppSession } from '@/lib/auth';

export async function GET() {
  const session = await getAppSession();

  if (!session?.id_token) {
    return NextResponse.json({ error: 'No session found' }, { status: 401 });
  }

  const issuerUrl = process.env.KEYCLOAK_ISSUER;
  if (!issuerUrl) {
    return NextResponse.json({ error: 'Keycloak issuer URL not configured' }, { status: 500 });
  }

  const endSessionEndpoint = `${issuerUrl}/protocol/openid-connect/logout`;

  const postLogoutRedirectUri = `${process.env.NEXTAUTH_URL}`;

  return NextResponse.json({
    id_token: session.id_token,
    endSessionEndpoint,
    postLogoutRedirectUri,
  });
}
