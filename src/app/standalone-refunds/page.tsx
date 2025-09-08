"use client";

import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import DashboardSwitcher from '@/app/_components/DashboardSwitcher';

export default function StandaloneRefundsPage() {
  return (
    <main className="mx-auto max-w-[1400px] p-6 text-white dark:text-white light:text-slate-800 min-h-screen bg-gradient-to-br from-neutral-900 to-black dark:from-neutral-900 dark:to-black light:from-slate-50 light:to-slate-100">
      <header className="sticky top-0 z-30 bg-gradient-to-b from-neutral-900 via-neutral-900/95 to-neutral-900/80 dark:from-neutral-900 dark:via-neutral-900/95 dark:to-neutral-900/80 light:from-white light:via-white/95 light:to-white/80 backdrop-blur-sm border-b border-white/10 dark:border-white/10 light:border-slate-200 shadow-lg">
        <div className="px-6 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img 
                src="/golden-companies-logo.jpeg" 
                alt="Golden Companies" 
                className="h-8 w-8"
              />
              <div>
                <h1 className="text-2xl font-bold text-white">Standalone Refunds Dashboard</h1>
                <p className="text-sm text-white/60">Standalone Refund Task Management & Analytics</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-white/60">
                <span>🌞</span>
                <span>Session: 2h 0m</span>
                <SmallButton>Extend</SmallButton>
              </div>
              <SmallButton 
                onClick={() => window.location.href = '/agent'}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                Switch to Agent
              </SmallButton>
              <SmallButton className="bg-red-600 hover:bg-red-700 text-white">
                Logout
              </SmallButton>
            </div>
          </div>
        </div>
      </header>

      {/* Dashboard Switcher */}
      <DashboardSwitcher />

      {/* Coming Soon Content */}
      <div className="px-6 py-8">
        <Card className="p-8 text-center">
          <div className="text-6xl mb-4">💰</div>
          <h2 className="text-3xl font-bold text-white mb-4">Standalone Refunds Dashboard</h2>
          <p className="text-lg text-white/70 mb-6">
            This dashboard is coming soon! It will provide comprehensive management for standalone refund tasks.
          </p>
          <div className="bg-green-900/20 border border-green-800 rounded-lg p-4 max-w-2xl mx-auto">
            <h3 className="text-lg font-semibold text-green-300 mb-2">Planned Features:</h3>
            <ul className="text-left text-white/80 space-y-2">
              <li>• Direct integration with Google Sheets (Google Form data)</li>
              <li>• Refund amount tracking and validation</li>
              <li>• Payment method and reason categorization</li>
              <li>• Agent assignment and progress tracking</li>
              <li>• Custom dispositions with subcategories</li>
              <li>• Analytics and reporting</li>
              <li>• Unified assistance request system</li>
            </ul>
          </div>
          <div className="mt-6">
            <SmallButton 
              onClick={() => window.location.href = '/manager'}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Go to Text Club Dashboard
            </SmallButton>
          </div>
        </Card>
      </div>
    </main>
  );
}
