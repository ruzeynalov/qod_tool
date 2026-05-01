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
import { Sheet, DialogTitle } from '@/components/ui/dialog';

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
}

interface NavSectionsProps {
  showLabels: boolean;
  pathname: string;
  isAdmin: boolean;
  onNavigate?: () => void;
}

function NavSections({ showLabels, pathname, isAdmin, onNavigate }: NavSectionsProps) {
  const projectMatch = pathname.match(/^\/projects\/([^/]+)/);
  const projectId = projectMatch?.[1];

  return (
    <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
      <div className="mb-2">
        {showLabels && (
          <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted">
            Navigation
          </span>
        )}
      </div>
      {mainNav
        .filter((item) => !item.adminOnly || isAdmin)
        .map((item) => {
          const isActive =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-qod-accent/10 text-qod-accent'
                  : 'text-secondary hover:bg-qod-bg hover:text-primary',
              )}
              title={!showLabels ? item.label : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {showLabels && <span>{item.label}</span>}
            </Link>
          );
        })}

      {projectId && (
        <>
          <div className="mt-6 mb-2">
            {showLabels && (
              <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted">
                Project
              </span>
            )}
          </div>
          {projectSubNav.map((item) => {
            const fullHref = `/projects/${projectId}${item.href}`;
            const isActive =
              item.href === ''
                ? pathname === `/projects/${projectId}`
                : pathname.startsWith(fullHref);
            return (
              <Link
                key={item.href}
                href={fullHref}
                aria-current={isActive ? 'page' : undefined}
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-qod-accent/10 text-qod-accent'
                    : 'text-secondary hover:bg-qod-bg hover:text-primary',
                )}
                title={!showLabels ? item.label : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {showLabels && <span>{item.label}</span>}
              </Link>
            );
          })}
        </>
      )}
    </nav>
  );
}

function Brand({ showLabels }: { showLabels: boolean }) {
  return (
    <div className="flex h-14 items-center gap-3 border-b border-qod-border px-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-qod-accent">
        <Shield className="h-4 w-4 text-white" />
      </div>
      {showLabels && (
        <span className="text-base font-semibold tracking-tight text-primary">
          QOD
        </span>
      )}
    </div>
  );
}

/**
 * Persistent desktop rail. Hidden on <lg; the mobile equivalent is rendered
 * on demand by `MobileNav` which sits on top of the shared `Sheet` primitive
 * (focus trap + scroll lock + inert background + focus restoration).
 */
export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { isAdmin } = useAuth();
  const pathname = usePathname() ?? '';
  const showLabels = !collapsed;

  return (
    <aside
      aria-label="Primary navigation"
      className={cn(
        'fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-qod-border bg-qod-sidebar transition-[width] duration-200 lg:flex',
        collapsed ? 'lg:w-16' : 'lg:w-60',
      )}
    >
      <Brand showLabels={showLabels} />
      <NavSections showLabels={showLabels} pathname={pathname} isAdmin={isAdmin} />
      <div className="border-t border-qod-border p-2">
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-center rounded-md p-2 text-secondary transition-colors hover:bg-qod-bg hover:text-primary"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Off-canvas drawer for <lg. Built on the shared `Sheet` so it gets focus
 * trap, scroll lock, inert background, focus restoration, Esc-to-close, and
 * backdrop-tap-to-close for free.
 */
export function MobileNav({ open, onClose }: MobileNavProps) {
  const { isAdmin } = useAuth();
  const pathname = usePathname() ?? '';

  // Auto-close when the route changes — the user just navigated, the drawer's
  // job is done.
  useEffect(() => {
    if (open) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <Sheet open={open} onClose={onClose} side="left" className="bg-qod-sidebar p-0">
      <Brand showLabels />
      {/* Visually-hidden title satisfies the Dialog primitive's a11y contract
          without adding a redundant heading next to the brand. */}
      <DialogTitle className="sr-only">Site navigation</DialogTitle>
      <NavSections
        showLabels
        pathname={pathname}
        isAdmin={isAdmin}
        onNavigate={onClose}
      />
    </Sheet>
  );
}
