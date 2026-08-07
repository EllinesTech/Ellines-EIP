# Sprint 14 Local Database Testing Guide

**Date:** 2026-08-06  
**Purpose:** Verify multi-database configuration works locally without full web build

---

## Quick Start: Test Database Switching

### Prerequisites
- PostgreSQL 12+ installed and accessible on your machine
- Ellines EIP repository cloned
- NestJS Identity service can run (or use Supabase for auth)

### Step 1: Create Two Local PostgreSQL Databases

```bash
# Create test database 1 (default port 5432)
createdb -U postgres ellines_eip_local_test1

# Create test database 2 (different port to test switching)
createdb -U postgres -p 5433 ellines_eip_local_test2

# Verify they exist
psql -l
```

### Step 2: Initialize Database Schema

Both databases need the Ellines EIP schema:

```bash
# Set DATABASE_URL to first database
export DATABASE_URL="postgresql://postgres:password@localhost:5432/ellines_eip_local_test1"

# Push Prisma schema
npm run db:push

# Now switch to second database and push same schema
export DATABASE_URL="postgresql://postgres:password@localhost:5433/ellines_eip_local_test2"
npm run db:push

# Verify tables exist in both
psql -p 5432 -d ellines_eip_local_test1 -c "\dt"
psql -p 5433 -d ellines_eip_local_test2 -c "\dt"
```

### Step 3: Add Configurations via API

Using curl or Postman, call the database configuration endpoints:

**Add Database 1 Config:**
```bash
curl -X POST http://localhost:3001/api/v1/orgs/me/database-config \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Local Test DB 1",
    "type": "local",
    "host": "localhost",
    "port": 5432,
    "databaseName": "ellines_eip_local_test1",
    "username": "postgres",
    "password": "your_password"
  }'
```

**Add Database 2 Config:**
```bash
curl -X POST http://localhost:3001/api/v1/orgs/me/database-config \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Local Test DB 2",
    "type": "local",
    "host": "localhost",
    "port": 5433,
    "databaseName": "ellines_eip_local_test2",
    "username": "postgres",
    "password": "your_password"
  }'
```

**Test Connection:**
```bash
curl -X POST http://localhost:3001/api/v1/orgs/me/database-config/test-connection \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "local",
    "host": "localhost",
    "port": 5432,
    "databaseName": "ellines_eip_local_test1",
    "username": "postgres",
    "password": "your_password"
  }'
```

Expected response:
```json
{
  "success": true,
  "message": "Connection successful"
}
```

### Step 4: Test Database Switching

**List current configurations:**
```bash
curl -X GET http://localhost:3001/api/v1/orgs/me/database-config \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Switch to Database 2:**
```bash
curl -X POST http://localhost:3001/api/v1/orgs/me/database-config/switch-primary \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "configId": "CONFIG_ID_FROM_STEP_3",
    "reason": "Testing database switching"
  }'
```

### Step 5: Verify Data Persistence

**Create test data on Database 1:**
```bash
# Switch back to Database 1
export DATABASE_URL="postgresql://postgres:password@localhost:5432/ellines_eip_local_test1"

# Start identity service
npm run dev:identity

# Register a test organization via API
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!",
    "organizationName": "Test Org 1",
    "organizationSlug": "test-org-1",
    "fullName": "Test User"
  }'

# Query the organization
psql -p 5432 -d ellines_eip_local_test1 -c "SELECT id, name FROM organizations LIMIT 1;"
```

**Switch to Database 2 and verify data is different:**
```bash
# Verify organization doesn't exist in DB 2
psql -p 5433 -d ellines_eip_local_test2 -c "SELECT COUNT(*) FROM organizations;"

# Should return 0 (no data yet)

# Create data in DB 2
# (Similar registration process, will create new data only in DB 2)

# Query DB 2
psql -p 5433 -d ellines_eip_local_test2 -c "SELECT id, name FROM organizations LIMIT 1;"
```

**Switch back to Database 1:**
```bash
# Verify original data is still there
psql -p 5432 -d ellines_eip_local_test1 -c "SELECT id, name FROM organizations LIMIT 1;"
```

---

## API Testing Checklist

- [ ] GET /api/v1/orgs/me/database-config returns all configs
- [ ] POST /api/v1/orgs/me/database-config creates new config
- [ ] POST /api/v1/orgs/me/database-config/test-connection succeeds for valid DB
- [ ] POST /api/v1/orgs/me/database-config/test-connection fails for invalid DB
- [ ] POST /api/v1/orgs/me/database-config/switch-primary switches databases
- [ ] Audit log records database switches
- [ ] DatabaseConfiguration schema includes all required fields
- [ ] Passwords are masked in list responses (show as ••••••••)
- [ ] Creating duplicate config name returns 409 Conflict
- [ ] Org can have multiple database configs
- [ ] Only one database is marked as primary

---

## Database Switching Verification

**Test 1: Separate Data**
```
Setup:
  - DB1 and DB2 created
  - Org A added to DB1 via API
  - DB switched to DB2

