import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useDashboardNavigationContext } from '@/contexts/DashboardNavigationContext';
import { useAssistanceRequestsContext } from '@/contexts/AssistanceRequestsContext';
import {
  DashboardType,
  NavigationItem,
  commonNavigationItems,
  dashboardSpecificItems,
  dashboardConfigs,
} from '@/lib/navigation-config';
import { isWodIvcsV2EnabledClient } from '@/lib/wod-ivcs/client-feature-flag';

export function useDashboardNavigation() {
  const pathname = usePathname();
  const { activeSection, setActiveSection, sidebarCollapsed, setSidebarCollapsed } =
    useDashboardNavigationContext();
  const assistanceCtx = useAssistanceRequestsContext();

  // Determine current dashboard from pathname
  const currentDashboard = useMemo<DashboardType | null>(() => {
    const config = dashboardConfigs.find((d) => d.path === pathname);
    return config?.id || null;
  }, [pathname]);

  // Assistance badge from shared DashboardLayout provider (no independent polling).
  const assistanceCount = useMemo(() => {
    if (!currentDashboard || !assistanceCtx) return 0;
    if (currentDashboard === 'holds') return assistanceCtx.holdsPendingCount;
    return assistanceCtx.nonHoldsPendingCount;
  }, [currentDashboard, assistanceCtx]);

  // Get navigation items for current dashboard
  const navigationItems = useMemo<NavigationItem[]>(() => {
    if (!currentDashboard) return [];

    const common = commonNavigationItems.filter((item) => {
      if (item.availableFor) {
        return item.availableFor.includes(currentDashboard);
      }
      return true;
    });

    const v2Enabled = isWodIvcsV2EnabledClient();
    const specific = (dashboardSpecificItems[currentDashboard] || []).filter(
      (item) => item.id !== 'import-diagnostics' || v2Enabled
    );

    const items = [...common, ...specific];

    if (currentDashboard === 'wod-ivcs' && v2Enabled) {
      const diagnostics = items.find((i) => i.id === 'import-diagnostics');
      if (diagnostics) {
        const without = items.filter((i) => i.id !== 'import-diagnostics');
        const tasksIdx = without.findIndex((i) => i.id === 'tasks');
        if (tasksIdx >= 0) {
          return [
            ...without.slice(0, tasksIdx + 1),
            diagnostics,
            ...without.slice(tasksIdx + 1),
          ];
        }
      }
    }

    return items;
  }, [currentDashboard]);

  return {
    currentDashboard,
    activeSection,
    setActiveSection,
    sidebarCollapsed,
    setSidebarCollapsed,
    navigationItems: navigationItems.map((item) => ({
      ...item,
      badge:
        item.id === 'assistance'
          ? assistanceCount
          : typeof item.badge === 'function'
            ? item.badge()
            : item.badge,
    })),
    dashboardConfigs,
  };
}

