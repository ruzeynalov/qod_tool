import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Providers } from '@/app/_providers';
import { AuthGate } from '@/components/layout/auth-gate';

export default function DashboardRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <AuthGate>
        <DashboardLayout>{children}</DashboardLayout>
      </AuthGate>
    </Providers>
  );
}
