'use client';

import { useState } from 'react';
import {
  Plus, Pencil, Trash2, ShieldCheck, ShieldOff, KeyRound,
  UserPlus, Users as UsersIcon, X, Copy, Check, ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/app/_providers/auth-provider';
import {
  useUsers,
  useProjects,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useBlockUser,
  useUnblockUser,
  useRegeneratePassword,
  useUserProjects,
  useSetUserProjectAccess,
  useRemoveUserProjectAccess,
} from '@/lib/api/hooks';

// ─── Types ───────────────────────────────────────────────────────────

interface User {
  id: string;
  email: string;
  username?: string;
  name: string;
  role: string;
  blockedAt?: string | null;
}

interface UserProject {
  projectId: string;
  role: string;
}

// ─── Role / Status helpers ───────────────────────────────────────────

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'MEMBER', label: 'Member' },
];


function roleBadgeVariant(role: string) {
  if (role === 'ADMIN') return 'info' as const;
  return 'success' as const;
}

// ─── Reusable Modal ──────────────────────────────────────────────────

function Modal({
  open,
  onClose,
  title,
  children,
  persistent = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  persistent?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={persistent ? undefined : onClose}
    >
      <div className="mx-4 w-full max-w-lg rounded-lg border border-qod-border bg-qod-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-qod-border px-4 py-3">
          <h3 className="text-sm font-semibold text-primary">{title}</h3>
          {!persistent && (
            <button onClick={onClose} className="rounded p-1 text-muted hover:text-primary hover:bg-qod-bg">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

// ─── Input helper ────────────────────────────────────────────────────

const inputClass =
  'w-full rounded-md border border-qod-border bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-qod-accent focus:border-qod-accent';

// ─── Create User Dialog ──────────────────────────────────────────────

function CreateUserDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const createUser = useCreateUser();

  function reset() {
    setEmail('');
    setUsername('');
    setFirstName('');
    setLastName('');
    setRole('MEMBER');
    setGeneratedPassword(null);
    setCopied(false);
    createUser.reset();
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    try {
      const fullName = lastName ? `${firstName} ${lastName}` : firstName;
      const result = await createUser.mutateAsync({ email, username, name: fullName, role });
      setGeneratedPassword(result.password ?? null);
    } catch {
      // error is available via createUser.error
    }
  }

  function handleCopy() {
    if (generatedPassword) {
      navigator.clipboard.writeText(generatedPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Create User" persistent>
      {generatedPassword ? (
        <div className="space-y-4">
          <p className="text-sm text-secondary">
            User created successfully. Share this temporary password with the user:
          </p>
          <div className="flex items-center gap-2 rounded-md border border-qod-border bg-qod-bg px-3 py-2">
            <code className="flex-1 text-sm font-mono text-primary select-all">
              {generatedPassword}
            </code>
            <button onClick={handleCopy} className="text-secondary hover:text-primary">
              {copied ? <Check className="h-4 w-4 text-rag-green" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted">
            This password will not be shown again. Make sure to copy it now.
          </p>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={handleClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@company.com"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="johndoe"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">Last Name <span className="text-muted font-normal">(optional)</span></label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">Role</label>
            <Select options={ROLE_OPTIONS} value={role} onChange={setRole} className="max-w-xs" />
          </div>
          {createUser.isError && (
            <p className="text-xs text-rag-red">
              {(createUser.error as Error)?.message || 'Failed to create user.'}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!email || !username || !firstName || createUser.isPending}
            >
              <UserPlus className="h-4 w-4" />
              {createUser.isPending ? 'Creating...' : 'Create User'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Edit User Dialog ────────────────────────────────────────────────

function EditUserDialog({
  open,
  onClose,
  user,
}: {
  open: boolean;
  onClose: () => void;
  user: User | null;
}) {
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [role, setRole] = useState(user?.role ?? 'MEMBER');

  const updateUser = useUpdateUser();
  const setAccess = useSetUserProjectAccess();
  const removeAccess = useRemoveUserProjectAccess();

  const { data: allProjects } = useProjects();
  const { data: userProjects, refetch: refetchUserProjects } = useUserProjects(user?.id ?? '');

  // Build lookup of project assignments
  const projectAccessMap = new Map<string, string>();
  if (userProjects) {
    for (const up of userProjects as UserProject[]) {
      projectAccessMap.set(up.projectId, up.role);
    }
  }

  // Sync local state when user changes
  if (user && name === '' && email === '' && username === '' && role === 'MEMBER') {
    setName(user.name);
    setEmail(user.email);
    setUsername(user.username ?? '');
    setRole(user.role);
  }

  function handleClose() {
    setName('');
    setEmail('');
    setUsername('');
    setRole('MEMBER');
    updateUser.reset();
    onClose();
  }

  async function handleSave() {
    if (!user) return;
    try {
      await updateUser.mutateAsync({ id: user.id, name, email, username, role });
      handleClose();
    } catch {
      // error available via updateUser.error
    }
  }

  async function handleToggleProject(projectId: string) {
    if (!user) return;
    if (projectAccessMap.has(projectId)) {
      await removeAccess.mutateAsync({ userId: user.id, projectId });
    } else {
      await setAccess.mutateAsync({ userId: user.id, projectId, role: 'MEMBER' });
    }
    refetchUserProjects();
  }

  async function handleChangeProjectRole(projectId: string, newRole: string) {
    if (!user) return;
    await setAccess.mutateAsync({ userId: user.id, projectId, role: newRole });
    refetchUserProjects();
  }

  if (!user) return null;

  return (
    <Modal open={open} onClose={handleClose} title="Edit User">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-secondary mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-secondary mb-1.5">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="johndoe"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-secondary mb-1.5">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-secondary mb-1.5">Role</label>
          <Select options={ROLE_OPTIONS} value={role} onChange={setRole} className="max-w-xs" />
        </div>

        {/* Project Access Section — hidden for admins who have access to all projects */}
        {role === 'ADMIN' ? (
          <div className="rounded-md border border-qod-border bg-qod-bg px-3 py-2.5 text-xs text-secondary">
            Admins have access to all projects by default.
          </div>
        ) : (
          <div>
            <h3 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-2">
              Project Access
            </h3>
            <div className="max-h-48 overflow-y-auto space-y-1 rounded-md border border-qod-border bg-qod-bg p-2">
              {allProjects && allProjects.length > 0 ? (
                allProjects.map((project) => {
                  const isMember = projectAccessMap.has(project.id);
                  return (
                    <div
                      key={project.id}
                      className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-qod-surface"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={isMember}
                          onChange={() => handleToggleProject(project.id)}
                          className="h-3.5 w-3.5 rounded border-qod-border accent-qod-accent"
                        />
                        <span className="text-sm text-primary truncate">{project.name}</span>
                      </div>
                      {isMember && (
                        <Badge variant="success">Member</Badge>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-muted p-2">No projects available.</p>
              )}
            </div>
          </div>
        )}

        {updateUser.isError && (
          <p className="text-xs text-rag-red">
            {(updateUser.error as Error)?.message || 'Failed to update user.'}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name || !email || updateUser.isPending}>
            <Pencil className="h-4 w-4" />
            {updateUser.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Regenerate Password Dialog ──────────────────────────────────────

function RegeneratePasswordDialog({
  open,
  onClose,
  user,
}: {
  open: boolean;
  onClose: () => void;
  user: User | null;
}) {
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const regenerate = useRegeneratePassword();

  function handleClose() {
    setNewPassword(null);
    setCopied(false);
    regenerate.reset();
    onClose();
  }

  async function handleConfirm() {
    if (!user) return;
    try {
      const result = await regenerate.mutateAsync(user.id);
      setNewPassword(result.password);
    } catch {
      // error available via regenerate.error
    }
  }

  function handleCopy() {
    if (newPassword) {
      navigator.clipboard.writeText(newPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (!user) return null;

  return (
    <Modal open={open} onClose={handleClose} title="Regenerate Password">
      {newPassword ? (
        <div className="space-y-4">
          <p className="text-sm text-secondary">
            New password generated for <span className="font-semibold text-primary">{user.email}</span>:
          </p>
          <div className="flex items-center gap-2 rounded-md border border-qod-border bg-qod-bg px-3 py-2">
            <code className="flex-1 text-sm font-mono text-primary select-all">
              {newPassword}
            </code>
            <button onClick={handleCopy} className="text-secondary hover:text-primary">
              {copied ? <Check className="h-4 w-4 text-rag-green" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted">
            This password will not be shown again. Make sure to copy it now.
          </p>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={handleClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-secondary">
            Are you sure you want to regenerate the password for{' '}
            <span className="font-semibold text-primary">{user.email}</span>?
            Their current password will stop working immediately.
          </p>
          {regenerate.isError && (
            <p className="text-xs text-rag-red">
              {(regenerate.error as Error)?.message || 'Failed to regenerate password.'}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button onClick={handleConfirm} disabled={regenerate.isPending}>
              <KeyRound className="h-4 w-4" />
              {regenerate.isPending ? 'Generating...' : 'Regenerate'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Block / Unblock Confirmation Dialog ─────────────────────────────

function BlockDialog({
  open,
  onClose,
  user,
}: {
  open: boolean;
  onClose: () => void;
  user: User | null;
}) {
  const blockUser = useBlockUser();
  const unblockUser = useUnblockUser();

  function handleClose() {
    blockUser.reset();
    unblockUser.reset();
    onClose();
  }

  async function handleConfirm() {
    if (!user) return;
    try {
      if (user.blockedAt) {
        await unblockUser.mutateAsync(user.id);
      } else {
        await blockUser.mutateAsync(user.id);
      }
      handleClose();
    } catch {
      // error available via mutation
    }
  }

  if (!user) return null;

  const isBlocked = user.blockedAt;
  const mutation = isBlocked ? unblockUser : blockUser;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isBlocked ? 'Unblock User' : 'Block User'}
    >
      <div className="space-y-4">
        <p className="text-sm text-secondary">
          {isBlocked ? (
            <>
              Are you sure you want to unblock{' '}
              <span className="font-semibold text-primary">{user.email}</span>?
              They will be able to log in again.
            </>
          ) : (
            <>
              Are you sure you want to block{' '}
              <span className="font-semibold text-primary">{user.email}</span>?
              They will be immediately logged out and unable to access the platform.
            </>
          )}
        </p>
        {mutation.isError && (
          <p className="text-xs text-rag-red">
            {(mutation.error as Error)?.message || `Failed to ${isBlocked ? 'unblock' : 'block'} user.`}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button
            variant={isBlocked ? 'primary' : 'danger'}
            onClick={handleConfirm}
            disabled={mutation.isPending}
          >
            {isBlocked ? (
              <><ShieldCheck className="h-4 w-4" />{mutation.isPending ? 'Unblocking...' : 'Unblock User'}</>
            ) : (
              <><ShieldOff className="h-4 w-4" />{mutation.isPending ? 'Blocking...' : 'Block User'}</>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Delete User Dialog ──────────────────────────────────────────────

function DeleteUserDialog({
  open,
  onClose,
  user,
}: {
  open: boolean;
  onClose: () => void;
  user: User | null;
}) {
  const [confirmText, setConfirmText] = useState('');
  const deleteUser = useDeleteUser();

  function handleClose() {
    setConfirmText('');
    deleteUser.reset();
    onClose();
  }

  async function handleDelete() {
    if (!user || confirmText !== user.email) return;
    try {
      await deleteUser.mutateAsync(user.id);
      handleClose();
    } catch {
      // error available via deleteUser.error
    }
  }

  if (!user) return null;

  return (
    <Modal open={open} onClose={handleClose} title="Delete User">
      <div className="space-y-4">
        <div className="rounded-lg border border-rag-red/20 bg-rag-red/5 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <ShieldAlert className="h-5 w-5 text-rag-red shrink-0 mt-0.5" />
            <p className="text-sm text-secondary">
              This action is <span className="font-semibold text-rag-red">permanent and irreversible</span>.
              All data associated with this user will be deleted.
            </p>
          </div>
          <p className="text-sm text-secondary">
            To confirm, type the user&apos;s email:{' '}
            <span className="font-mono font-semibold text-primary">{user.email}</span>
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type email to confirm..."
            className="w-full rounded-md border border-rag-red/30 bg-qod-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-rag-red focus:border-rag-red"
          />
        </div>
        {deleteUser.isError && (
          <p className="text-xs text-rag-red">
            {(deleteUser.error as Error)?.message || 'Failed to delete user.'}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            disabled={confirmText !== user.email || deleteUser.isPending}
          >
            <Trash2 className="h-4 w-4" />
            {deleteUser.isPending ? 'Deleting...' : 'Delete User Permanently'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Page Component ─────────────────────────────────────────────

export default function UsersPage() {
  const { isAdmin, user: currentUser } = useAuth();
  const { data: users, isLoading } = useUsers();

  // Dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [regenUser, setRegenUser] = useState<User | null>(null);
  const [blockUser, setBlockUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);

  // ── Access Denied ──────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card padding="lg" className="max-w-md text-center">
          <ShieldAlert className="h-12 w-12 text-rag-red mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-primary mb-2">Access Denied</h1>
          <p className="text-sm text-secondary">
            You do not have permission to view this page. User management is restricted to administrators.
          </p>
        </Card>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-primary">User Management</h1>
            <p className="text-sm text-muted mt-0.5">Loading users...</p>
          </div>
        </div>
        <Card padding="lg">
          <div className="animate-pulse space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 rounded bg-qod-border/30" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  const userList = (users ?? []) as User[];

  // ── Page ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-primary flex items-center gap-2">
            <UsersIcon className="h-5 w-5" />
            User Management
          </h1>
          <p className="text-sm text-muted mt-0.5">
            {userList.length} user{userList.length !== 1 ? 's' : ''} in your organization
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          Add User
        </Button>
      </div>

      {/* Users Table */}
      <Card padding="sm" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-qod-border text-left">
                <th className="px-4 py-3 text-xs font-semibold text-secondary uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-secondary uppercase tracking-wider">
                  Username
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-secondary uppercase tracking-wider">
                  Email
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-secondary uppercase tracking-wider">
                  Role
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-secondary uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-secondary uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-qod-border">
              {userList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted">
                    No users found. Create one to get started.
                  </td>
                </tr>
              ) : (
                userList.map((u) => {
                  const isSelf = currentUser?.id === u.id;
                  return (
                    <tr
                      key={u.id}
                      className={cn(
                        'hover:bg-qod-bg/50 transition-colors',
                        u.blockedAt && 'opacity-60',
                      )}
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-primary">{u.name}</span>
                        {isSelf && (
                          <span className="ml-2 text-[10px] text-muted font-medium uppercase">(you)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-secondary">{u.username}</td>
                      <td className="px-4 py-3 text-secondary">{u.email}</td>
                      <td className="px-4 py-3">
                        <Badge variant={roleBadgeVariant(u.role)}>{u.role}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={u.blockedAt ? 'error' : 'success'}>
                          {u.blockedAt ? 'Blocked' : 'Active'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            title="Edit user"
                            onClick={() => setEditUser(u)}
                            className="rounded p-1.5 text-secondary hover:text-primary hover:bg-qod-bg transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            title="Regenerate password"
                            onClick={() => setRegenUser(u)}
                            className="rounded p-1.5 text-secondary hover:text-primary hover:bg-qod-bg transition-colors"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                          </button>
                          {!isSelf && (
                            <>
                              <button
                                title={u.blockedAt ? 'Unblock user' : 'Block user'}
                                onClick={() => setBlockUser(u)}
                                className={cn(
                                  'rounded p-1.5 transition-colors',
                                  u.blockedAt
                                    ? 'text-rag-green hover:text-rag-green hover:bg-rag-green/10'
                                    : 'text-secondary hover:text-rag-amber hover:bg-rag-amber/10',
                                )}
                              >
                                {u.blockedAt ? (
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                ) : (
                                  <ShieldOff className="h-3.5 w-3.5" />
                                )}
                              </button>
                              <button
                                title="Delete user"
                                onClick={() => setDeleteUser(u)}
                                className="rounded p-1.5 text-secondary hover:text-rag-red hover:bg-rag-red/10 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Dialogs */}
      <CreateUserDialog open={showCreate} onClose={() => setShowCreate(false)} />
      <EditUserDialog open={!!editUser} onClose={() => setEditUser(null)} user={editUser} />
      <RegeneratePasswordDialog open={!!regenUser} onClose={() => setRegenUser(null)} user={regenUser} />
      <BlockDialog open={!!blockUser} onClose={() => setBlockUser(null)} user={blockUser} />
      <DeleteUserDialog open={!!deleteUser} onClose={() => setDeleteUser(null)} user={deleteUser} />
    </div>
  );
}
