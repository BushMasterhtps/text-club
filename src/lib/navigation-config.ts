/**
 * Centralized Navigation Configuration
 * Single source of truth for all dashboard navigation
 */

export type DashboardType = 
  | 'text-club' 
  | 'wod-ivcs' 
  | 'email-requests' 
  | 'yotpo' 
  | 'holds' 
  | 'standalone-refunds';

export interface NavigationItem {
  id: string;
  label: string;
  icon: string;
  description: string;
  badge?: number | (() => number);
  external?: boolean;
  href?: string;
  availableFor?: DashboardType[]; // If undefined, available for all
}

export interface DashboardConfig {
  id: DashboardType;
  name: string;
  path: string;
  emoji: string;
  description: string;
  available: boolean;
}

// Common navigation items (shared across all dashboards)
export const commonNavigationItems: NavigationItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: '📊',
    description: 'Dashboard metrics and progress',
  },
  {
    id: 'tasks',
    label: 'Task Management',
    icon: '📋',
    description: 'Import, assign, and manage tasks',
  },
  {
    id: 'assistance',
    label: 'Assistance Requests',
    icon: '🆘',
    description: 'Respond to agent assistance requests',
    // Badge will be calculated dynamically
  },
  {
    id: 'agents',
    label: 'Agent Management',
    icon: '👥',
    description: 'Monitor agent progress and performance',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: '📈',
    description: 'Task-specific analytics and insights',
  },
];

// Dashboard-specific navigation items
export const dashboardSpecificItems: Record<DashboardType, NavigationItem[]> = {
  'text-club': [],
  'wod-ivcs': [
    {
      id: 'import-diagnostics',
      label: 'Import & Diagnostics',
      icon: '🔍',
      description: 'Import history, reversal, and order inspection',
    },
  ],
  'email-requests': [
    {
      id: 'disposition-review',
      label: 'Unable / Unfeasible Review',
      icon: '🔎',
      description: 'Manager review of Unable / Unfeasible email request dispositions',
    },
  ],
  'yotpo': [
    {
      id: 'submissions',
      label: 'Form Submissions',
      icon: '📝',
      description: 'Track external rep submissions and productivity',
    },
  ],
  'holds': [],
  'standalone-refunds': [],
};

// Dashboard configurations
export const dashboardConfigs: DashboardConfig[] = [
  {
    id: 'text-club',
    name: 'Text Club',
    path: '/manager',
    emoji: '📱',
    description: 'Text Club Task Management & Analytics',
    available: true,
  },
  {
    id: 'wod-ivcs',
    name: 'WOD/IVCS',
    path: '/wod-ivcs',
    emoji: '📦',
    description: 'WOD/IVCS Task Management & Analytics',
    available: true,
  },
  {
    id: 'email-requests',
    name: 'Email Requests',
    path: '/email-requests',
    emoji: '📧',
    description: 'Email Request Task Management & Analytics',
    available: true,
  },
  {
    id: 'yotpo',
    name: 'Yotpo',
    path: '/yotpo',
    emoji: '⭐',
    description: 'Yotpo Review & Feedback Task Management',
    available: true,
  },
  {
    id: 'holds',
    name: 'Holds',
    path: '/holds',
    emoji: '🚧',
    description: 'Holds Assembly Line Management & Analytics',
    available: true,
  },
];

