import { AuthProvider } from '@/app/_providers/auth-provider';
import { QueryProvider } from '@/app/_providers/query-provider';

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>{children}</AuthProvider>
    </QueryProvider>
  );
}
