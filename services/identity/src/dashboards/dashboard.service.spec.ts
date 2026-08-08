import { NotFoundException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

const mockDash = {
  id: 'd1', organizationId: 'org-1', name: 'Main', description: '',
  layout: [], refreshRate: 300, isPublic: false, createdBy: 'u1',
  createdAt: new Date(), updatedAt: new Date(), widgets: [], exports: [],
};

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    dashboard: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(mockDash),
      update: jest.fn().mockResolvedValue(mockDash),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    widget: {
      create: jest.fn().mockResolvedValue({ id: 'w1', dashboardId: 'd1', type: 'kpi', title: 'Sales', position: 0 }),
      update: jest.fn().mockResolvedValue({ id: 'w1' }),
      delete: jest.fn().mockResolvedValue({}),
    },
    alert: {
      create: jest.fn().mockResolvedValue({ id: 'a1', widgetId: 'w1', condition: 'gt', threshold: 100, actions: [], active: true }),
      update: jest.fn().mockResolvedValue({ id: 'a1' }),
      delete: jest.fn().mockResolvedValue({}),
    },
    dashboardExport: {
      create: jest.fn().mockResolvedValue({ id: 'e1', dashboardId: 'd1', format: 'pdf' }),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({}),
    },
    ...overrides,
  } as unknown as PrismaService;
}

// ─── listDashboards ──────────────────────────────────────────────────────────
describe('DashboardService.listDashboards', () => {
  it('returns empty array when no dashboards', async () => {
    const svc = new DashboardService(makePrisma());
    expect(await svc.listDashboards('org-1')).toEqual([]);
  });

  it('returns dashboards for org', async () => {
    const prisma = makePrisma({ dashboard: { ...makePrisma().dashboard, findMany: jest.fn().mockResolvedValue([mockDash]) } });
    const svc = new DashboardService(prisma);
    const result = await svc.listDashboards('org-1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('d1');
  });
});

// ─── getDashboard ────────────────────────────────────────────────────────────
describe('DashboardService.getDashboard', () => {
  it('throws NotFoundException when missing', async () => {
    const svc = new DashboardService(makePrisma());
    await expect(svc.getDashboard('d-missing', 'org-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns dashboard when found', async () => {
    const prisma = makePrisma({ dashboard: { ...makePrisma().dashboard, findFirst: jest.fn().mockResolvedValue(mockDash) } });
    const svc = new DashboardService(prisma);
    const result = await svc.getDashboard('d1', 'org-1');
    expect(result.id).toBe('d1');
  });
});

// ─── createDashboard ─────────────────────────────────────────────────────────
describe('DashboardService.createDashboard', () => {
  it('creates dashboard with defaults', async () => {
    const prisma = makePrisma();
    const svc = new DashboardService(prisma);
    await svc.createDashboard('org-1', { name: 'Sales Board' }, 'u1');
    expect(prisma.dashboard.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Sales Board', refreshRate: 300, isPublic: false }),
      }),
    );
  });

  it('uses provided refreshRate and isPublic', async () => {
    const prisma = makePrisma();
    const svc = new DashboardService(prisma);
    await svc.createDashboard('org-1', { name: 'Public Board', refreshRate: 60, isPublic: true }, 'u1');
    expect(prisma.dashboard.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ refreshRate: 60, isPublic: true }) }),
    );
  });
});

// ─── deleteDashboard ─────────────────────────────────────────────────────────
describe('DashboardService.deleteDashboard', () => {
  it('calls deleteMany with correct where clause', async () => {
    const prisma = makePrisma();
    const svc = new DashboardService(prisma);
    await svc.deleteDashboard('d1', 'org-1');
    expect(prisma.dashboard.deleteMany).toHaveBeenCalledWith({ where: { id: 'd1', organizationId: 'org-1' } });
  });
});

// ─── addWidget ───────────────────────────────────────────────────────────────
describe('DashboardService.addWidget', () => {
  it('throws NotFoundException when dashboard not found', async () => {
    const svc = new DashboardService(makePrisma());
    await expect(svc.addWidget('d-missing', 'org-1', { type: 'kpi', title: 'Sales' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates widget on existing dashboard', async () => {
    const prisma = makePrisma({ dashboard: { ...makePrisma().dashboard, findFirst: jest.fn().mockResolvedValue(mockDash) } });
    const svc = new DashboardService(prisma);
    const result = await svc.addWidget('d1', 'org-1', { type: 'kpi', title: 'Revenue', position: 2 });
    expect(prisma.widget.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'kpi', title: 'Revenue', position: 2 }) }),
    );
    expect(result.id).toBe('w1');
  });

  it('defaults position to 0 when not provided', async () => {
    const prisma = makePrisma({ dashboard: { ...makePrisma().dashboard, findFirst: jest.fn().mockResolvedValue(mockDash) } });
    const svc = new DashboardService(prisma);
    await svc.addWidget('d1', 'org-1', { type: 'kpi', title: 'Count' });
    const call = (prisma.widget.create as jest.Mock).mock.calls[0][0];
    expect(call.data.position).toBe(0);
  });
});

// ─── addAlert ────────────────────────────────────────────────────────────────
describe('DashboardService.addAlert', () => {
  it('throws when dashboard not found', async () => {
    const svc = new DashboardService(makePrisma());
    await expect(svc.addAlert('w1', 'd-missing', 'org-1', { condition: 'gt', threshold: 100 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates alert on valid dashboard', async () => {
    const prisma = makePrisma({ dashboard: { ...makePrisma().dashboard, findFirst: jest.fn().mockResolvedValue(mockDash) } });
    const svc = new DashboardService(prisma);
    const result = await svc.addAlert('w1', 'd1', 'org-1', { condition: 'gt', threshold: 500, active: true });
    expect(prisma.alert.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ condition: 'gt', threshold: 500, active: true }) }),
    );
    expect(result.id).toBe('a1');
  });
});

// ─── exportDashboard ─────────────────────────────────────────────────────────
describe('DashboardService.exportDashboard', () => {
  it('throws when dashboard not found', async () => {
    const svc = new DashboardService(makePrisma());
    await expect(svc.exportDashboard('d-missing', 'org-1', 'pdf')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates export record for valid dashboard', async () => {
    const prisma = makePrisma({ dashboard: { ...makePrisma().dashboard, findFirst: jest.fn().mockResolvedValue(mockDash) } });
    const svc = new DashboardService(prisma);
    await svc.exportDashboard('d1', 'org-1', 'csv');
    expect(prisma.dashboardExport.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dashboardId: 'd1', format: 'csv' }) }),
    );
  });
});
