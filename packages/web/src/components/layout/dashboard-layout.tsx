'use client';

import { useState, type ReactNode } from 'react';
import { Sidebar, MobileNav } from './sidebar';
import { Header } from './header';
import { cn } from '@/lib/utils/cn';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-qod-bg">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div
        className={cn(
          'transition-[padding] duration-200',
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-60',
        )}
      >
        <Header onMenuClick={() => setMobileOpen(true)} />
        <main className="p-3 sm:p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
