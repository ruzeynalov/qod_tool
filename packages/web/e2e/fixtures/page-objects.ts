import { type Page, type Locator, expect } from '@playwright/test';

// ─── Sidebar ─────────────────────────────────────────────────────────

export class Sidebar {
  readonly root: Locator;
  readonly overviewLink: Locator;
  readonly projectsLink: Locator;
  readonly collapseButton: Locator;

  constructor(private page: Page) {
    this.root = page.locator('nav').first();
    this.overviewLink = page.getByRole('link', { name: /overview/i }).first();
    this.projectsLink = page.getByRole('link', { name: /projects/i }).first();
    this.collapseButton = page.locator('button:has(svg.lucide-chevron-left), button:has(svg.lucide-chevron-right)').first();
  }

  async navigateTo(name: 'Overview' | 'Projects') {
    const link = name === 'Overview' ? this.overviewLink : this.projectsLink;
    await link.click();
  }
}

// ─── Header ──────────────────────────────────────────────────────────

export class Header {
  readonly demoToggle: Locator;
  readonly themeToggle: Locator;
  readonly userMenu: Locator;

  constructor(private page: Page) {
    this.demoToggle = page.getByRole('button', { name: /demo/i });
    this.themeToggle = page.locator('button:has(svg.lucide-sun), button:has(svg.lucide-moon)');
    this.userMenu = page.locator('button:has(svg.lucide-user)');
  }

  async toggleDemo() {
    await this.demoToggle.click();
  }

  async toggleTheme() {
    await this.themeToggle.click();
  }
}

// ─── Login Page ──────────────────────────────────────────────────────

export class LoginPage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorAlert: Locator;
  readonly heading: Locator;

  constructor(private page: Page) {
    this.emailInput = page.locator('#email');
    this.passwordInput = page.locator('#password');
    this.submitButton = page.getByRole('button', { name: /sign in/i });
    this.errorAlert = page.getByRole('alert');
    this.heading = page.getByRole('heading', { name: /sign in to qod/i });
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}

// ─── Dashboard Page ──────────────────────────────────────────────────

export class DashboardPage {
  readonly heading: Locator;
  readonly summaryCards: Locator;
  readonly projectLinks: Locator;

  constructor(private page: Page) {
    this.heading = page.getByText('Quality Observability Dashboard');
    this.summaryCards = page.locator('.grid > div').first();
    this.projectLinks = page.getByRole('link').filter({ hasText: /platform|banking|tools/i });
  }

  async goto() {
    await this.page.goto('/');
    await this.heading.waitFor();
  }
}

// ─── Projects Page ───────────────────────────────────────────────────

export class ProjectsPage {
  readonly heading: Locator;
  readonly newProjectButton: Locator;
  readonly projectCards: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /projects/i });
    this.newProjectButton = page.getByRole('button', { name: /new project/i });
    this.projectCards = page.getByRole('link').filter({ hasText: /platform|banking|tools/i });
  }

  async goto() {
    await this.page.goto('/projects');
    await this.heading.waitFor();
  }

  async openProject(name: string | RegExp) {
    await this.page.getByRole('link', { name }).click();
  }
}

// ─── Project Detail Page ─────────────────────────────────────────────

export class ProjectDetailPage {
  readonly tabs: {
    overview: Locator;
    coverage: Locator;
    runs: Locator;
    defects: Locator;
    kpis: Locator;
    settings: Locator;
  };

  constructor(private page: Page, private projectId: string) {
    const base = `/projects/${projectId}`;
    this.tabs = {
      overview: page.getByRole('link', { name: /overview/i }).filter({ has: page.locator(`[href="${base}"], [href="${base}/"]`) }).or(page.getByRole('link', { name: /^overview$/i })),
      coverage: page.getByRole('link', { name: /coverage/i }),
      runs: page.getByRole('link', { name: /runs/i }),
      defects: page.getByRole('link', { name: /defects/i }),
      kpis: page.getByRole('link', { name: /kpis/i }),
      settings: page.getByRole('link', { name: /settings/i }),
    };
  }

  async goto(tab?: 'coverage' | 'runs' | 'defects' | 'kpis' | 'settings') {
    const path = tab
      ? `/projects/${this.projectId}/${tab}`
      : `/projects/${this.projectId}`;
    await this.page.goto(path);
  }

  async navigateToTab(tab: keyof typeof this.tabs) {
    await this.tabs[tab].click();
  }
}
