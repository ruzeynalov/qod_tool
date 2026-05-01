'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  TestTube2,
  Bug,
  BarChart3,
  Bell,
  Settings,
  Shield,
  ChevronLeft,
  ChevronRight,
  Layers,
  Users,
} from 'lucide-react';
import { useAuth } from '@/app/_providers/auth-provider';
import { cn } from '@/lib/utils/cn';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const mainNav: NavItem[] = [
  { label: 'Overview', href: '/', icon: LayoutDashboard },
  { label: 'Projects', href: '/projects', icon: FolderKanban },
  { label: 'Users', href: '/users', icon: Users, adminOnly: true },
];

const projectSubNav: NavItem[] = [
  { label: 'Overview', href: '', icon: LayoutDashboard },
  { label: 'Coverage', href: '/coverage', icon: Layers },
  { label: 'Runs', href: '/runs', icon: TestTube2 },
  { label: 'Defects', href: '/defects', icon: Bug },
  { label: 'KPIs', href: '/kpis', icon: BarChart3 },
  { label: 'Alerts', href: '/alerts', icon: Bell },
  { label: 'Settings', href: '/settings', icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const { isAdmin } = useAuth();
  const pathname = usePathname() ?? '';

  const projectMatch = pathname.match(/^\/projects\/([^/]+)/);
  const projectId = projectMatch?.[1];

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    if (mobileOpen) onMobileClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll while the mobile drawer is open. The Dialog primitive owns its own
  // lock, but the sidebar drawer here is plain CSS for simplicity (cheap, no focus trap
  // needed at this phase since nav links are non-modal). Phase 3 will migrate this onto
  // the shared Sheet primitive when the bottom sheet for filters lands.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [mobileOpen]);

  // Esc closes the mobile drawer.
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onMobileClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen, onMobileClose]);

  return (
    <>
      {/* Mobile backdrop */}
      <div
        aria-hidden="true"
        onClick={onMobileClose}
        className={cn(
          'fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <aside
        aria-label="Primary navigation"
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-qod-border bg-qod-sidebar transition-transform duration-200 lg:translate-x-0',
          // Mobile: full-width slide-in drawer, Desktop: fixed rail (collapsed/expanded)
          'w-72',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          collapsed ? 'lg:w-16' : 'lg:w-60',
        )}
      >
        {/* Brand */}
        <div className="flex h-14 items-center gap-3 border-b border-qod-border px-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-qod-accent">
            <Shield className="h-4 w-4 text-white" />
          </div>
          {(!collapsed || mobileOpen) && (
            <span className="text-base font-semibold tracking-tight text-primary">
              QOD
            </span>
          )}
        </div>

        {/* Main Nav */}
        <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
          <div className="mb-2">
            {(!collapsed || mobileOpen) && (
              <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted">
                Navigation
              </span>
            )}
          </div>
          {mainNav.filter(item => !item.adminOnly || isAdmin).map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-qod-accent/10 text-qod-accent'
                    : 'text-secondary hover:bg-qod-bg hover:text-primary',
                )}
                title={collapsed && !mobileOpen ? item.label : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {(!collapsed || mobileOpen) && <span>{item.label}</span>}
              </Link>
            );
          })}

          {/* Project Sub-navigation */}
          {projectId && (
            <>
              <div className="mt-6 mb-2">
                {(!collapsed || mobileOpen) && (
                  <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Project
                  </span>
                )}
              </div>
              {projectSubNav.map((item) => {
                const fullHref = `/projects/${projectId}${item.href}`;
                const isActive = item.href === ''
                  ? pathname === `/projects/${projectId}`
                  : pathname.startsWith(fullHref);
                return (
                  <Link
                    key={item.href}
                    href={fullHref}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-qod-accent/10 text-qod-accent'
                        : 'text-secondary hover:bg-qod-bg hover:text-primary',
                    )}
                    title={collapsed && !mobileOpen ? item.label : undefined}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {(!collapsed || mobileOpen) && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        {/* Collapse Toggle (desktop only) */}
        <div className="hidden border-t border-qod-border p-2 lg:block">
          <button
            onClick={onToggle}
            className="flex w-full items-center justify-center rounded-md p-2 text-secondary transition-colors hover:bg-qod-bg hover:text-primary"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
