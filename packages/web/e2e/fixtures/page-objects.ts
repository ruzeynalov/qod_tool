import { type Page, type Locator } from '@playwright/test';

// ─── Sidebar ─────────────────────────────────────────────────────────

export class Sidebar {
  readonly nav: Locator;
  readonly overviewLink: Locator;
  readonly projectsLink: Locator;
  readonly collapseButton: Locator;

  constructor(private page: Page) {
    this.nav = page.locator('nav[aria-label="Main navigation"]');
    this.overviewLink = this.nav.getByRole('link', { name: 'Overview' }).first();
    this.projectsLink = this.nav.getByRole('link', { name: 'Projects' });
    this.collapseButton = page.getByRole('button', { name: /collapse|expand/i });
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
  readonly userButton: Locator;

  constructor(private page: Page) {
    this.demoToggle = page.locator('button').filter({ hasText: 'Demo' });
    this.themeToggle = page.getByTitle(/switch to (light|dark) mode/i);
    this.userButton = page.locator('header button').last();
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
  readonly loginInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorAlert: Locator;
  readonly heading: Locator;

  constructor(private page: Page) {
    this.loginInput = page.locator('#login');
    this.passwordInput = page.locator('#password');
    this.submitButton = page.getByRole('button', { name: /sign in/i });
    // Next.js has a hidden route-announcer with role="alert"; target app error alerts by class
    this.errorAlert = page.locator('div[role="alert"].rounded-md');
    this.heading = page.getByRole('heading', { name: /sign in to qod/i });
  }

  async goto() {
    await this.page.goto('/login');
    await this.heading.waitFor({ timeout: 15_000 });
  }

  async login(loginValue: string, password: string) {
    await this.loginInput.fill(loginValue);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}

// ─── Dashboard Page ──────────────────────────────────────────────────

export class DashboardPage {
  readonly heading: Locator;

  constructor(private page: Page) {
    this.heading = page.getByText('Quality Observability Dashboard');
  }

  async goto() {
    await this.page.goto('/');
    await this.heading.waitFor({ timeout: 15_000 });
  }
}

// ─── Projects Page ───────────────────────────────────────────────────

export class ProjectsPage {
  readonly heading: Locator;
  readonly newProjectButton: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: 'Projects' });
    this.newProjectButton = page.getByRole('button', { name: /new project/i });
  }

  async goto() {
    await this.page.goto('/projects');
    await this.heading.waitFor({ timeout: 15_000 });
  }

  async openProject(name: string | RegExp) {
    await this.page.getByRole('link', { name }).click();
  }
}

// ─── Project Detail Page ─────────────────────────────────────────────

export class ProjectDetailPage {
  constructor(private page: Page, private projectId: string) {}

  private get basePath() {
    return `/projects/${this.projectId}`;
  }

  /** Navigate directly to a project tab by URL. */
  async goto(tab?: 'coverage' | 'runs' | 'defects' | 'kpis' | 'settings') {
    const path = tab ? `${this.basePath}/${tab}` : this.basePath;
    await this.page.goto(path);
    // Wait for the project header to render
    await this.page.locator('h1').first().waitFor({ timeout: 15_000 });
  }

  /** Click a tab in the project tab bar (inside main content, not sidebar). */
  async clickTab(label: 'Overview' | 'Coverage' | 'Runs' | 'Defects' | 'KPIs' | 'Settings') {
    // Scope to main content area to avoid matching identical sidebar links
    const main = this.page.getByRole('main');
    const tabLink = main.getByRole('link', { name: label });
    await tabLink.click();
  }
}

// ─── Users Page ─────────────────────────────────────────────────────

export class UsersPage {
  readonly heading: Locator;
  readonly createButton: Locator;
  readonly usersTable: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /user management/i });
    this.createButton = page.getByRole('button', { name: /create user/i });
    this.usersTable = page.locator('table');
  }

  async goto() {
    await this.page.goto('/users');
    await this.heading.waitFor({ timeout: 15_000 });
  }
}
