import { AuthProvider } from '@/app/_providers/auth-provider';
import { DemoModeProvider } from '@/app/_providers/demo-mode-provider';
import { QueryProvider } from '@/app/_providers/query-provider';

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>
        <DemoModeProvider>{children}</DemoModeProvider>
      </AuthProvider>
    </QueryProvider>
  );
}
