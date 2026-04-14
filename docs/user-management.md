# User Management & Role-Based Access Control

QOD supports multiple users with role-based access control. An admin user manages the user lifecycle (create, edit, block, delete) and controls which projects each member can access.

## Roles

QOD uses a two-level role system:

| Role | Scope | Capabilities |
|------|-------|-------------|
| **ADMIN** | Global | Full access: manage users, configure all projects, modify settings, trigger sync |
| **MEMBER** | Global + per-project | View dashboards and KPIs for assigned projects, trigger connector sync, read-only access to settings |

Admins have implicit access to all projects. Members must be explicitly assigned to projects.

## Default Users (Seed)

After running `npm run db:seed` or starting via Docker, two users are created: an ADMIN and a MEMBER. Credentials are defined in `packages/api/src/database/seeds/seed.ts`. The member user is pre-assigned to the "E-Commerce Platform" and "Mobile Banking App" demo projects.

## Authentication

### Login

Users can sign in with either their **email** or **username** at `/login`. The backend resolves the login identifier automatically.

- **POST** `/api/v1/auth/login` accepts `{ login, password }` where `login` is an email or username.
- Returns `{ accessToken, refreshToken, user }`.
- Access tokens expire after 8 hours; refresh tokens after 7 days.

### Token Verification

Every authenticated request includes a JWT in the `Authorization: Bearer <token>` header. The `AuthGuard` verifies the token and checks if the user is blocked on each request.

### Blocked Users

Blocked users cannot log in or use existing tokens. The block takes effect immediately:
- `validateUser()` rejects blocked users at login
- `AuthGuard` rejects blocked users on every authenticated request

## User Management (Admin)

Admins access user management via the **Users** link in the sidebar (hidden for members).

### Available Actions

| Action | Endpoint | Description |
|--------|----------|-------------|
| **Create user** | `POST /api/v1/users` | Creates a user with email, username, name, and role. A random password is generated and shown once. |
| **Edit user** | `PATCH /api/v1/users/:id` | Update name, username, email, or role. Admins cannot demote themselves. |
| **Block/Unblock** | `POST /api/v1/users/:id/block` | Immediately prevents the user from logging in or using existing tokens. |
| **Regenerate password** | `POST /api/v1/users/:id/regenerate-password` | Generates a new random password. The plaintext is returned once. |
| **Delete user** | `DELETE /api/v1/users/:id` | Permanently removes the user. |

### Project Access

From the Edit User dialog, admins can toggle which projects a member has access to. Members only see projects they are assigned to in the project list and cannot navigate to unassigned projects.

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/users/:id/projects` | List user's project memberships |
| `PUT /api/v1/users/:id/projects/:projectId` | Assign user to a project |
| `DELETE /api/v1/users/:id/projects/:projectId` | Remove user from a project |

## Self-Service (All Users)

All users can manage their own account via **Settings** in the user avatar dropdown menu (top-right header).

| Feature | Details |
|---------|---------|
| **Edit name** | Update display name, save via `PATCH /api/v1/users/:id` |
| **Change password** | Requires current password. New password must be 8+ characters. Endpoint: `POST /api/v1/users/me/change-password` |

## Access Control Matrix

| Feature | ADMIN | MEMBER |
|---------|-------|--------|
| View dashboards (KPIs, coverage, runs, defects) | All projects | Assigned projects only |
| Trigger connector sync | Yes | Yes |
| Create/edit/delete connectors | Yes | No (read-only) |
| Modify KPI thresholds | Yes | No (read-only) |
| Edit project settings (name, retention, delete) | Yes | No (read-only) |
| Manage users (create, edit, block, delete) | Yes | No (not visible) |
| Configure project access | Yes | No |
| Change own password | Yes | Yes |
| Edit own name | Yes | Yes |

## Settings Page Behavior

- **ADMIN**: Full interactive access to all settings tabs (Connectors, KPI Thresholds, General).
- **MEMBER on Connectors tab**: Can view configured connectors and trigger sync. Cannot add, edit, delete, pause, export, or import connectors. An informational banner reads: *"Connector configuration is read-only. You can trigger sync for configured connectors."*
- **MEMBER on other tabs**: Fully read-only with a dimmed overlay. Banner reads: *"Settings are read-only. Only administrators can modify settings."*

## Database Schema

The `User` model includes:

```
id        UUID (primary key)
email     String (unique)
username  String (unique)
name      String
role      GlobalRole (ADMIN | MEMBER)
password  String (scrypt hash with salt)
blockedAt DateTime? (null = active)
orgId     UUID (organization)
```

Project membership is managed via `ProjectMember`:

```
projectId  UUID
userId     UUID
role       ProjectRole (MEMBER)
@@unique([projectId, userId])
```

## API Endpoints Summary

### Auth
- `POST /api/v1/auth/login` - Login with email or username
- `POST /api/v1/auth/refresh` - Refresh access token

### User Management (Admin only except where noted)
- `GET /api/v1/users` - List all users in organization
- `GET /api/v1/users/:id` - Get user by ID
- `POST /api/v1/users` - Create user (admin)
- `PATCH /api/v1/users/:id` - Update user (admin for role/email/username, self for name)
- `DELETE /api/v1/users/:id` - Delete user (admin)
- `POST /api/v1/users/:id/block` - Block user (admin)
- `POST /api/v1/users/:id/unblock` - Unblock user (admin)
- `POST /api/v1/users/:id/regenerate-password` - Regenerate password (admin)
- `POST /api/v1/users/me/change-password` - Change own password (any user)

### Project Access (Admin only)
- `GET /api/v1/users/:id/projects` - List user's projects
- `PUT /api/v1/users/:id/projects/:projectId` - Assign project access
- `DELETE /api/v1/users/:id/projects/:projectId` - Remove project access
