import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './auth-provider';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('isAdmin is false when user is null', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('isAdmin is true when user role is ADMIN', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => {
      result.current.login('token', { id: '1', email: 'a@b.com', name: 'Admin', role: 'ADMIN', orgId: 'o1' });
    });
    expect(result.current.isAdmin).toBe(true);
  });

  it('isAdmin is false when user role is MEMBER', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => {
      result.current.login('token', { id: '1', email: 'a@b.com', name: 'Member', role: 'MEMBER', orgId: 'o1' });
    });
    expect(result.current.isAdmin).toBe(false);
  });

  it('login persists token and user to localStorage', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    const user = { id: '1', email: 'a@b.com', name: 'Test', role: 'ADMIN', orgId: 'o1' };
    act(() => {
      result.current.login('my-token', user);
    });
    expect(localStorageMock.setItem).toHaveBeenCalledWith('qod-auth-token', 'my-token');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('qod-auth-user', JSON.stringify(user));
  });

  it('logout clears token and user from localStorage', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => {
      result.current.login('my-token', { id: '1', email: 'a@b.com', name: 'Test', role: 'ADMIN', orgId: 'o1' });
    });
    act(() => {
      result.current.logout();
    });
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('qod-auth-token');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('qod-auth-user');
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isAdmin).toBe(false);
  });
});
