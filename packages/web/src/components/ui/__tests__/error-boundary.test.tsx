import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '@/components/ui/error-boundary';

function ProblemChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>Child content</div>;
}

// Suppress console.error for expected error boundary logs
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const msg = typeof args[0] === 'string' ? args[0] : '';
    if (msg.includes('Error: Uncaught') || msg.includes('The above error')) return;
    originalError.call(console, ...args);
  };
});
afterAll(() => {
  console.error = originalError;
});

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Safe content</div>
      </ErrorBoundary>,
    );

    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });

  it('shows default fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test error')).toBeInTheDocument();
  });

  it('shows custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('calls onError callback when an error is caught', () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Test error' }),
      expect.objectContaining({ componentStack: expect.any(String) }),
    );
  });

  it('resets and re-renders children when Try again is clicked', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Rerender with a non-throwing child before clicking retry
    rerender(
      <ErrorBoundary>
        <ProblemChild shouldThrow={false} />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByText('Try again'));

    expect(screen.getByText('Child content')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('displays a generic message when the error has no message', () => {
    function ThrowEmpty() {
      throw new Error('');
    }

    render(
      <ErrorBoundary>
        <ThrowEmpty />
      </ErrorBoundary>,
    );

    expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument();
  });
});
