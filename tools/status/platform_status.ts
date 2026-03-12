/**
 * tools/status/platform_status.ts
 *
 * Public platform status page logic.
 * Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type StatusLevel = 'operational' | 'degraded' | 'down' | 'maintenance';

export interface ServiceStatus {
  name:        string;
  status:      StatusLevel;
  description: string;
  checked_at:  string;
}

export interface PlatformStatus {
  overall:    StatusLevel;
  services:   ServiceStatus[];
  checked_at: string;
  message:    string;
}

// ── Monitored services ────────────────────────────────────────────────────────

export const MONITORED_SERVICES: string[] = [
  'Dashboard',
  'Fix Engine',
  'Crawl Pipeline',
  'Billing',
  'Notifications',
  'API',
];

// ── getStatusBadgeColor ───────────────────────────────────────────────────────

export function getStatusBadgeColor(level: StatusLevel): string {
  try {
    switch (level) {
      case 'operational':  return 'green';
      case 'degraded':     return 'yellow';
      case 'down':         return 'red';
      case 'maintenance':  return 'blue';
      default:             return 'grey';
    }
  } catch {
    return 'grey';
  }
}

// ── buildPlatformStatus ───────────────────────────────────────────────────────

export function buildPlatformStatus(
  serviceStatuses?: Partial<Record<string, StatusLevel>>,
): PlatformStatus {
  try {
    const now = new Date().toISOString();
    const overrides = serviceStatuses ?? {};

    const services: ServiceStatus[] = MONITORED_SERVICES.map((name) => {
      const status = overrides[name] ?? 'operational';
      return {
        name,
        status,
        description: describeStatus(name, status),
        checked_at: now,
      };
    });

    const overall = resolveOverall(services);
    const message = buildOverallMessage(overall);

    return { overall, services, checked_at: now, message };
  } catch {
    return {
      overall: 'operational',
      services: [],
      checked_at: new Date().toISOString(),
      message: 'All systems operational.',
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function describeStatus(name: string, status: StatusLevel): string {
  switch (status) {
    case 'operational':  return `${name} is operating normally.`;
    case 'degraded':     return `${name} is experiencing degraded performance.`;
    case 'down':         return `${name} is currently unavailable.`;
    case 'maintenance':  return `${name} is undergoing scheduled maintenance.`;
    default:             return `${name} status unknown.`;
  }
}

function resolveOverall(services: ServiceStatus[]): StatusLevel {
  if (services.some((s) => s.status === 'down')) return 'down';
  if (services.some((s) => s.status === 'degraded')) return 'degraded';
  if (services.some((s) => s.status === 'maintenance')) return 'maintenance';
  return 'operational';
}

function buildOverallMessage(overall: StatusLevel): string {
  switch (overall) {
    case 'operational':  return 'All systems operational.';
    case 'degraded':     return 'Some systems are experiencing degraded performance.';
    case 'down':         return 'One or more systems are currently unavailable.';
    case 'maintenance':  return 'Scheduled maintenance is in progress.';
    default:             return 'Status unknown.';
  }
}
