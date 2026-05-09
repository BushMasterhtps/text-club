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

    const specific = dashboardSpecificItems[currentDashboard] || [];

    return [...common, ...specific];
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

