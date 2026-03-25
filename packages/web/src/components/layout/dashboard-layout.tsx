'use client';

import { useState, type ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-qod-bg">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      <div
        className="transition-all duration-200"
        style={{ paddingLeft: sidebarCollapsed ? '4rem' : '15rem' }}
      >
        <Header />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
