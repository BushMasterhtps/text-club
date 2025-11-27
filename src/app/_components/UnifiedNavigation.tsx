'use client';

import { useDashboardNavigation } from '@/hooks/useDashboardNavigation';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { NavigationItem } from '@/lib/navigation-config';

export default function UnifiedNavigation() {
  const {
    currentDashboard,
    activeSection,
    setActiveSection,
    navigationItems,
    dashboardConfigs,
  } = useDashboardNavigation();
  
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const router = useRouter();

  const handleNavigation = (item: NavigationItem) => {
    if (item.external && item.href) {
      window.location.href = item.href;
      return;
    }
    setActiveSection(item.id);
  };

  const handleDashboardSwitch = (dashboardPath: string) => {
    router.push(dashboardPath);
    setActiveSection('overview'); // Reset to overview when switching dashboards
  };

  const currentConfig = dashboardConfigs.find(d => d.id === currentDashboard);

  return (
    <>
      {/* Mobile Menu Button (hidden on desktop) */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 hover:bg-white/20 transition-colors"
        aria-label="Toggle sidebar"
      >
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky top-0 left-0 h-screen w-64
          bg-gradient-to-b from-neutral-900/95 to-neutral-900/90
          backdrop-blur-md border-r border-white/10
          z-40 transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          shadow-2xl
        `}
      >
        <div className="flex flex-col h-full p-4 space-y-6 overflow-y-auto">
          {/* Current Dashboard Section */}
          {currentConfig && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider px-3">
                Current Dashboard
              </h3>
              <div className="px-3 py-3 bg-blue-600/20 border border-blue-500/30 rounded-lg backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{currentConfig.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      {currentConfig.name}
                    </div>
                    <div className="text-xs text-white/60 truncate">
                      {currentConfig.description}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Items */}
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider px-3">
              Sections
            </h3>
            {navigationItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavigation(item)}
                className={`
                  w-full px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-all duration-200 flex items-center justify-between
                  relative group
                  ${
                    activeSection === item.id
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }
                `}
                title={item.description}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg flex-shrink-0">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && item.badge > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold flex-shrink-0 ml-2">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-white/10"></div>

          {/* Dashboard Switcher */}
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider px-3">
              Switch Dashboard
            </h3>
            {dashboardConfigs.map((dashboard) => (
              <button
                key={dashboard.id}
                onClick={() => handleDashboardSwitch(dashboard.path)}
                disabled={!dashboard.available}
                className={`
                  w-full px-3 py-2 rounded-lg text-sm font-medium
                  transition-all duration-200 flex items-center gap-3
                  ${
                    currentDashboard === dashboard.id
                      ? 'bg-blue-600/20 border border-blue-500/30 text-white'
                      : dashboard.available
                      ? 'text-white/70 hover:bg-white/10 hover:text-white'
                      : 'text-white/30 cursor-not-allowed opacity-50'
                  }
                `}
                title={dashboard.description}
              >
                <span className="text-lg flex-shrink-0">{dashboard.emoji}</span>
                <span className="truncate flex-1">{dashboard.name}</span>
                {!dashboard.available && (
                  <span className="ml-auto text-xs opacity-60 flex-shrink-0">(Soon)</span>
                )}
              </button>
            ))}
          </div>

          {/* Settings Link */}
          <div className="mt-auto pt-4 border-t border-white/10">
            <button
              onClick={() => setActiveSection('settings')}
              className={`
                w-full px-3 py-2.5 rounded-lg text-sm font-medium
                transition-all duration-200 flex items-center gap-3
                ${
                  activeSection === 'settings'
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }
              `}
            >
              <span className="text-lg">⚙️</span>
              <span>Settings</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </>
  );
}

