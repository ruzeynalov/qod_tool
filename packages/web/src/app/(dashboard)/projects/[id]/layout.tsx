'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Layers,
  TestTube2,
  Bug,
  BarChart3,
  Bell,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useProject } from '@/lib/api/hooks';

interface Tab {
  label: string;
  href: string;
  icon: React.ElementType;
}

const tabs: Tab[] = [
  { label: 'Overview', href: '', icon: LayoutDashboard },
  { label: 'Coverage', href: '/coverage', icon: Layers },
  { label: 'Runs', href: '/runs', icon: TestTube2 },
  { label: 'Defects', href: '/defects', icon: Bug },
  { label: 'KPIs', href: '/kpis', icon: BarChart3 },
  { label: 'Alerts', href: '/alerts', icon: Bell },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const pathname = usePathname() ?? '';
  const { data: project } = useProject(params.id);
  const basePath = `/projects/${params.id}`;

  return (
    <div className="space-y-0">
      {/* Project Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-primary">
            {project?.name ?? 'Project'}
          </h1>
          {project?.demoMode && (
            <span className="rounded-full bg-rag-amber/10 px-2.5 py-0.5 text-xs font-medium text-rag-amber">
              Demo Mode
            </span>
          )}
        </div>
        {project?.description && (
          <p className="mt-1 text-sm text-muted">{project.description}</p>
        )}
      </div>

      {/* Tab Navigation — bleed-to-edge negative margins MUST match the
          dashboard layout's responsive page padding (p-3 sm:p-4 lg:p-6),
          otherwise on <lg the bleed extends past the viewport and forces
          horizontal page scroll. The nav itself scrolls horizontally on
          <sm so 7 tabs (~600px total) don't widen the page. */}
      <div className="-mx-3 sm:-mx-4 lg:-mx-6 border-b border-qod-border px-3 sm:px-4 lg:px-6">
        <nav
          className="flex gap-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:overflow-x-visible"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {tabs.map((tab) => {
            const fullHref = `${basePath}${tab.href}`;
            const isActive =
              tab.href === ''
                ? pathname === basePath
                : pathname.startsWith(fullHref);

            return (
              <Link
                key={tab.href}
                href={fullHref}
                style={{ scrollSnapAlign: 'start' }}
                className={cn(
                  'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
                  isActive
                    ? 'border-qod-accent text-qod-accent'
                    : 'border-transparent text-secondary hover:border-qod-border hover:text-primary'
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Page Content */}
      <div className="pt-6">{children}</div>
    </div>
  );
}
