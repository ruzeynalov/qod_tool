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
      <nav className="flex gap-0 -mb-px" role="tablist">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
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
