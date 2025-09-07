'use client';

import { usePathname } from 'next/navigation';

interface DashboardInfo {
  id: string;
  name: string;
  path: string;
  emoji: string;
  description: string;
  available: boolean;
}

const dashboards: DashboardInfo[] = [
  {
    id: 'text-club',
    name: 'Text Club',
    path: '/manager',
    emoji: '📱',
    description: 'Text Club Task Management & Analytics',
    available: true
  },
  {
    id: 'wod-ivcs',
    name: 'WOD/IVCS',
    path: '/wod-ivcs',
    emoji: '📦',
    description: 'WOD/IVCS Task Management & Analytics',
    available: true
  },
  {
    id: 'email-requests',
    name: 'Email Requests',
    path: '/email-requests',
    emoji: '📧',
    description: 'Email Request Task Management & Analytics',
    available: true // Now available!
  },
  {
    id: 'standalone-refunds',
    name: 'Standalone Refunds',
    path: '/standalone-refunds',
    emoji: '💰',
    description: 'Standalone Refund Task Management & Analytics',
    available: false // Coming soon
  }
];

export default function DashboardSwitcher() {
  const pathname = usePathname();
  const currentDashboard = dashboards.find(d => d.path === pathname);

  return (
    <div className="bg-white/5 border-b border-white/10">
      <div className="px-6 py-3">
        <div className="flex items-center gap-1 overflow-x-auto">
          {dashboards.map((dashboard) => {
            const isActive = pathname === dashboard.path;
            const isAvailable = dashboard.available;
            
            return (
              <button
                key={dashboard.id}
                onClick={() => {
                  if (isAvailable) {
                    window.location.href = dashboard.path;
                  }
                }}
                disabled={!isAvailable}
                className={`
                  px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap
                  ${isActive 
                    ? 'bg-blue-600 text-white shadow-lg' 
                    : isAvailable 
                      ? 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white' 
                      : 'bg-white/5 text-white/30 cursor-not-allowed'
                  }
                  ${isAvailable ? 'hover:scale-105' : ''}
                `}
                title={isAvailable ? dashboard.description : 'Coming Soon'}
              >
                <span className="mr-2">{dashboard.emoji}</span>
                {dashboard.name}
                {!isAvailable && (
                  <span className="ml-2 text-xs opacity-60">(Soon)</span>
                )}
              </button>
            );
          })}
        </div>
        
        {/* Current Dashboard Info */}
        {currentDashboard && (
          <div className="mt-2 text-xs text-white/50">
            {currentDashboard.emoji} {currentDashboard.description}
          </div>
        )}
      </div>
    </div>
  );
}
