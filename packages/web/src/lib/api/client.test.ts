import { apiClient } from './client';

describe('apiClient', () => {
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
      removeItem: vi.fn((key: string) => { delete store[key]; }),
      clear: vi.fn(() => { store = {}; }),
    };
  })();

  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { value: localStorageMock });
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('omits Content-Type for empty-body requests while still attaching auth', async () => {
    localStorageMock.setItem('qod-auth-token', 'test-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ count: 3 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiClient<{ count: number }>('/api/v1/notifications/read-all', {
      method: 'POST',
    });

    // API_BASE defaults to '' (same-origin) in production builds — see
    // 7565386. Tests run without `NEXT_PUBLIC_API_URL` set so the fetched
    // URL is just the relative path.
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/notifications/read-all',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer test-token' },
      }),
    );
    expect(result).toEqual({ count: 3 });
  });

  it('sends Content-Type when a JSON body is present', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 'rule-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await apiClient<{ id: string }>('/api/v1/projects/project-1/alerts', {
      method: 'POST',
      body: JSON.stringify({ metric: 'COVERAGE_PCT' }),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/projects/project-1/alerts',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
});
