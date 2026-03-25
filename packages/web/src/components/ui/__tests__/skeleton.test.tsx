import { render, screen } from '@testing-library/react';
import {
  Skeleton,
  TableSkeleton,
  ChartSkeleton,
  StatCardSkeleton,
} from '@/components/ui/skeleton';

describe('Skeleton', () => {
  it('renders with default animate-pulse class', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;

    expect(el).toHaveClass('animate-pulse');
    expect(el).toHaveClass('rounded');
    expect(el).toHaveClass('bg-gray-200');
  });

  it('accepts a custom className', () => {
    const { container } = render(<Skeleton className="h-4 w-24" />);
    const el = container.firstChild as HTMLElement;

    expect(el).toHaveClass('h-4');
    expect(el).toHaveClass('w-24');
    expect(el).toHaveClass('animate-pulse');
  });

  it('applies inline width and height styles', () => {
    const { container } = render(<Skeleton width={100} height={20} />);
    const el = container.firstChild as HTMLElement;

    expect(el).toHaveStyle({ width: '100px', height: '20px' });
  });
});

describe('TableSkeleton', () => {
  it('renders the default number of rows and columns', () => {
    const { container } = render(<TableSkeleton />);
    // 1 header row + 5 body rows = 6 flex containers
    const flexRows = container.querySelectorAll('.flex.gap-4');
    expect(flexRows.length).toBe(6); // header + 5 rows

    // Each row has 4 skeleton columns by default
    // Total skeletons: (1 header + 5 body) * 4 = 24
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(24);
  });

  it('renders custom rows and columns', () => {
    const { container } = render(<TableSkeleton rows={2} columns={3} />);
    // header + 2 rows = 3 flex containers, each with 3 skeletons = 9
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(9);
  });
});

describe('ChartSkeleton', () => {
  it('renders with default height of 200px', () => {
    const { container } = render(<ChartSkeleton />);
    const el = container.firstChild as HTMLElement;

    expect(el).toHaveClass('animate-pulse');
    expect(el).toHaveStyle({ height: '200px' });
  });

  it('renders 12 bar placeholders', () => {
    const { container } = render(<ChartSkeleton />);
    const bars = container.querySelectorAll('.rounded-t');
    expect(bars.length).toBe(12);
  });

  it('accepts a custom height', () => {
    const { container } = render(<ChartSkeleton height={400} />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveStyle({ height: '400px' });
  });
});

describe('StatCardSkeleton', () => {
  it('renders a bordered container with three skeleton elements', () => {
    const { container } = render(<StatCardSkeleton />);
    const wrapper = container.firstChild as HTMLElement;

    expect(wrapper).toHaveClass('rounded-lg');
    expect(wrapper).toHaveClass('border');

    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(3);
  });
});
