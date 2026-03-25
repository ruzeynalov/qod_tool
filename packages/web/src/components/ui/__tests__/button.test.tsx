import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('renders children text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('applies primary variant styles by default', () => {
    render(<Button>Primary</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('text-white');
  });

  it('applies secondary variant styles', () => {
    render(<Button variant="secondary">Secondary</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('text-primary');
  });

  it('applies danger variant styles', () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('text-rag-red');
  });

  it('applies size classes correctly', () => {
    const { rerender } = render(<Button size="sm">Small</Button>);
    expect(screen.getByRole('button').className).toContain('text-xs');

    rerender(<Button size="lg">Large</Button>);
    expect(screen.getByRole('button').className).toContain('text-base');
  });

  it('handles disabled state', () => {
    render(<Button disabled>Disabled</Button>);
    const btn = screen.getByRole('button');

    expect(btn).toBeDisabled();
    expect(btn.className).toContain('opacity-50');
    expect(btn.className).toContain('cursor-not-allowed');
  });

  it('calls onClick handler when clicked', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Action</Button>);

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('merges custom className', () => {
    render(<Button className="my-custom-class">Styled</Button>);
    expect(screen.getByRole('button')).toHaveClass('my-custom-class');
  });
});
