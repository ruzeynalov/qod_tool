import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

// ── Password hashing (same pattern as AuthService) ────────────────

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${key}`;
}

// ── KPI target defaults ───────────────────────────────────────────

interface KPITargetDefaults {
  metric: string;
  target: number;
  greenThreshold: number;
  amberThreshold: number;
}

const KPI_TARGETS: KPITargetDefaults[] = [
  { metric: 'COVERAGE_PCT', target: 80, greenThreshold: 80, amberThreshold: 60 },
  { metric: 'PASS_RATE_7D', target: 90, greenThreshold: 85, amberThreshold: 70 },
  { metric: 'PASS_RATE_30D', target: 90, greenThreshold: 85, amberThreshold: 70 },
  { metric: 'FLAKY_RATE', target: 5, greenThreshold: 5, amberThreshold: 15 },
  { metric: 'MTTD_HOURS', target: 2, greenThreshold: 2, amberThreshold: 8 },
  { metric: 'MTTR_HOURS', target: 24, greenThreshold: 24, amberThreshold: 72 },
  { metric: 'ESCAPE_RATE', target: 10, greenThreshold: 10, amberThreshold: 25 },
  { metric: 'EXEC_VELOCITY', target: 50, greenThreshold: 50, amberThreshold: 20 },
  { metric: 'REQ_COVERAGE', target: 75, greenThreshold: 75, amberThreshold: 50 },
  { metric: 'READINESS_SCORE', target: 80, greenThreshold: 80, amberThreshold: 60 },
];

// ── Demo projects ─────────────────────────────────────────────────

const DEMO_PROJECTS = [
  { name: 'E-Commerce Platform', slug: 'e-commerce-platform' },
  { name: 'Mobile Banking App', slug: 'mobile-banking-app' },
  { name: 'Internal Tools', slug: 'internal-tools' },
];

// ── Seed ──────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding database...');

  // 1. Create default organization
  const org = await prisma.organization.upsert({
    where: { slug: 'qod-demo-org' },
    create: {
      name: 'QOD Demo Org',
      slug: 'qod-demo-org',
    },
    update: {
      name: 'QOD Demo Org',
    },
  });
  console.log(`Organization: ${org.name} (${org.id})`);

  // 2. Create admin user
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@qod.dev' },
    create: {
      orgId: org.id,
      email: 'admin@qod.dev',
      name: 'Admin',
      password: hashPassword('admin123'),
      role: 'ADMIN',
    },
    update: {
      orgId: org.id,
      name: 'Admin',
      role: 'ADMIN',
    },
  });
  console.log(`Admin user: ${adminUser.email} (${adminUser.id})`);

  // 3. Create demo projects with KPI targets and project memberships
  for (const projectDef of DEMO_PROJECTS) {
    const project = await prisma.project.upsert({
      where: {
        orgId_slug: {
          orgId: org.id,
          slug: projectDef.slug,
        },
      },
      create: {
        orgId: org.id,
        name: projectDef.name,
        slug: projectDef.slug,
        demoMode: true,
      },
      update: {
        name: projectDef.name,
        demoMode: true,
      },
    });
    console.log(`Project: ${project.name} (${project.id})`);

    // 4. Create KPI targets for the project
    for (const kpi of KPI_TARGETS) {
      await prisma.kPITarget.upsert({
        where: {
          projectId_metric: {
            projectId: project.id,
            metric: kpi.metric as any,
          },
        },
        create: {
          projectId: project.id,
          metric: kpi.metric as any,
          target: kpi.target,
          greenThreshold: kpi.greenThreshold,
          amberThreshold: kpi.amberThreshold,
        },
        update: {
          target: kpi.target,
          greenThreshold: kpi.greenThreshold,
          amberThreshold: kpi.amberThreshold,
        },
      });
    }
    console.log(`  KPI targets created (${KPI_TARGETS.length})`);

    // 5. Create ProjectMember linking admin to this project as MANAGER
    await prisma.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId: project.id,
          userId: adminUser.id,
        },
      },
      create: {
        projectId: project.id,
        userId: adminUser.id,
        role: 'MANAGER',
      },
      update: {
        role: 'MANAGER',
      },
    });
    console.log(`  Admin linked as MANAGER`);
  }

  console.log('Seed completed successfully.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
