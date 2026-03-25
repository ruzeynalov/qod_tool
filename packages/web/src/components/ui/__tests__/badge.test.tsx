import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/ui/badge';

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('applies neutral variant styles by default', () => {
    render(<Badge>Default</Badge>);
    const el = screen.getByText('Default');
    expect(el.className).toContain('text-secondary');
  });

  it('applies success variant styles', () => {
    render(<Badge variant="success">Passed</Badge>);
    const el = screen.getByText('Passed');
    expect(el.className).toContain('text-rag-green');
  });

  it('applies error variant styles', () => {
    render(<Badge variant="error">Failed</Badge>);
    const el = screen.getByText('Failed');
    expect(el.className).toContain('text-rag-red');
  });

  it('applies warning variant styles', () => {
    render(<Badge variant="warning">Flaky</Badge>);
    const el = screen.getByText('Flaky');
    expect(el.className).toContain('text-rag-amber');
  });

  it('renders as a span with rounded-full and text-xs', () => {
    render(<Badge>Tag</Badge>);
    const el = screen.getByText('Tag');
    expect(el.tagName).toBe('SPAN');
    expect(el).toHaveClass('rounded-full');
    expect(el).toHaveClass('text-xs');
  });

  it('merges custom className', () => {
    render(<Badge className="ml-2">Extra</Badge>);
    const el = screen.getByText('Extra');
    expect(el).toHaveClass('ml-2');
    expect(el).toHaveClass('rounded-full'); // keeps base classes
  });
});
