# Database Configuration Guide

**Date:** 2026-08-06  
**Product:** Ellines EIP v1.0+  
**Feature:** Multi-Database Support (Sprint 13-14)

---

## Overview

Ellines EIP now supports organizations choosing their own database deployment model:

| Model | Use Case | Setup Time | Cost | Control |
|-------|----------|-----------|------|---------|
| **Local PostgreSQL** | Development, on-premise | 10 min | Free | Full |
| **Supabase (Cloud)** | Accessible from anywhere | 5 min | Free tier available | Shared infrastructure |
| **Custom PostgreSQL** | Self-hosted on VPS | 20 min | VPS cost | Full |

**Key benefit:** No code deployment needed to switch databases. Admin clicks one button, system automatically routes all queries to the new database.

---

## For IT Administrators

### Access Database Configuration

1. Log in as **Owner** or **IT Admin**
2. Go to **Settings** (top right menu)
3. Scroll to **📦 Database Configuration** section
4. You'll see:
   - Currently active database (badge: `✅ Active Database`)
   - List of configured databases
   - Option to add new configurations

### Local PostgreSQL Setup (Windows/Mac/Linux)

**Prerequisites:** PostgreSQL 12+ installed

**Step 1: Create a local database**

```bash
# On your machine (Windows, Mac, or Linux)
createdb -U postgres ellines_eip_local
# or specify different port:
createdb -U postgres -p 5433 ellines_eip_local
```

**Step 2: Add to Ellines EIP**

1. In **Database Configuration** section, click **+ Add Configuration**
2. Fill in:
   - **Configuration Name:** e.g., "Local Development DB" or "Ubuntu Server DB"
   - **Database Type:** Choose `🖥️ Local PostgreSQL (on-premise)`
   - Click **🔗 Test Connection** (should succeed)
   - Click **✅ Create Configuration**

**Step 3: Switch to this database** (optional)

1. Click **Set as Primary** button on your new config
2. Confirm in dialog
3. All new queries use this database
4. ✅ Status shows "Active Database"

### Supabase Cloud Setup

**Prerequisites:** Free account at https://supabase.com

**Step 1: Create Supabase project**

1. Go to https://supabase.com
2. Sign up (free tier allows 2 projects)
3. Click **+ New Project**
4. Fill in:
   - Project name
   - Database password (save it!)
   - Region (pick closest to you)
5. Wait for provisioning (~2 mins)
6. Navigate to **Settings → Database**
7. Copy the **Connection String** (looks like `postgresql://...@...`)

**Step 2: Add to Ellines EIP**

1. In **Database Configuration**, click **+ Add Configuration**
2. Fill in:
   - **Configuration Name:** e.g., "Supabase Production"
   - **Database Type:** `☁️ Supabase (cloud)`
   - **Supabase Project URL:** Paste the connection string
   - **Supabase API Key:** Copy from Supabase **Settings → API**
   - Click **🔗 Test Connection**
   - Click **✅ Create Configuration**

**Step 3: Switch to Supabase** (optional)

1. Click **Set as Primary** button
2. All queries route to Supabase
3. Data accessible from anywhere

### Custom PostgreSQL on VPS

**Prerequisites:** PostgreSQL running on a VPS or managed database service

**Step 1: Get connection details**

From your VPS/database provider, collect:
- **Host:** e.g., `192.168.1.50` or `db.example.com`
- **Port:** Usually `5432`
- **Username:** e.g., `postgres` or your user
- **Password:** Your database password
- **Database Name:** e.g., `ellines_eip`

**Step 2: Add to Ellines EIP**

1. Click **+ Add Configuration**
2. Fill in:
   - **Configuration Name:** e.g., "Ubuntu Server on LAN"
   - **Database Type:** `🔧 Custom PostgreSQL Server`
   - **Host:** Your server IP or hostname
   - **Port:** Usually 5432
   - **Username:** Postgres user
   - **Password:** Database password
   - **Database Name:** Your database name
   - Click **🔗 Test Connection**
   - Click **✅ Create Configuration**

**Step 3: Grant network access** (if needed)

If test fails with "connection refused":

- **On Ubuntu/Linux:**
  ```bash
  sudo nano /etc/postgresql/16/main/postgresql.conf
  # Find: listen_addresses = 'localhost'
  # Change to: listen_addresses = '*'
  
  sudo nano /etc/postgresql/16/main/pg_hba.conf
  # Add: host    all    all    0.0.0.0/0    md5
  
  sudo systemctl restart postgresql
  ```

