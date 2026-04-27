import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NotificationBell } from './notification-bell';

const mockPush = vi.fn();
const mockUseNotifications = vi.fn();
const mockUseUnreadNotificationCount = vi.fn();
const mockUseMarkNotificationRead = vi.fn();
const mockUseMarkAllNotificationsRead = vi.fn();
const mockUseDemoMode = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/lib/api/hooks', () => ({
  useNotifications: () => mockUseNotifications(),
  useUnreadNotificationCount: () => mockUseUnreadNotificationCount(),
  useMarkNotificationRead: () => mockUseMarkNotificationRead(),
  useMarkAllNotificationsRead: () => mockUseMarkAllNotificationsRead(),
}));

vi.mock('@/app/_providers/demo-mode-provider', () => ({
  useDemoMode: () => mockUseDemoMode(),
}));

describe('NotificationBell', () => {
  function renderBell() {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined as never);

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationBell />
      </QueryClientProvider>,
    );

    return { invalidateSpy };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDemoMode.mockReturnValue({ demoMode: false });
    mockUseMarkNotificationRead.mockReturnValue({ mutate: vi.fn() });
    mockUseMarkAllNotificationsRead.mockReturnValue({ mutate: vi.fn() });
    mockUseUnreadNotificationCount.mockReturnValue({ data: { count: 2 } });
    mockUseNotifications.mockReturnValue({
      data: [
        {
          id: 'notif-1',
          projectId: 'project-1',
          title: 'Coverage dropped',
          body: 'Automation coverage fell below threshold.',
          read: false,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'notif-2',
          projectId: 'project-1',
          title: 'Already read',
          body: 'This notification was already read.',
          read: true,
          createdAt: new Date().toISOString(),
        },
      ],
    });
  });

  it('shows unread count and lets the user mark all notifications as read', () => {
    const markAllRead = { mutate: vi.fn() };
    mockUseMarkAllNotificationsRead.mockReturnValue(markAllRead);

    renderBell();

    fireEvent.click(screen.getByTitle('Notifications'));

    expect(screen.getByText('2')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Mark all read'));

    expect(markAllRead.mutate).toHaveBeenCalledTimes(1);
  });

  it('marks unread notifications as read, refreshes the log cache, and navigates to the alert log row', async () => {
    const markRead = { mutate: vi.fn() };
    mockUseMarkNotificationRead.mockReturnValue(markRead);

    const { invalidateSpy } = renderBell();

    fireEvent.click(screen.getByTitle('Notifications'));
    fireEvent.click(screen.getByText('Coverage dropped'));

    expect(markRead.mutate).toHaveBeenCalledWith('notif-1');
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notification-log'] });
    });
    expect(mockPush).toHaveBeenCalledWith('/projects/project-1/alerts#alert-log-notif-1');
    expect(screen.queryByText('Mark all read')).not.toBeInTheDocument();
  });

  it('navigates read notifications without re-marking them but still refreshes the log cache', async () => {
    const markRead = { mutate: vi.fn() };
    mockUseMarkNotificationRead.mockReturnValue(markRead);

    const { invalidateSpy } = renderBell();

    fireEvent.click(screen.getByTitle('Notifications'));
    fireEvent.click(screen.getByText('Already read'));

    expect(markRead.mutate).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notification-log'] });
    });
    expect(mockPush).toHaveBeenCalledWith('/projects/project-1/alerts#alert-log-notif-2');
  });
});
