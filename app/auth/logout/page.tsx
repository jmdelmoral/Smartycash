'use client';

import { signOut } from 'next-auth/react';
import { useEffect, useRef } from 'react';

type LogoutInfo = {
  id_token: string;
  endSessionEndpoint: string;
  postLogoutRedirectUri: string;
};

export default function LogoutPage() {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    const performLogout = async () => {
      // 1. Clear local session
      await signOut({ redirect: false });

      // 2. Fetch logout details from our secure API
      const res = await fetch('/api/auth/session/logout-info');

      if (!res.ok) {
        // Handle error, maybe redirect to home
        console.error('Failed to get logout info');
        window.location.href = '/';
        return;
      }

      const logoutInfo: LogoutInfo = await res.json();

      // 3. Submit the form to Keycloak to log out globally
      if (formRef.current && !submitted.current) {
        const idTokenInput = formRef.current.elements.namedItem(
          'id_token_hint'
        ) as HTMLInputElement;
        const postLogoutRedirectUriInput = formRef.current.elements.namedItem(
          'post_logout_redirect_uri'
        ) as HTMLInputElement;

        if (idTokenInput) {
          idTokenInput.value = logoutInfo.id_token;
        }

        if (postLogoutRedirectUriInput) {
          postLogoutRedirectUriInput.value = logoutInfo.postLogoutRedirectUri;
        }

        formRef.current.action = logoutInfo.endSessionEndpoint;

        submitted.current = true;
        formRef.current.submit();
      }
    };

    performLogout();
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <p>Cerrando sesión...</p>
      <form ref={formRef} method="POST" style={{ display: 'none' }}>
        <input type="hidden" name="id_token_hint" />
        <input type="hidden" name="post_logout_redirect_uri" />
      </form>
    </div>
  );
}