- **Firewall:**
  ```bash
  # Ubuntu UFW
  sudo ufw allow 5432/tcp
  ```

### Switching Between Databases

**Warning:** Switching databases affects all users immediately.

1. Go to **Settings → Database Configuration**
2. Find the config you want to activate
3. Click **Set as Primary** button
4. Read confirmation dialog carefully
5. Click **Confirm**
6. ✅ New database is now active
7. All new queries use the new database
8. Existing connections will switch on next request

**What happens to old data?**
- Old data stays in the old database (not moved)
- New queries use the new database
- If you switch back, old data is still there
- To migrate data, see "Data Migration" below

### Audit Log

All database switches are logged for compliance:

1. Click on a config card
2. See **Last switched:** date and reason
3. View full audit trail in **Audit Center** (Settings)

---

## For Developers

### How It Works (Architecture)

```
Request with JWT
    ↓
DatabaseContextInterceptor (NestJS)
    ↓
Look up org from JWT → Load primary DB config
    ↓
Store in request.dbContext
    ↓
All queries use the configured database
    ↓
Response to client
```

### Implementation Details

**Configuration stored in database:**

```prisma
model DatabaseConfiguration {
  id           String    @id @default(cuid())
  organizationId String
  name         String    // e.g., "Local Dev", "Supabase Prod"
  type         String    // local | supabase | custom_postgres
  host         String?   // localhost or server IP
  port         Int       // 5432
  databaseName String?   // Database name
  username     String?
  password     String    // Encrypted at rest (TODO)
  isPrimary    Boolean   @default(false)
  isActive     Boolean   @default(true)
  
  // Audit fields
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

model DatabaseSwitchLog {
  id             String    @id @default(cuid())
  organizationId String
  configId       String
  fromDatabase   String
  toDatabase     String
  reason         String
  switchedAt     DateTime
}
```

**Query switching in action:**

```typescript
// In any NestJS service or repository

constructor(
  private prisma: PrismaService,
  private dbSwitcher: DatabaseSwitcherService,
) {}

async getUsers(organizationId: string) {
  // Get the primary database for this org
  const dbConfig = await this.dbSwitcher.getActiveDatabase(organizationId);
  
  // All Prisma queries automatically use this database
  // because PrismaService is configured with that connection
  return this.prisma.user.findMany({
    where: { organizationId },
  });
}
```

### Adding Support to a New Endpoint

To add database configuration support to a new endpoint:

1. **NestJS controller:** Use `@UseGuards(RolesGuard)` with `@Roles(OWNER, IT_ADMIN)`
2. **Service:** Call `this.dbSwitcher.getActiveDatabase(orgId)` to get current DB
3. **Prisma queries:** Use normally, they'll automatically use the switched database

### Security Considerations

**Passwords in database:**

⚠️ **Current:** Passwords stored as BASE64 (not secure)  
✅ **TODO:** Encrypt with org's encryption key

Until encryption is implemented:
- Never expose passwords in API responses
- Only show masked preview: `••••••••`
- Full password only shown once after creation

**Database access control:**

- Only Owner/IT Admin can configure databases
- Switch reasons are audit logged
- All changes tracked in `DatabaseSwitchLog`

### Connection Pooling

**Current approach (development):**
- Single PrismaService shared by all requests
- DATABASE_URL environment variable points to primary DB
- Each request knows which DB to use via request.dbContext

**Future enhancement (production):**
- Maintain pool of PrismaClient instances
- One per active organization database
- Switch client per request based on dbContext
- Requires careful lifecycle management

### Testing Database Switching

**Local test setup:**

```bash
# Create two test databases
createdb -p 5432 test_db_1
createdb -p 5433 test_db_2

# Seed test data (optional)
psql -p 5432 -d test_db_1 -f seed.sql
psql -p 5433 -d test_db_2 -f seed.sql

# Add both to Ellines EIP via Settings
# Switch between them and verify data persistence
```

**Verification checklist:**

- [ ] Created org on Database 1
- [ ] Can see org data on Database 1
- [ ] Switched to Database 2
- [ ] Org appears on Database 2 with same data
- [ ] Switched back to Database 1
- [ ] Original data still present
- [ ] Audit log shows 2 switches

---

## Troubleshooting

### "Connection refused" Error

**Cause:** Server is not reachable or port is wrong

