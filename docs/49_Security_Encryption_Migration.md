# EIP Security — Credential Encryption Migration

**Status:** Implementation in progress  
**Branch:** `eip/repository-audit-foundation`

## Required secret

Production must provide:

`EIP_ENCRYPTION_MASTER_KEY`

Requirements:

- minimum 32 UTF-8 bytes;
- stored only in the platform secret manager/environment;
- never stored in the database;
- never returned by an API;
- never logged;
- different environments must use different secrets.

## Encryption format

Current format is version 2:

- AES-256-GCM;
- random IV per value;
- master-key-backed per-organization key derivation;
- organization ID authenticated as additional context;
- explicit version field;
- fail-closed on missing keys, malformed envelopes, authentication failure, or unsupported versions.

## Legacy migration

The repository previously had two unsafe/legacy patterns:

1. organization-ID-derived encryption without a platform master secret;
2. Base64 used as an encryption fallback.

New writes never use either pattern.

The migration endpoint is:

`POST /api/v1/platform/security/migrate-encryption`

Supported modes:

- `dryRun: true` — validate and report migration candidates without writing;
- `dryRun: false` — migrate database credential fields to version 2.

Optional scope:

`organizationId`

Migration output contains counts and non-secret failure metadata only.

## Operational sequence

1. Configure `EIP_ENCRYPTION_MASTER_KEY` in the deployment environment.
2. Run the migration in dry-run mode.
3. Review failures.
4. Run the migration.
5. Verify database configurations can be decrypted by the current service.
6. Remove any remaining legacy credentials after verification.
7. Rotate the master key only through a future versioned key-rotation workflow; never replace it casually.

## Security rules

- No Base64 fallback.
- No plaintext fallback.
- No default development secret in production paths.
- Do not log plaintext credentials.
- Do not include credentials in audit metadata.
- Decryption failures must fail closed.
- Privileged migrations must be audited.

