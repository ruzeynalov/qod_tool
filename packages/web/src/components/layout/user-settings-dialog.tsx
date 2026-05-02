'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUpdateUser, useChangePassword } from '@/lib/api/hooks';

const inputClass =
  'w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-base text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent sm:text-sm';

export function UserSettingsDialog({
  open,
  onClose,
  user,
  onProfileUpdate,
}: {
  open: boolean;
  onClose: () => void;
  user: { id: string; email: string; name: string; role: string; orgId: string } | null;
  onProfileUpdate: (updated: { name: string }) => void;
}) {
  const [name, setName] = useState(user?.name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const updateUser = useUpdateUser();
  const changePassword = useChangePassword();

  useEffect(() => {
    if (user) setName(user.name);
  }, [user]);

  if (!user) return null;

  async function handleSaveProfile() {
    try {
      await updateUser.mutateAsync({ id: user!.id, name });
      onProfileUpdate({ name });
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 2000);
    } catch { /* error shown via mutation state */ }
  }

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) return;
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(true);
      setTimeout(() => setPasswordSuccess(false), 2000);
    } catch { /* error shown via mutation state */ }
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader onClose={onClose}>
        <DialogTitle>Account Settings</DialogTitle>
      </DialogHeader>
      <DialogBody className="space-y-6">
        {/* Profile Section */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Profile</h4>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              data-autofocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Email</label>
            <input type="text" value={user.email} disabled className={cn(inputClass, 'opacity-50 cursor-not-allowed')} />
          </div>
          {updateUser.isError && (
            <p className="text-xs text-rag-red">{(updateUser.error as Error)?.message || 'Failed to update profile.'}</p>
          )}
          <div className="flex items-center gap-2">
            <Button onClick={handleSaveProfile} disabled={!name || name === user.name || updateUser.isPending}>
              {updateUser.isPending ? 'Saving...' : 'Save Profile'}
            </Button>
            {profileSuccess && <span className="text-xs text-rag-green">Saved!</span>}
          </div>
        </div>

        {/* Password Section */}
        <div className="space-y-3 border-t border-qod-border pt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Change Password</h4>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Current Password</label>
            <div className="relative">
              <input
                type={showCurrentPw ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className={inputClass}
              />
              <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary">
                {showCurrentPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">New Password</label>
            <div className="relative">
              <input
                type={showNewPw ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 8 characters)"
                className={inputClass}
              />
              <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary">
                {showNewPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className={inputClass}
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="mt-1 text-xs text-rag-red">Passwords do not match</p>
            )}
          </div>
          {changePassword.isError && (
            <p className="text-xs text-rag-red">{(changePassword.error as Error)?.message || 'Failed to change password.'}</p>
          )}
          <div className="flex items-center gap-2">
            <Button
              onClick={handleChangePassword}
              disabled={!currentPassword || !newPassword || newPassword.length < 8 || newPassword !== confirmPassword || changePassword.isPending}
            >
              {changePassword.isPending ? 'Changing...' : 'Change Password'}
            </Button>
            {passwordSuccess && <span className="text-xs text-rag-green">Password changed!</span>}
          </div>
        </div>
      </DialogBody>
    </Dialog>
  );
}
