import { render, screen } from '@testing-library/react';
import { Card } from '@/components/ui/card';

describe('Card', () => {
  it('renders children content', () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('applies default medium padding', () => {
    const { container } = render(<Card>Content</Card>);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass('p-4');
  });

  it('applies small padding variant', () => {
    const { container } = render(<Card padding="sm">Content</Card>);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass('p-3');
  });

  it('applies large padding variant', () => {
    const { container } = render(<Card padding="lg">Content</Card>);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass('p-6');
  });

  it('has base styling classes (border, rounded)', () => {
    const { container } = render(<Card>Styled</Card>);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass('border');
    expect(el).toHaveClass('rounded-lg');
  });

  it('merges custom className', () => {
    const { container } = render(<Card className="mt-4">Custom</Card>);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass('mt-4');
    expect(el).toHaveClass('rounded-lg');
  });

  it('renders nested elements', () => {
    render(
      <Card>
        <h2>Title</h2>
        <p>Description</p>
      </Card>,
    );

    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
  });
});
