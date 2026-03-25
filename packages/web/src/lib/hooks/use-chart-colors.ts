import { useTheme } from '@/app/_providers/theme-provider';

export function useChartColors() {
  const { theme, skin } = useTheme();
  const isDark = theme === 'dark';
  const isModern = skin === 'modern';

  if (isModern) {
    return {
      grid: isDark ? '#3E3F44' : '#DDDEE1',
      axis: isDark ? '#A9ABAF' : '#7D818A',
      tooltipBg: isDark ? '#2A2A2D' : '#FFFFFF',
      tooltipBorder: isDark ? '#3E3F44' : '#DDDEE1',
      tooltipText: isDark ? '#A9ABAF' : '#505258',
      cursorFill: isDark ? '#3E3F4440' : '#7D818A20',
      accent: isDark ? '#579DFF' : '#1868DB',
      green: isDark ? '#4BCE97' : '#22A06B',
      amber: isDark ? '#F5A700' : '#CF9F02',
      red: isDark ? '#F87168' : '#C9372C',
    };
  }

  return {
    grid: isDark ? '#2a2d3a' : '#e2e8f0',
    axis: isDark ? '#94a3b8' : '#64748b',
    tooltipBg: isDark ? '#1a1d27' : '#ffffff',
    tooltipBorder: isDark ? '#2a2d3a' : '#e2e8f0',
    tooltipText: isDark ? '#94a3b8' : '#334155',
    cursorFill: isDark ? '#2a2d3a40' : '#64748b20',
    accent: '#6366f1',
    green: '#10b981',
    amber: '#f59e0b',
    red: '#ef4444',
  };
}
