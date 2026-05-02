'use client';

import { useState, useMemo, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
}

export interface DataTablePagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  /**
   * Stable per-row React key. Required: replaces the previous index-keying
   * which was brittle on resort and breaks once the same data is rendered in
   * two DOM shapes (table on >=md, card list on <md) at different breakpoints.
   */
  getRowKey: (row: T, idx: number) => string;
  /**
   * Optional. When provided, renders an <ul> of cards on <md (using a
   * `hidden md:block` table + `md:hidden` list pair). Receives the same
   * sorted/paginated data as the table; the desktop table renders unchanged.
   * Card click behaviour is the caller's responsibility — `onRowClick` is
   * not auto-applied to cards because card rows usually contain their own
   * tappable controls.
   */
  mobileCard?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  pagination?: DataTablePagination;
  defaultSort?: { key: string; direction: SortDirection };
  className?: string;
}

type SortDirection = 'asc' | 'desc';

interface SortState {
  key: string;
  direction: SortDirection;
}

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce((acc: unknown, part) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  getRowKey,
  mobileCard,
  onRowClick,
  emptyMessage = 'No data available',
  pagination,
  defaultSort,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(defaultSort ?? null);

  const handleSort = (key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) {
        return { key, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { key, direction: 'desc' };
      }
      return null;
    });
  };

  const sortedData = useMemo(() => {
    if (!sort) return data;

    return [...data].sort((a, b) => {
      const aVal = getNestedValue(a, sort.key);
      const bVal = getNestedValue(b, sort.key);

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [data, sort]);

  const totalPages = pagination
    ? Math.ceil(pagination.total / pagination.pageSize)
    : 0;

  return (
    <div className={cn(className)}>
      {mobileCard && (
        <ul role="list" className="md:hidden divide-y divide-qod-border/60">
          {sortedData.length === 0 ? (
            <li className="px-4 py-12 text-center text-muted">{emptyMessage}</li>
          ) : (
            sortedData.map((row, idx) => (
              <li
                key={getRowKey(row, idx)}
                className={cn(
                  'transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-qod-bg',
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {mobileCard(row)}
              </li>
            ))
          )}
        </ul>
      )}
      <div className={cn('overflow-x-auto', mobileCard && 'hidden md:block')}>
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-qod-border">
            {columns.map((col) => (
              <th
                key={col.key}
                role="columnheader"
                aria-sort={
                  col.sortable
                    ? sort?.key === col.key
                      ? sort.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                    : undefined
                }
                className={cn(
                  'px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted',
                  col.sortable && 'cursor-pointer select-none hover:text-primary',
                  col.className,
                )}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                <div className="flex items-center gap-1">
                  {col.header}
                  {col.sortable && (
                    <span className="inline-flex">
                      {sort?.key === col.key ? (
                        sort.direction === 'asc' ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                      )}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-muted"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((row, idx) => (
              <tr
                key={getRowKey(row, idx)}
                className={cn(
                  'border-b border-qod-border/50 transition-colors',
                  idx % 2 === 1 && 'bg-qod-bg/30',
                  onRowClick && 'cursor-pointer hover:bg-qod-bg',
                  !onRowClick && 'hover:bg-qod-bg',
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn('px-4 py-3 text-secondary', col.className)}>
                    {col.render
                      ? col.render(row)
                      : (getNestedValue(row, col.key) as ReactNode) ?? '—'}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>

      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-qod-border px-4 py-3">
          <span className="text-xs text-muted">
            Showing {(pagination.page - 1) * pagination.pageSize + 1}–
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
            {pagination.total}
          </span>
          <div className="flex items-center gap-1">
            <button
              className="rounded px-2 py-1 text-xs text-secondary hover:bg-qod-bg hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => {
                // Show first, last, current, and neighbors
                return (
                  p === 1 ||
                  p === totalPages ||
                  Math.abs(p - pagination.page) <= 1
                );
              })
              .reduce<(number | 'ellipsis')[]>((acc, p, i, arr) => {
                if (i > 0 && p - (arr[i - 1] as number) > 1) {
                  acc.push('ellipsis');
                }
                acc.push(p);
                return acc;
              }, [])
              .map((item, idx) =>
                item === 'ellipsis' ? (
                  <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted">
                    ...
                  </span>
                ) : (
                  <button
                    key={item}
                    className={cn(
                      'rounded px-2 py-1 text-xs',
                      item === pagination.page
                        ? 'bg-qod-accent text-white'
                        : 'text-secondary hover:bg-qod-bg hover:text-primary',
                    )}
                    onClick={() => pagination.onPageChange(item)}
                  >
                    {item}
                  </button>
                ),
              )}
            <button
              className="rounded px-2 py-1 text-xs text-secondary hover:bg-qod-bg hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={pagination.page >= totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
