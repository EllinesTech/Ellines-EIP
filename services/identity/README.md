# Identity Service

Authentication, organization management, and role-based access control.

## Responsibilities

- User registration and authentication (JWT)
- Organization and branch management
- Role-Based Access Control (RBAC)
- Multi-Factor Authentication (MFA) — v1.1
- Single Sign-On (SSO) — v1.1
- Session management

## Port

`3001` (default)

## Core Entities

- `Organization` — top-level tenant
- `Branch` — multi-site operations
- `Department` — business units
- `User` — authenticated identity
- `Role` — permission sets
- `Permission` — granular access control

## API Endpoints (planned)

```
POST   /auth/login
POST   /auth/register
POST   /auth/refresh
GET    /orgs
POST   /orgs
GET    /orgs/:id/users
POST   /orgs/:id/users
GET    /orgs/:id/roles
```

## Status

🔲 Not yet implemented — Phase 1 (Priority P0)