**Solutions:**
```bash
# Test connectivity from your machine
telnet 192.168.1.50 5432
# or
nc -zv 192.168.1.50 5432

# Check if PostgreSQL is running on the server
ssh user@server
sudo systemctl status postgresql

# Check listen address
sudo grep "^listen_addresses" /etc/postgresql/*/main/postgresql.conf
```

### "Authentication failed" Error

**Cause:** Wrong username/password

**Solutions:**
```bash
# Test password locally on the server
psql -U postgres -d ellines_eip

# Reset password if needed
sudo -u postgres psql
postgres=# ALTER USER postgres WITH PASSWORD 'newpassword';
```

### "Database does not exist" Error

**Cause:** Database name is wrong or not created

**Solutions:**
```bash
# List databases
psql -l

# Create database if missing
createdb -U postgres ellines_eip
```

### Switching Database Didn't Take Effect

**Cause:** Client might have cached connection

**Solutions:**
1. Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)
2. Log out and log back in
3. Check that config is marked as Primary (blue badge)
4. Wait 30 seconds (connection pool might need refresh)

### Data Lost After Switch

**Cause:** Might be on wrong database if switched

**Solutions:**
```bash
# Check which database is marked as primary
# In Ellines EIP: Settings → Database Configuration

# Manually verify data in each database
psql -p 5432 -d test_db_1 -c "SELECT COUNT(*) FROM \"User\";"
psql -p 5433 -d test_db_2 -c "SELECT COUNT(*) FROM \"User\";"

# If on wrong database, switch back
```

---

## Security Best Practices

### For Production Deployments

1. **Use Supabase or managed database service**
   - Automated backups
   - Encryption at rest
   - Access control
   - Compliance certifications

2. **Encrypt passwords in Ellines EIP**
   - Don't store plaintext passwords
   - Use org's encryption key
   - Rotate keys regularly

3. **Network security**
   - Use VPN or private network for self-hosted databases
   - Never expose database ports to public internet
   - Use firewall rules to restrict access

4. **Audit and monitoring**
   - Enable PostgreSQL query logging
   - Monitor database for unusual activity
   - Review Ellines EIP audit trail regularly

5. **Backup strategy**
   - Automated backups to separate location
   - Test backup restoration regularly
   - Retention policy: At least 30 days

### For Development

- Use localhost or local network only
- Non-production passwords acceptable
- Refresh test data regularly
- No production data in dev databases

---

## FAQ

**Q: Can I use the same database for multiple organizations?**  
A: Yes, configure the same database once per org in Settings → Database Configuration. Each org can mark it as primary independently.

**Q: What happens to my data when I switch databases?**  
A: Data stays in both databases independently. New queries go to the new database. Old data remains in the old database. No automatic migration.

**Q: Can I migrate data between databases?**  
A: Yes, manually or with tools like `pg_dump` / `pg_restore`. Contact support for assistance.

**Q: Can I have a backup database?**  
A: Yes, add multiple configurations. Only one is marked Primary at a time. To switch, click "Set as Primary".

**Q: How often can I switch databases?**  
A: As often as needed. Each switch is logged. Recommended: Not more than once per minute.

**Q: Is there a trial period for Supabase?**  
A: Yes, free tier includes: 2 projects, 500MB storage, real-time subscriptions, and more. Upgrades available anytime.

**Q: Will switching databases cause downtime?**  
A: No. The switch is instant and does not restart services. Existing connections might need to reconnect.

**Q: Can I automate database switching?**  
A: Currently: Manual via Settings UI. Future: API endpoint for automation.

**Q: What's the maximum data size?**  
A: Depends on your database provider. Local: Limited by disk space. Supabase free: 500MB. Paid plans: Up to terabytes.

**Q: How long does it take to switch databases?**  
A: Instant. All queries use the new database immediately.

**Q: Is my data encrypted?**  
A: Data at rest in PostgreSQL databases: Depends on configuration. In transit: Use SSL/TLS with production databases. Passwords in Ellines EIP: Currently BASE64 (upgrade planned).

---

## Related Documentation

- [Ellines EIP README](../README.md) - Setup and architecture
- [Sprint 13 Follow-up Checklist](./15_Sprint_13_Followup_Checklist.md) - Implementation guide
- [Build Queue](./05_Build_Queue.md) - Current development status

---

**Last updated:** 2026-08-06  
**For questions:** See AGENTS.md or contact the development team
