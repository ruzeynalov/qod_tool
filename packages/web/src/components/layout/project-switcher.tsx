'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Check, ChevronDown, FolderKanban } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { useProjects } from '@/lib/api/hooks';
import { cn } from '@/lib/utils/cn';

let didWarnLoadFailed = false;

/**
 * Project switcher — appears in the desktop header (rendered as a popover
 * button so its options don't pollute the static DOM with the project names)
 * and inside `MobileNav` (rendered as a native `<select>` since the drawer
 * mounts via Sheet's portal only when open, so its options are not in the
 * static DOM either).
 *
 * Sub-route preservation uses a deliberate whitelist. Anything outside it
 * falls back to the project overview to avoid carrying filters / expanded
 * row state / deep-linked anchors into a project where they are
 * meaningless or broken.
 */
const PRESERVED_SUBROUTES = new Set([
  'coverage',
  'runs',
  'defects',
  'kpis',
  'alerts',
  'settings',
]);

interface ProjectSwitcherProps {
  className?: string;
  variant?: 'popover' | 'select';
}

export function ProjectSwitcher({ className, variant = 'popover' }: ProjectSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const { data: projects, isError, error } = useProjects();

  // Surface a one-time dev-only warning if the projects query failed —
  // otherwise we silently render `null` and the switcher just disappears
  // from the UI with no signal to the user or developer.
  if (isError && !didWarnLoadFailed && process.env.NODE_ENV !== 'production') {
    didWarnLoadFailed = true;

    console.warn('[ProjectSwitcher] useProjects failed; switcher hidden:', error);
  }

  const parts = pathname.split('/').filter(Boolean);
  // Only render on /projects/[id]/... routes.
  if (parts[0] !== 'projects' || parts.length < 2) return null;
  const currentId = parts[1];
  const subroute = parts[2] && PRESERVED_SUBROUTES.has(parts[2]) ? parts[2] : null;

  const allProjects = projects ?? [];
  if (allProjects.length === 0) return null;

  const navigate = (newId: string) => {
    if (!newId || newId === currentId) return;
    const target = subroute ? `/projects/${newId}/${subroute}` : `/projects/${newId}`;
    router.push(target);
  };

  if (variant === 'select') {
    return (
      <Select
        options={allProjects.map((p) => ({ value: p.id, label: p.name }))}
        value={currentId}
        onChange={navigate}
        aria-label="Switch project"
        className={className}
      />
    );
  }

  return (
    <ProjectSwitcherPopover
      projects={allProjects}
      currentId={currentId}
      onSelect={navigate}
      className={className}
    />
  );
}

interface ProjectSwitcherPopoverProps {
  projects: Array<{ id: string; name: string }>;
  currentId: string;
  onSelect: (id: string) => void;
  className?: string;
}

function ProjectSwitcherPopover({
  projects,
  currentId,
  onSelect,
  className,
}: ProjectSwitcherPopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Esc.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = projects.find((p) => p.id === currentId);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch project"
        className={cn(
          'flex h-9 w-full items-center gap-2 rounded-md border border-qod-border bg-qod-surface px-3 text-sm font-medium text-secondary transition-colors hover:bg-qod-bg hover:text-primary',
          open && 'bg-qod-bg text-primary',
        )}
      >
        <FolderKanban className="h-4 w-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate text-left">
          {current?.name ?? 'Select project'}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Projects"
          className="absolute right-0 top-full z-50 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-qod-border bg-qod-surface py-1 shadow-xl"
        >
          {projects.map((p) => {
            const isCurrent = p.id === currentId;
            return (
              <li key={p.id} role="option" aria-selected={isCurrent}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(p.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-qod-bg',
                    isCurrent ? 'text-qod-accent' : 'text-primary',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {isCurrent && <Check className="h-4 w-4 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
