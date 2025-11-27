'use client';

import { ReactNode } from 'react';
import UnifiedNavigation from './UnifiedNavigation';
import { useDashboardNavigation } from '@/hooks/useDashboardNavigation';
import { DashboardNavigationProvider } from '@/contexts/DashboardNavigationContext';

interface DashboardLayoutProps {
  children: ReactNode;
  headerActions?: ReactNode;
}

export default function DashboardLayout({ 
  children, 
  headerActions 
}: DashboardLayoutProps) {
  const { currentDashboard, dashboardConfigs, sidebarCollapsed } = useDashboardNavigation();
  const currentConfig = dashboardConfigs.find(d => d.id === currentDashboard);

  return (
    <div className="flex min-h-screen bg-neutral-900">
      {/* Sidebar Navigation */}
      <UnifiedNavigation />

      {/* Main Content Area */}
      <main className={`
        flex-1 min-w-0 transition-all duration-300 ease-in-out
        bg-neutral-900
        ${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64 lg:pr-64'}
      `}>
        {/* Content Wrapper - Centers content with balanced spacing */}
        <div className={`
          transition-all duration-300 w-full
          bg-neutral-900
          ${sidebarCollapsed 
            ? '' 
            : 'max-w-[1400px] mx-auto'
          }
        `}>
          {/* Header */}
          <header className="sticky top-0 z-20 bg-gradient-to-b from-neutral-900 via-neutral-900/95 to-neutral-900/80 backdrop-blur-sm border-b border-white/10 shadow-lg">
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 min-w-0">
                  <img 
                    src="/golden-companies-logo.jpeg" 
                    alt="Golden Companies" 
                    className="h-14 w-auto flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <h1 className="text-3xl font-semibold tracking-tight text-white truncate">
                      {currentConfig?.name || 'Dashboard'} Dashboard
                    </h1>
                    <p className="text-sm text-white/60 truncate">
                      {currentConfig?.description || 'Task Management & Analytics'}
                    </p>
                  </div>
                </div>
                
                {/* Header Actions */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  {headerActions}
                </div>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <div className="p-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

