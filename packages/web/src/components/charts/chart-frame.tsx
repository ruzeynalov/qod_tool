'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Standardized responsive height for Recharts containers.
 *
 * Replaces the ad-hoc `h-48` / `h-52` / `h-64` / `h-72` divs scattered across
 * pages. Recharts already provides width responsiveness via `ResponsiveContainer`;
 * this owns the height side so charts grow on tablets and stay readable on
 * phones without per-chart media queries.
 *
 * Sizes (mobile → tablet → desktop):
 *   sm — 11rem / 13rem / 12rem  (compact charts: age distribution, severity donut)
 *   md — 14rem / 16rem / 16rem  (default trend charts: pass-rate, defect trend, severity, burndown)
 *   lg — 16rem / 18rem / 18rem  (large overlays: flaky-test scatter, execution timeline)
 */
export type ChartFrameSize = 'sm' | 'md' | 'lg';

const HEIGHT_BY_SIZE: Record<ChartFrameSize, string> = {
  sm: 'h-44 sm:h-52 lg:h-48',
  md: 'h-56 sm:h-64 lg:h-64',
  lg: 'h-64 sm:h-72 lg:h-72',
};

export function ChartFrame({
  size = 'md',
  className,
  children,
}: {
  size?: ChartFrameSize;
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn(HEIGHT_BY_SIZE[size], className)}>{children}</div>;
}
