import { clsx } from 'clsx';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className, width, height }: SkeletonProps) {
  return (
    <div
      className={clsx(
        'animate-pulse rounded bg-gray-200 dark:bg-gray-700',
        className,
      )}
      style={{ width, height }}
    />
  );
}

export function TableSkeleton({
  rows = 5,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="w-full space-y-2">
      {/* Header */}
      <div className="flex gap-4 border-b border-gray-200 pb-2 dark:border-gray-700">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 py-2">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div
      className="animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
      style={{ height }}
    >
      <div className="flex h-full items-end gap-1 p-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-gray-200 dark:bg-gray-700"
            style={{ height: `${30 + Math.random() * 60}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <Skeleton className="mb-2 h-3 w-24" />
      <Skeleton className="mb-1 h-8 w-16" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}
