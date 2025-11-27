import { useState, useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useDashboardNavigationContext } from '@/contexts/DashboardNavigationContext';
import { 
  DashboardType, 
  NavigationItem, 
  commonNavigationItems, 
  dashboardSpecificItems,
  dashboardConfigs 
} from '@/lib/navigation-config';

export function useDashboardNavigation() {
  const pathname = usePathname();
  const { activeSection, setActiveSection, sidebarCollapsed, setSidebarCollapsed } = useDashboardNavigationContext();
  const [assistanceCount, setAssistanceCount] = useState(0);

  // Determine current dashboard from pathname
  const currentDashboard = useMemo<DashboardType | null>(() => {
    const config = dashboardConfigs.find(d => d.path === pathname);
    return config?.id || null;
  }, [pathname]);

  // Get navigation items for current dashboard
  const navigationItems = useMemo<NavigationItem[]>(() => {
    if (!currentDashboard) return [];
    
    const common = commonNavigationItems.filter(item => {
      if (item.availableFor) {
        return item.availableFor.includes(currentDashboard);
      }
      return true;
    });
    
    const specific = dashboardSpecificItems[currentDashboard] || [];
    
    return [...common, ...specific];
  }, [currentDashboard]);

  // Update badge counts (e.g., assistance requests)
  // Show all non-Holds pending requests across all dashboards for cross-visibility
  useEffect(() => {
    if (currentDashboard && currentDashboard !== 'holds') {
      // Fetch assistance count - show all non-Holds requests for cross-visibility
      fetch('/api/manager/assistance', { cache: 'no-store' })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            // Count all non-Holds pending requests (for cross-task-type visibility)
            const count = data.requests?.filter(
              (r: any) => 
                r.status === 'ASSISTANCE_REQUIRED' && 
                r.taskType !== 'HOLDS' &&
                (r.taskType === 'TEXT_CLUB' || 
                 r.taskType === 'WOD_IVCS' || 
                 r.taskType === 'EMAIL_REQUESTS' || 
                 r.taskType === 'YOTPO' ||
                 r.taskType === 'STANDALONE_REFUNDS')
            ).length || 0;
            setAssistanceCount(count);
          }
        })
        .catch(console.error);
    } else {
      // For Holds dashboard, only show Holds requests
      if (currentDashboard === 'holds') {
        fetch('/api/manager/assistance', { cache: 'no-store' })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              const count = data.requests?.filter(
                (r: any) => r.status === 'ASSISTANCE_REQUIRED' && r.taskType === 'HOLDS'
              ).length || 0;
              setAssistanceCount(count);
            }
          })
          .catch(console.error);
      }
    }
    
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      if (currentDashboard && currentDashboard !== 'holds') {
        fetch('/api/manager/assistance', { cache: 'no-store' })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              const count = data.requests?.filter(
                (r: any) => 
                  r.status === 'ASSISTANCE_REQUIRED' && 
                  r.taskType !== 'HOLDS' &&
                  (r.taskType === 'TEXT_CLUB' || 
                   r.taskType === 'WOD_IVCS' || 
                   r.taskType === 'EMAIL_REQUESTS' || 
                   r.taskType === 'YOTPO' ||
                   r.taskType === 'STANDALONE_REFUNDS')
              ).length || 0;
              setAssistanceCount(count);
            }
          })
          .catch(console.error);
      } else if (currentDashboard === 'holds') {
        fetch('/api/manager/assistance', { cache: 'no-store' })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              const count = data.requests?.filter(
                (r: any) => r.status === 'ASSISTANCE_REQUIRED' && r.taskType === 'HOLDS'
              ).length || 0;
              setAssistanceCount(count);
            }
          })
          .catch(console.error);
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [currentDashboard]);

  return {
    currentDashboard,
    activeSection,
    setActiveSection,
    sidebarCollapsed,
    setSidebarCollapsed,
    navigationItems: navigationItems.map(item => ({
      ...item,
      badge: item.id === 'assistance' 
        ? assistanceCount 
        : typeof item.badge === 'function' 
          ? item.badge() 
          : item.badge,
    })),
    dashboardConfigs,
  };
}

