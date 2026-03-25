'use client';

interface CoverageData {
  name: string;
  automated: number;
  manual: number;
  total: number;
  coverage: number;
}

interface CoverageHeatmapProps {
  data: CoverageData[];
}

function coverageColor(pct: number) {
  if (pct >= 80) return { text: 'text-rag-green', bar: 'bg-rag-green', border: 'border-rag-green/20' };
  if (pct >= 50) return { text: 'text-rag-amber', bar: 'bg-rag-amber', border: 'border-rag-amber/20' };
  return { text: 'text-rag-red', bar: 'bg-rag-red', border: 'border-rag-red/20' };
}

export function CoverageHeatmap({ data }: CoverageHeatmapProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {data.map((item) => {
        const c = coverageColor(item.coverage);
        return (
          <div
            key={item.name}
            className={`rounded-lg border bg-qod-surface p-3 ${c.border}`}
          >
            <div className="flex items-baseline justify-between gap-1">
              <span className={`text-lg font-bold ${c.text}`}>
                {item.coverage}%
              </span>
              <span className="text-[10px] text-muted">{item.total} tests</span>
            </div>
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-qod-border">
              <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${item.coverage}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-secondary leading-tight truncate" title={item.name}>
              {item.name}
            </p>
          </div>
        );
      })}
    </div>
  );
}
