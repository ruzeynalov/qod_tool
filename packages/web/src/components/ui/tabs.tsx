'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
}

export interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onTabChange, className }: TabsProps) {
  return (
    <div className={cn('border-b border-qod-border', className)}>
      {/* Horizontal scroll on <sm so tab rows with 4+ tabs don't widen the
          page; scroll-snap so swiping lands cleanly on a tab. The negative
          margins extend the scroll area to the card edge so the active
          underline doesn't appear cropped. */}
      <nav
        className="flex gap-0 -mb-px overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:overflow-x-visible"
        style={{ scrollSnapType: 'x mandatory' }}
        role="tablist"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              style={{ scrollSnapAlign: 'start' }}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                isActive
                  ? 'border-qod-accent text-primary'
                  : 'border-transparent text-secondary hover:text-primary hover:border-qod-border',
              )}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.icon && <span className="shrink-0">{tab.icon}</span>}
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
