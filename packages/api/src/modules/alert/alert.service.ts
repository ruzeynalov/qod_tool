import { Injectable, Logger } from '@nestjs/common';
import { KPIMetric, AlertCondition, AlertChannel } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';

const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── CRUD ──────────────────────────────────────────────────

  async createAlertRule(projectId: string, dto: CreateAlertRuleDto) {
    return this.prisma.alertRule.create({
      data: {
        projectId,
        metric: dto.metric as KPIMetric,
        condition: dto.condition as AlertCondition,
        threshold: dto.threshold,
        channel: dto.channel as AlertChannel,
        channelConfig: dto.channelConfig,
      },
    });
  }

  async updateAlertRule(id: string, dto: UpdateAlertRuleDto) {
    return this.prisma.alertRule.update({
      where: { id },
      data: {
        ...(dto.metric !== undefined && { metric: dto.metric as KPIMetric }),
        ...(dto.condition !== undefined && { condition: dto.condition as AlertCondition }),
        ...(dto.threshold !== undefined && { threshold: dto.threshold }),
        ...(dto.channel !== undefined && { channel: dto.channel as AlertChannel }),
        ...(dto.channelConfig !== undefined && { channelConfig: dto.channelConfig }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      },
    });
  }

  async deleteAlertRule(id: string) {
    return this.prisma.alertRule.delete({ where: { id } });
  }

  async getAlertRules(projectId: string) {
    return this.prisma.alertRule.findMany({
      where: { projectId },
    });
  }

  // ─── Evaluation ────────────────────────────────────────────

  async evaluateAlerts(projectId: string): Promise<void> {
    const rules = await this.prisma.alertRule.findMany({
      where: { projectId, enabled: true },
    });

    for (const rule of rules) {
      // Cooldown check
      if (rule.lastTriggered) {
        const elapsed = Date.now() - new Date(rule.lastTriggered).getTime();
        if (elapsed < COOLDOWN_MS) {
          continue;
        }
      }

      // Fetch latest snapshot(s) for this rule's metric
      const snapshots = await this.prisma.kPISnapshot.findMany({
        where: { projectId, metric: rule.metric as KPIMetric },
        orderBy: { recordedAt: 'desc' },
        take: 2,
      });

      if (snapshots.length === 0) {
        continue;
      }

      const latestValue = snapshots[0].value;
      const shouldTrigger = this.evaluateCondition(
        rule.condition,
        latestValue,
        rule.threshold,
        snapshots,
      );

      if (!shouldTrigger) {
        continue;
      }

      // Dispatch based on channel
      const metric = rule.metric as string;
      switch (rule.channel) {
        case 'IN_APP':
          await this.dispatchInApp(rule, metric, latestValue, projectId);
          break;
        case 'SLACK':
          await this.dispatchSlack(rule, metric, latestValue);
          break;
        case 'EMAIL':
          await this.dispatchEmail(rule, metric, latestValue);
          break;
      }

      // Update lastTriggered
      await this.prisma.alertRule.update({
        where: { id: rule.id },
        data: { lastTriggered: new Date() },
      });
    }
  }

  // ─── Private helpers ───────────────────────────────────────

  private evaluateCondition(
    condition: string,
    latestValue: number,
    threshold: number,
    snapshots: Array<{ value: number }>,
  ): boolean {
    switch (condition) {
      case 'LESS_THAN':
        return latestValue < threshold;
      case 'GREATER_THAN':
        return latestValue > threshold;
      case 'DELTA_PCT': {
        if (snapshots.length < 2) return false;
        const previous = snapshots[1].value;
        if (previous === 0) return false;
        const deltaPct = Math.abs(((latestValue - previous) / previous) * 100);
        return deltaPct > threshold;
      }
      default:
        return false;
    }
  }

  private async dispatchInApp(
    rule: any,
    metric: string,
    value: number,
    projectId: string,
  ): Promise<void> {
    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      select: { userId: true },
    });

    await this.prisma.$transaction(
      members.map((member) =>
        this.prisma.notification.create({
          data: {
            userId: member.userId,
            title: `Alert: ${metric} threshold breached`,
            body: `${metric} is ${value}, which breaches the ${rule.condition} ${rule.threshold} threshold.`,
          },
        }),
      ),
    );
  }

  private async dispatchSlack(
    rule: any,
    metric: string,
    value: number,
  ): Promise<void> {
    const config = rule.channelConfig as { webhookUrl?: string };
    if (!config?.webhookUrl) return;

    // SSRF validation: only allow Slack webhook URLs
    if (!config.webhookUrl.startsWith('https://hooks.slack.com/')) {
      this.logger.warn(`Blocked non-Slack webhook URL: ${config.webhookUrl}`);
      return;
    }

    try {
      const response = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `Alert: ${metric} is ${value}, which breaches the ${rule.condition} ${rule.threshold} threshold.`,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        this.logger.error(`Slack webhook returned ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      this.logger.error(`Slack webhook dispatch failed: ${error}`);
    }
  }

  private async dispatchEmail(
    _rule: any,
    _metric: string,
    _value: number,
  ): Promise<void> {
    // Email dispatch is a placeholder — in production this would call
    // an email service (e.g. SendGrid, SES). For now it's a no-op that
    // tests verify is called with correct parameters.
  }
}
