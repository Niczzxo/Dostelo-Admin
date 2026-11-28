import type { ReactNode } from 'react';
import { AuthProvider, RequireAuth } from '../../components/auth-provider';
import Shell from '../../components/shell';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <RequireAuth>
        <Shell>{children}</Shell>
      </RequireAuth>
    </AuthProvider>
  );
}
