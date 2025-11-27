import { useState, useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { 
  DashboardType, 
  NavigationItem, 
  commonNavigationItems, 
  dashboardSpecificItems,
  dashboardConfigs 
} from '@/lib/navigation-config';

export function useDashboardNavigation() {
  const pathname = usePathname();
  const [activeSection, setActiveSection] = useState<string>('overview');
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
  useEffect(() => {
    if (currentDashboard) {
      // Fetch assistance count for current dashboard
      fetch('/api/manager/assistance', { cache: 'no-store' })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            // Filter by task type if needed
            const taskTypeMap: Record<DashboardType, string> = {
              'text-club': 'TEXT_CLUB',
              'wod-ivcs': 'WOD_IVCS',
              'email-requests': 'EMAIL_REQUESTS',
              'yotpo': 'YOTPO',
              'holds': 'HOLDS',
              'standalone-refunds': 'STANDALONE_REFUNDS',
            };
            
            const taskType = taskTypeMap[currentDashboard];
            const count = data.requests?.filter(
              (r: any) => r.status === 'ASSISTANCE_REQUIRED' && 
              (!taskType || r.taskType === taskType)
            ).length || 0;
            setAssistanceCount(count);
          }
        })
        .catch(console.error);
    }
  }, [currentDashboard]);

  return {
    currentDashboard,
    activeSection,
    setActiveSection,
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

