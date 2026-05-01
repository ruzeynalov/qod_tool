import { render, screen } from '@testing-library/react';
import { Sidebar } from './sidebar';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/projects'),
}));

// Mock the auth provider
const mockUseAuth = vi.fn();
vi.mock('@/app/_providers/auth-provider', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Users nav item when isAdmin is true', () => {
    mockUseAuth.mockReturnValue({ isAdmin: true });
    render(<Sidebar collapsed={false} onToggle={() => {}} />);
    expect(screen.getByText('Users')).toBeInTheDocument();
  });

  it('does NOT render Users nav item when isAdmin is false', () => {
    mockUseAuth.mockReturnValue({ isAdmin: false });
    render(<Sidebar collapsed={false} onToggle={() => {}} />);
    expect(screen.queryByText('Users')).not.toBeInTheDocument();
  });

  it('always renders Overview and Projects nav items regardless of role', () => {
    mockUseAuth.mockReturnValue({ isAdmin: false });
    render(<Sidebar collapsed={false} onToggle={() => {}} />);
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
  });
});
