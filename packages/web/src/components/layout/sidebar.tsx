'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FolderKanban,
  TestTube2,
  Bug,
  BarChart3,
  Settings,
  Shield,
  ChevronLeft,
  ChevronRight,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const mainNav: NavItem[] = [
  { label: 'Overview', href: '/', icon: LayoutDashboard },
  { label: 'Projects', href: '/projects', icon: FolderKanban },
];

const projectSubNav: NavItem[] = [
  { label: 'Overview', href: '', icon: LayoutDashboard },
  { label: 'Coverage', href: '/coverage', icon: Layers },
  { label: 'Runs', href: '/runs', icon: TestTube2 },
  { label: 'Defects', href: '/defects', icon: Bug },
  { label: 'KPIs', href: '/kpis', icon: BarChart3 },
  { label: 'Settings', href: '/settings', icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname() ?? '';

  // Detect if we're inside a project route
  const projectMatch = pathname.match(/^\/projects\/([^/]+)/);
  const projectId = projectMatch?.[1];

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-qod-border bg-qod-sidebar transition-all duration-200',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Brand */}
      <div className="flex h-14 items-center gap-3 border-b border-qod-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-qod-accent">
          <Shield className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <span className="text-base font-semibold tracking-tight text-primary">
            QOD
          </span>
        )}
      </div>

      {/* Main Nav */}
      <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        <div className="mb-2">
          {!collapsed && (
            <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted">
              Navigation
            </span>
          )}
        </div>
        {mainNav.map((item) => {
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
                  : 'text-secondary hover:bg-qod-bg hover:text-primary'
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {/* Project Sub-navigation */}
        {projectId && (
          <>
            <div className="mt-6 mb-2">
              {!collapsed && (
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
                      : 'text-secondary hover:bg-qod-bg hover:text-primary'
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Collapse Toggle */}
      <div className="border-t border-qod-border p-2">
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
  );
}
