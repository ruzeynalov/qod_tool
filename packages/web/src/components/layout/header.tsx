'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sun, Moon, ChevronRight, User, Paintbrush, Check, LogOut, Settings, Menu } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTheme, type Skin } from '@/app/_providers/theme-provider';
import { useDemoMode } from '@/app/_providers/demo-mode-provider';
import { useAuth } from '@/app/_providers/auth-provider';
import { useProjects } from '@/lib/api/hooks';
import { cn } from '@/lib/utils/cn';
import { UserSettingsDialog } from './user-settings-dialog';
import { NotificationBell } from './notification-bell';

function useBreadcrumbs(pathname: string) {
  const { data: projects } = useProjects();
  const projectNameMap = new Map(
    (projects ?? []).map((p) => [p.id, p.name]),
  );

  const segments = pathname.split('/').filter(Boolean);
  const crumbs: { label: string; href: string }[] = [
    { label: 'QOD', href: '/' },
  ];

  let path = '';
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    path += `/${segment}`;

    let label: string;
    if (i > 0 && segments[i - 1] === 'projects') {
      label = projectNameMap.get(segment) ?? segment;
    } else {
      label = segment
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    crumbs.push({ label, href: path });
  }

  return crumbs;
}

const skinOptions: { value: Skin; label: string; description: string }[] = [
  { value: 'classic', label: 'Classic', description: 'Original QOD theme' },
  { value: 'modern', label: 'Modern', description: 'Clean, professional look' },
];

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps = {}) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { theme, skin, toggleTheme, setSkin } = useTheme();
  const { demoMode, toggleDemoMode } = useDemoMode();
  const { user, isAuthenticated, logout, login } = useAuth();
  const breadcrumbs = useBreadcrumbs(pathname);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSkinMenu, setShowSkinMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const skinRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
      if (skinRef.current && !skinRef.current.contains(e.target as Node)) {
        setShowSkinMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <header className="flex h-14 items-center justify-between gap-2 border-b border-qod-border bg-qod-surface px-3 lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {/* Hamburger (mobile only) */}
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Open navigation menu"
            className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-secondary transition-colors hover:bg-qod-bg hover:text-primary lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        {/* Breadcrumbs — collapse intermediate crumbs to current page on <sm */}
        <nav className="flex min-w-0 items-center gap-1 overflow-hidden text-sm">
          {breadcrumbs.map((crumb, i) => {
            const isLast = i === breadcrumbs.length - 1;
            // On <sm, only render the last crumb; the hamburger + drawer carry navigation context.
            const hideOnMobile = !isLast;
            return (
              <span
                key={crumb.href}
                className={cn(
                  'flex min-w-0 items-center gap-1',
                  hideOnMobile && 'hidden sm:flex',
                )}
              >
                {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-muted" />}
                {isLast ? (
                  <span className="truncate font-medium text-primary">{crumb.label}</span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="truncate text-muted transition-colors hover:text-primary"
                  >
                    {crumb.label}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>
      </div>

      {/* Right section */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {/* Demo Mode toggle */}
        <button
          onClick={toggleDemoMode}
          className="flex items-center gap-2 rounded-full border border-qod-border px-3 py-1 text-xs font-medium transition-colors hover:bg-qod-bg"
          title={demoMode ? 'Switch to live data' : 'Switch to demo data'}
        >
          <span className={demoMode ? 'text-rag-amber' : 'text-muted'}>Demo</span>
          <div className={`relative h-4 w-7 rounded-full transition-colors ${demoMode ? 'bg-rag-amber' : 'bg-qod-border'}`}>
            <div className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${demoMode ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
          </div>
        </button>

        {/* Notification bell */}
        <NotificationBell />

        {/* Skin switcher */}
        <div className="relative" ref={skinRef}>
          <button
            onClick={() => setShowSkinMenu(!showSkinMenu)}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md text-secondary transition-colors hover:bg-qod-bg hover:text-primary',
              showSkinMenu && 'bg-qod-bg text-primary',
            )}
            title="Change skin"
          >
            <Paintbrush className="h-4 w-4" />
          </button>
          {showSkinMenu && (
            <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-qod-border bg-qod-surface py-1 shadow-xl">
              <div className="border-b border-qod-border px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Skin</p>
              </div>
              {skinOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => { setSkin(option.value); setShowSkinMenu(false); }}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-qod-bg"
                >
                  <div className="flex-1">
                    <p className={cn('text-sm font-medium', skin === option.value ? 'text-qod-accent' : 'text-primary')}>
                      {option.label}
                    </p>
                    <p className="text-xs text-muted">{option.description}</p>
                  </div>
                  {skin === option.value && (
                    <Check className="h-4 w-4 shrink-0 text-qod-accent" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex h-8 w-8 items-center justify-center rounded-md text-secondary transition-colors hover:bg-qod-bg hover:text-primary"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>

        {/* User avatar with dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-qod-border text-secondary transition-colors hover:text-primary"
          >
            <User className="h-4 w-4" />
          </button>
          {showUserMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-qod-border bg-qod-surface py-1 shadow-xl">
              <div className="border-b border-qod-border px-3 py-2">
                <p className="text-sm font-medium text-primary">
                  {isAuthenticated ? (user?.name ?? 'User') : 'Guest'}
                </p>
                <p className="text-xs text-muted">
                  {isAuthenticated ? user?.email : 'Demo mode'}
                </p>
              </div>
              {isAuthenticated && !demoMode && (
                <>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setShowSettings(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-secondary transition-colors hover:bg-qod-bg hover:text-primary"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Settings
                  </button>
                  <button
                    onClick={() => {
                      logout();
                      setShowUserMenu(false);
                      router.push('/login');
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-secondary transition-colors hover:bg-qod-bg hover:text-primary"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                </>
              )}
              {!isAuthenticated && !demoMode && (
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    router.push('/login');
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-secondary transition-colors hover:bg-qod-bg hover:text-primary"
                >
                  <User className="h-3.5 w-3.5" />
                  Sign in
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {/* User Settings Dialog */}
      {showSettings && (
        <UserSettingsDialog
          open={showSettings}
          onClose={() => setShowSettings(false)}
          user={user}
          onProfileUpdate={(updated) => {
            // Update local auth state with new name
            if (user) {
              login(localStorage.getItem('qod-auth-token') ?? '', { ...user, name: updated.name });
            }
          }}
        />
      )}
    </header>
  );
}
