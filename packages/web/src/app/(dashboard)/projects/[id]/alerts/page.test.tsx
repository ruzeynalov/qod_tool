import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AlertRulesPage from './page';

const mockUseParams = vi.fn();
const mockUseDemoMode = vi.fn();
const mockUseAuth = vi.fn();
const mockUseAlertRules = vi.fn();
const mockUseCreateAlertRule = vi.fn();
const mockUseUpdateAlertRule = vi.fn();
const mockUseDeleteAlertRule = vi.fn();
const mockUseNotificationLog = vi.fn();
const mockUseMarkNotificationRead = vi.fn();
const mockUseMuteAlertFromNotification = vi.fn();
const mockUseUnmuteAlertFromNotification = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => mockUseParams(),
}));

vi.mock('@/app/_providers/demo-mode-provider', () => ({
  useDemoMode: () => mockUseDemoMode(),
}));

vi.mock('@/app/_providers/auth-provider', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/lib/api/hooks', () => ({
  useAlertRules: (...args: unknown[]) => mockUseAlertRules(...args),
  useCreateAlertRule: (...args: unknown[]) => mockUseCreateAlertRule(...args),
  useUpdateAlertRule: (...args: unknown[]) => mockUseUpdateAlertRule(...args),
  useDeleteAlertRule: (...args: unknown[]) => mockUseDeleteAlertRule(...args),
  useNotificationLog: (...args: unknown[]) => mockUseNotificationLog(...args),
  useMarkNotificationRead: () => mockUseMarkNotificationRead(),
  useMuteAlertFromNotification: () => mockUseMuteAlertFromNotification(),
  useUnmuteAlertFromNotification: () => mockUseUnmuteAlertFromNotification(),
}));

describe('AlertRulesPage', () => {
  const createRule = { mutateAsync: vi.fn(), isPending: false, isError: false, error: null };
  const updateRule = { mutateAsync: vi.fn(), isPending: false, isError: false, error: null };
  const deleteRule = { mutateAsync: vi.fn(), isPending: false, isError: false, error: null };
  const markRead = { mutate: vi.fn(), isPending: false };
  const mute = { mutate: vi.fn(), isPending: false };
  const unmute = { mutate: vi.fn(), isPending: false };

  const baseRules = [
    {
      id: 'rule-1',
      projectId: 'project-1',
      metric: 'COVERAGE_PCT',
      condition: 'LESS_THAN',
      threshold: 80,
      channel: 'IN_APP',
      channelConfig: {},
      enabled: true,
      lastTriggered: null,
      createdAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    mockUseParams.mockReturnValue({ id: 'project-1' });
    mockUseDemoMode.mockReturnValue({ demoMode: false });
    mockUseAuth.mockReturnValue({ isAdmin: true });
    mockUseAlertRules.mockReturnValue({ data: baseRules, isLoading: false, error: null });
    mockUseCreateAlertRule.mockReturnValue(createRule);
    mockUseUpdateAlertRule.mockReturnValue(updateRule);
    mockUseDeleteAlertRule.mockReturnValue(deleteRule);
    mockUseNotificationLog.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 10 },
      isLoading: false,
    });
    mockUseMarkNotificationRead.mockReturnValue(markRead);
    mockUseMuteAlertFromNotification.mockReturnValue(mute);
    mockUseUnmuteAlertFromNotification.mockReturnValue(unmute);
  });

  it('renders alerts in read-only mode for members', () => {
    mockUseAuth.mockReturnValue({ isAdmin: false });

    render(<AlertRulesPage />);

    expect(screen.queryByText('Create Rule')).not.toBeInTheDocument();
    expect(screen.getByText('Read-only')).toBeInTheDocument();
  });

  it('shows the demo warning instead of opening the create modal in demo mode', () => {
    vi.useFakeTimers();
    mockUseDemoMode.mockReturnValue({ demoMode: true });

    render(<AlertRulesPage />);

    fireEvent.click(screen.getByText('Create Rule'));

    expect(screen.getByText('Mutations are disabled in demo mode')).toBeInTheDocument();
    expect(createRule.mutateAsync).not.toHaveBeenCalled();
  });

  it('converts MTTR thresholds between stored hours and displayed days when editing', async () => {
    mockUseAlertRules.mockReturnValue({
      data: [
        {
          id: 'rule-2',
          projectId: 'project-1',
          metric: 'MTTR_HOURS',
          condition: 'LESS_THAN',
          threshold: 48,
          channel: 'IN_APP',
          channelConfig: {},
          enabled: true,
          lastTriggered: null,
          createdAt: new Date().toISOString(),
        },
      ],
      isLoading: false,
      error: null,
    });
    updateRule.mutateAsync.mockResolvedValue(undefined);

    render(<AlertRulesPage />);

    fireEvent.click(screen.getByTitle('Edit rule'));

    const thresholdInput = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(thresholdInput.value).toBe('2');

    fireEvent.change(thresholdInput, { target: { value: '3' } });
    fireEvent.click(screen.getByText('Update Rule'));

    await waitFor(() => {
      expect(updateRule.mutateAsync).toHaveBeenCalledWith({
        id: 'rule-2',
        metric: 'MTTR_HOURS',
        condition: 'LESS_THAN',
        threshold: 72,
        channel: 'IN_APP',
        channelConfig: {},
        enabled: true,
      });
    });
  });

  it('debounces alert-log search and maps metric labels back to backend metric enums', async () => {
    vi.useFakeTimers();

    render(<AlertRulesPage />);

    const searchInput = screen.getByPlaceholderText('Search alert text (3+ chars)...');
    fireEvent.change(searchInput, { target: { value: 'Def' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockUseNotificationLog).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 10,
      search: 'Def',
      projectId: 'project-1',
      metrics: ['ESCAPE_RATE', 'DEFECT_DENSITY'],
    });
  });

  it('lets users mark log rows as read and mute them', () => {
    mockUseNotificationLog.mockReturnValue({
      data: {
        items: [
          {
            id: 'notif-1',
            userId: 'user-1',
            projectId: 'project-1',
            title: 'Coverage dropped',
            body: 'Automation coverage fell below threshold.',
            link: null,
            read: false,
            muted: false,
            createdAt: new Date().toISOString(),
            alertRule: {
              id: 'rule-1',
              metric: 'COVERAGE_PCT',
              condition: 'LESS_THAN',
              threshold: 80,
              enabled: true,
            },
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
      },
      isLoading: false,
    });

    render(<AlertRulesPage />);

    fireEvent.click(screen.getByTitle('Mark as read'));
    fireEvent.click(screen.getByTitle('Mute (hide from bell, keep in log)'));

    expect(markRead.mutate).toHaveBeenCalledWith('notif-1');
    expect(mute.mutate).toHaveBeenCalledWith('notif-1');
  });
});
