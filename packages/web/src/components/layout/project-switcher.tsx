'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';
import { useProjects } from '@/lib/api/hooks';

/**
 * Project switcher — appears in the desktop header beside the breadcrumb
 * (only when the current path is under `/projects/[id]/...`) and inside
 * `MobileNav` for the mobile drawer.
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
}

export function ProjectSwitcher({ className }: ProjectSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const { data: projects } = useProjects();

  const parts = pathname.split('/').filter(Boolean);
  // Only render on /projects/[id]/... routes.
  if (parts[0] !== 'projects' || parts.length < 2) return null;
  const currentId = parts[1];
  const subroute = parts[2] && PRESERVED_SUBROUTES.has(parts[2]) ? parts[2] : null;

  const options = (projects ?? []).map((p) => ({ value: p.id, label: p.name }));
  if (options.length === 0) return null;

  const handleChange = (newId: string) => {
    if (!newId || newId === currentId) return;
    const target = subroute ? `/projects/${newId}/${subroute}` : `/projects/${newId}`;
    router.push(target);
  };

  return (
    <Select
      options={options}
      value={currentId}
      onChange={handleChange}
      aria-label="Switch project"
      className={className}
    />
  );
}
