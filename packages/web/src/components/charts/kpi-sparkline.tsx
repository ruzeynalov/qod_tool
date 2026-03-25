'use client';

interface KpiSparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

export function KpiSparkline({
  data,
  color = '#6366f1',
  width = 80,
  height = 24,
}: KpiSparklineProps) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const padding = 1;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const points = data
    .map((value, i) => {
      const x = padding + (i / (data.length - 1)) * innerWidth;
      const y = padding + innerHeight - ((value - min) / range) * innerHeight;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
