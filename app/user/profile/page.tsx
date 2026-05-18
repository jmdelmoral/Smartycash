import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authOptions } from '@/lib/auth';

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect('/api/auth/signin');
  }

  // Los roles ahora vienen directamente del objeto de sesión.
  const roles = session.roles || [];

  return (
    <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">{session.user.name}</CardTitle>
          <CardDescription>{session.user.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <h3 className="text-lg font-semibold mb-2">Roles Asignados</h3>
          <div className="flex flex-wrap gap-2">
            {roles.length > 0 ? (
              roles.map((role) => <Badge key={role}>{role}</Badge>)
            ) : (
              <p className="text-sm text-muted-foreground">No tienes roles asignados.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
