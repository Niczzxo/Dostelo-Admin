import type { ReactNode } from 'react';
import { AuthProvider, RequireAuth } from '../../components/auth-provider';
import Sidebar from '../../components/sidebar';
import Topbar from '../../components/topbar';

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AuthProvider>
      <RequireAuth>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <Sidebar />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Topbar />
            <main style={{ padding: '28px 32px' }}>{children}</main>
          </div>
        </div>
      </RequireAuth>
    </AuthProvider>
  );
}
