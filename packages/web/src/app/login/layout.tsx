import { AuthProvider } from '@/app/_providers/auth-provider';

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
