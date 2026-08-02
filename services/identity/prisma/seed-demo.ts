/**
 * Seeds the demo organization and owner for live / local smoke tests.
 * Idempotent: safe to re-run.
 *
 * Usage (from repo root, with DATABASE_URL in .env):
 *   npm run seed:demo
 */
import { config } from 'dotenv';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

config({ path: join(__dirname, '..', '..', '..', '.env'), override: true });
config({ path: join(__dirname, '..', '.env'), override: true });

const DEMO_EMAIL = (process.env.DEMO_EMAIL || 'demo@ellines.co.ke').toLowerCase();
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'EllinesDemo2026!';
const DEMO_ORG = process.env.DEMO_ORG_NAME || 'Ellines Demo Org';
const DEMO_SLUG = process.env.DEMO_ORG_SLUG || 'ellines-demo';
const DEMO_NAME = process.env.DEMO_FULL_NAME || 'Demo Executive';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 8);

  const org = await prisma.organization.upsert({
    where: { slug: DEMO_SLUG },
    update: { name: DEMO_ORG },
    create: { name: DEMO_ORG, slug: DEMO_SLUG },
  });

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {
      passwordHash,
      fullName: DEMO_NAME,
      organizationId: org.id,
      role: 'owner',
      isActive: true,
    },
    create: {
      email: DEMO_EMAIL,
      passwordHash,
      fullName: DEMO_NAME,
      organizationId: org.id,
      role: 'owner',
      isActive: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      action: 'seed.demo',
      resource: 'organization',
      metadata: { email: DEMO_EMAIL, slug: DEMO_SLUG },
    },
  });

  // ─── Track A: Enterprise Connector Templates ──────────────────────

  const templates = [
    {
      slug: 'salesforce-cloud',
      name: 'Salesforce Cloud',
      category: 'CRM',
      description: 'Connect to Salesforce Cloud for CRM data',
      oauthRequired: true,
      apiDocsUrl: 'https://developer.salesforce.com/docs/apis/rest/',
      configSchema: {
        default: { apiVersion: 'v57.0', authenticationType: 'oauth2' },
      },
      normalizationRules: [
        { from: 'Contact', to: 'person', fieldMap: { Id: 'id', Name: 'name' } },
      ],
    },
    {
      slug: 'sap-c4c',
      name: 'SAP C4C',
      category: 'ERP',
      description: 'Connect to SAP C4C for enterprise data',
      oauthRequired: false,
      apiDocsUrl: 'https://help.sap.com/docs/SAP_C4C/api/',
      configSchema: { default: { authenticationType: 'basic' } },
      normalizationRules: [],
    },
    {
      slug: 'workday-hcm',
      name: 'Workday HCM',
      category: 'HR',
      description: 'Connect to Workday for HR and payroll',
      oauthRequired: true,
      apiDocsUrl: 'https://doc.workday.com/reader/wSFxN8Kw_Ss8VlWDXAJMZA/',
      configSchema: { default: { tenant: '', clientId: '' } },
      normalizationRules: [],
    },
    {
      slug: 'hubspot-crm',
      name: 'HubSpot CRM',
      category: 'CRM',
      description: 'Connect to HubSpot for CRM and marketing',
      oauthRequired: true,
      apiDocsUrl: 'https://developers.hubspot.com/docs/api/',
      configSchema: { default: { apiVersion: 'v3' } },
      normalizationRules: [],
    },
    {
      slug: 'hospidia-his',
      name: 'Hospidia HIS',
      category: 'HIS',
      description: 'Connect to Hospidia Hospital Information System',
      oauthRequired: false,
      apiDocsUrl: 'https://docs.hospidia.net/api/',
      configSchema: { default: { endpoint: 'https://api.hospidia.net' } },
      normalizationRules: [],
    },
    {
      slug: 'netsuite-erp',
      name: 'NetSuite ERP',
      category: 'ERP',
      description: 'Connect to NetSuite for financial and operational data',
      oauthRequired: false,
      apiDocsUrl: 'https://docs.oracle.com/en/cloud/saas/netsuite/',
      configSchema: { default: { accountId: '' } },
      normalizationRules: [],
    },
    {
      slug: 'oracle-db',
      name: 'Oracle Database',
      category: 'Database',
      description: 'Connect to Oracle database for data extraction',
      oauthRequired: false,
      apiDocsUrl: 'https://docs.oracle.com/database/',
      configSchema: { default: { port: 1521, type: 'oracle' } },
      normalizationRules: [],
    },
    {
      slug: 'dynamics-365',
      name: 'Microsoft Dynamics 365',
      category: 'ERP',
      description: 'Connect to Dynamics 365 for CRM/ERP',
      oauthRequired: true,
      apiDocsUrl: 'https://learn.microsoft.com/en-us/dynamics365/api/',
      configSchema: { default: { environment: '' } },
      normalizationRules: [],
    },
    {
      slug: 'adp-payroll',
      name: 'ADP Payroll',
      category: 'HR',
      description: 'Connect to ADP for payroll and HR',
      oauthRequired: true,
      apiDocsUrl: 'https://developer.adp.com/docs/',
      configSchema: { default: { clientId: '' } },
      normalizationRules: [],
    },
    {
      slug: 'cerner-emr',
      name: 'Cerner EMR',
      category: 'HIS',
      description: 'Connect to Cerner Electronic Medical Records',
      oauthRequired: true,
      apiDocsUrl: 'https://fhir.cerner.com/millennium/r4/',
      configSchema: { default: { fhirVersion: 'r4' } },
      normalizationRules: [],
    },
    {
      slug: 'epic-emr',
      name: 'Epic EMR',
      category: 'HIS',
      description: 'Connect to Epic Electronic Medical Records',
      oauthRequired: true,
      apiDocsUrl: 'https://open.epic.com/Interface/FHIR',
      configSchema: { default: { fhirEndpoint: '' } },
      normalizationRules: [],
    },
    {
      slug: 'rest-generic',
      name: 'REST API (Generic)',
      category: 'REST',
      description: 'Connect to any REST API',
      oauthRequired: false,
      apiDocsUrl: '',
      configSchema: { default: { baseUrl: '', authType: 'none' } },
      normalizationRules: [],
    },
    {
      slug: 'openapi-generic',
      name: 'OpenAPI/Swagger (Generic)',
      category: 'REST',
      description: 'Import OpenAPI/Swagger specification',
      oauthRequired: false,
      apiDocsUrl: '',
      configSchema: { default: { specUrl: '' } },
      normalizationRules: [],
    },
    {
      slug: 'postgresql-db',
      name: 'PostgreSQL Database',
      category: 'Database',
      description: 'Connect to PostgreSQL for data extraction',
      oauthRequired: false,
      apiDocsUrl: 'https://www.postgresql.org/docs/',
      configSchema: { default: { port: 5432, type: 'postgresql' } },
      normalizationRules: [],
    },
    {
      slug: 'mysql-db',
      name: 'MySQL Database',
      category: 'Database',
      description: 'Connect to MySQL for data extraction',
      oauthRequired: false,
      apiDocsUrl: 'https://dev.mysql.com/doc/',
      configSchema: { default: { port: 3306, type: 'mysql' } },
      normalizationRules: [],
    },
    {
      slug: 'sqlserver-db',
      name: 'SQL Server Database',
      category: 'Database',
      description: 'Connect to SQL Server for data extraction',
      oauthRequired: false,
      apiDocsUrl: 'https://learn.microsoft.com/en-us/sql/t-sql/language-reference/',
      configSchema: { default: { port: 1433, type: 'sqlserver' } },
      normalizationRules: [],
    },
  ];

  for (const template of templates) {
    await prisma.connectorTemplate.upsert({
      where: { slug: template.slug },
      update: template,
      create: { ...template, published: true },
    });
  }

  console.log(`✓ Seeded ${templates.length} connector templates`);

  // ─── Track B: Sample Dashboards ────────────────────────────────────

  const dashboard1 = await prisma.dashboard.upsert({
    where: { id: `dashboard-demo-1` },
    update: {},
    create: {
      id: `dashboard-demo-1`,
      organizationId: org.id,
      name: 'Executive Overview',
      description: 'Real-time business metrics and KPIs',
      layout: [
        { id: 'kpi-1', x: 0, y: 0, w: 2, h: 1 },
        { id: 'gauge-1', x: 2, y: 0, w: 2, h: 1 },
        { id: 'chart-1', x: 0, y: 1, w: 4, h: 2 },
      ],
      refreshRate: 60,
      isPublic: false,
      createdBy: user.id,
    },
  });

  await prisma.widget.createMany({
    data: [
      {
        dashboardId: dashboard1.id,
        type: 'kpi',
        title: 'Revenue (MTD)',
        config: { metric: 'revenue_mtd', currency: 'USD' },
        position: 0,
        size: { w: 2, h: 1 },
      },
      {
        dashboardId: dashboard1.id,
        type: 'gauge',
        title: 'Health Score',
        config: { min: 0, max: 100, threshold: 75 },
        position: 1,
        size: { w: 2, h: 1 },
      },
      {
        dashboardId: dashboard1.id,
        type: 'line',
        title: 'Revenue Trend',
        config: { period: '12m', aggregate: 'sum' },
        position: 2,
        size: { w: 4, h: 2 },
      },
    ],
    skipDuplicates: true,
  });

  console.log(`✓ Seeded sample dashboards`);

  // ─── Track C: Sample Workflow Rules ────────────────────────────────

  const rule1 = await prisma.workflowRule.upsert({
    where: { id: `rule-demo-1` },
    update: {},
    create: {
      id: `rule-demo-1`,
      organizationId: org.id,
      name: 'Escalate Pending Approvals',
      description: 'Auto-escalate approvals pending > 3 days',
      autonomyLevel: 2, // AI-assisted
      trigger: 'approval_created',
      condition: { field: 'daysOpen', op: 'gte', value: 3 },
      action: { type: 'escalate', target: 'owner' },
      isActive: true,
      createdBy: user.id,
    },
  });

  const rule2 = await prisma.workflowRule.upsert({
    where: { id: `rule-demo-2` },
    update: {},
    create: {
      id: `rule-demo-2`,
      organizationId: org.id,
      name: 'Alert on High Error Count',
      description: 'Trigger alert when connector sync errors exceed threshold',
      autonomyLevel: 1, // Deterministic
      trigger: 'sync_error',
      condition: { field: 'errorCount', op: 'gt', value: 5 },
      action: { type: 'notify', channels: ['email', 'push'] },
      isActive: true,
      createdBy: user.id,
    },
  });

  const rule3 = await prisma.workflowRule.upsert({
    where: { id: `rule-demo-3` },
    update: {},
    create: {
      id: `rule-demo-3`,
      organizationId: org.id,
      name: 'Daily Sync All Connectors',
      description: 'Autonomously sync all active connectors daily',
      autonomyLevel: 3, // Scheduled
      trigger: 'schedule',
      condition: {},
      action: { type: 'sync_all', retryCount: 3 },
      isActive: true,
      createdBy: user.id,
    },
  });

  // Add schedule for Level 3 rule
  await prisma.ruleSchedule.upsert({
    where: { ruleId: rule3.id },
    update: { nextRun: new Date() },
    create: {
      ruleId: rule3.id,
      cronExpression: '0 2 * * *', // 2 AM daily
      timezone: 'UTC',
      nextRun: new Date(),
    },
  });

  console.log(`✓ Seeded sample workflow rules`);

  console.log('Demo user ready');
  console.log(`  org:   ${org.name} (${org.slug})`);
  console.log(`  email: ${DEMO_EMAIL}`);
  console.log(`  pass:  ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