Expected:
  - Querying DB1 shows Org A
  - Querying DB2 shows no organizations
  - Querying DB1 again still shows Org A
```

**Test 2: Audit Trail**
```
Setup:
  - Make two database switches

Expected:
  - DatabaseSwitchLog table has 2 entries
  - Entries show: organizationId, configId, fromDatabase, toDatabase, reason, switchedAt
```

**Test 3: Performance**
```
Setup:
  - Create 10 database configurations
  - Switch between them
  
Expected:
  - Switch completes in < 1 second
  - No connection pool exhaustion errors
  - All subsequent queries use new database
```

---

## Common Issues & Fixes

### Issue: "Cannot connect to database"
```
Cause: PostgreSQL not running or port incorrect
Fix:
  - Ensure PostgreSQL is running: `sudo systemctl status postgresql` (Linux/Mac)
  - Check port with: `lsof -i :5432` (Linux/Mac) or `netstat -ano | findstr 5432` (Windows)
  - Verify connection string format
```

### Issue: "Database does not exist"
```
Cause: Database not created with createdb
Fix:
  - List databases: `psql -l`
  - Create missing database: `createdb -U postgres database_name`
```

### Issue: "Permission denied"
```
Cause: PostgreSQL user doesn't have required permissions
Fix:
  - Grant permissions: `ALTER USER postgres WITH SUPERUSER;`
  - Or create dedicated user: `createuser -U postgres -P eip_user`
```

### Issue: "Duplicate key value violates unique constraint"
```
Cause: Config with same name already exists
Fix:
  - Use unique names for each configuration
  - Or delete existing config first
```

---

## Testing with Supabase (Optional)

Can also test cloud database switching:

```bash
# Create Supabase account at supabase.com
# Create test project (free tier allows 2)
# Copy connection URL and API key

# Add Supabase config
curl -X POST http://localhost:3001/api/v1/orgs/me/database-config \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Supabase Cloud",
    "type": "supabase",
    "supabaseUrl": "postgresql://user:pass@db.supabase.co/postgres",
    "supabaseKey": "YOUR_API_KEY"
  }'

# Test connection
curl -X POST http://localhost:3001/api/v1/orgs/me/database-config/test-connection \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "supabase",
    "supabaseUrl": "postgresql://user:pass@db.supabase.co/postgres",
    "supabaseKey": "YOUR_API_KEY"
  }'

# Switch to Supabase
# (Don't do this in production without migration plan!)
```

---

## Success Criteria for S14.4

When all of the following pass, S14.4 is complete:

- ✅ Two local PostgreSQL databases created and accessible
- ✅ Prisma schema pushed to both databases
- ✅ DatabaseConfiguration API adds both configs
- ✅ Test connection endpoint validates both databases
- ✅ Database switch succeeds via API
- ✅ Audit log records the switch
- ✅ Querying after switch returns data from new database
- ✅ Switching back returns data from original database
- ✅ Performance acceptable (< 1 second per switch)
- ✅ No connection pool errors
- ✅ Multiple switches in sequence work correctly

---

## Manual UI Testing (When Web Build Fixed)

Once the web build is fixed, test the UI in Settings:

```
1. Log in as Owner/Admin
2. Go to Settings → Database Configuration
3. Verify you see the new section with:
   - "✅ Active Database" badge showing current DB
   - "Configured Databases" list
   - "+ Add Configuration" button
4. Click "+ Add Configuration"
5. Fill in: Local PostgreSQL details
6. Click "🔗 Test Connection" → should show green checkmark
7. Click "✅ Create Configuration"
8. Should appear in configured list
9. Click "Set as Primary" on new config
10. Confirm dialog appears
11. New config marked as "PRIMARY"
12. Previous config unmarked

Expected: No errors, smooth transitions, data persists
```

---

## Next Steps After Testing

Once S14.4 passes:

1. **S14.5:** Optional Supabase testing (same pattern as local DB)
2. **S14.7:** Implement password encryption (replace btoa with real encryption)
3. **Deploy:** Push to main when web build is fixed
4. **Client testing:** Provide documentation to clients

---

**For questions or issues:** See docs/14_Database_Configuration_Guide.md or docs/05_Build_Queue.md
