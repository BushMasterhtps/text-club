"use client";

import { useState, useEffect } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import DashboardSwitcher from '@/app/_components/DashboardSwitcher';

export default function HoldsPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading data
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-neutral-900 text-white">
      <DashboardSwitcher />
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6 text-white/90">Holds Dashboard</h1>
        
        <div className="mb-6 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
          <p className="text-blue-200">
            <strong>🚧 Holds Dashboard - In Development</strong><br/>
            This section is currently under development. Assembly line management for holds tasks will be available soon.
          </p>
        </div>

        {loading ? (
          <div className="text-white/60">Loading Holds data...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <h2 className="text-xl font-semibold mb-4">📊 Holds Overview</h2>
              <p className="text-white/70 mb-4">This section will display key metrics and an overview of holds tasks.</p>
              <SmallButton onClick={() => alert('Holds Overview - Coming Soon')}>
                View Details
              </SmallButton>
            </Card>

            <Card>
              <h2 className="text-xl font-semibold mb-4">📁 CSV Import</h2>
              <p className="text-white/70 mb-4">Import new holds tasks from CSV files here.</p>
              <SmallButton onClick={() => alert('CSV Import - Coming Soon')}>
                Import CSV
              </SmallButton>
            </Card>

            <Card>
              <h2 className="text-xl font-semibold mb-4">🏭 Assembly Line Queues</h2>
              <p className="text-white/70 mb-4">Visualize and manage tasks across different holds queues.</p>
              <SmallButton onClick={() => alert('Assembly Line Queues - Coming Soon')}>
                View Queues
              </SmallButton>
            </Card>

            <Card>
              <h2 className="text-xl font-semibold mb-4">👥 Agent Assignment</h2>
              <p className="text-white/70 mb-4">Assign holds tasks to agents.</p>
              <SmallButton onClick={() => alert('Agent Assignment - Coming Soon')}>
                Assign Tasks
              </SmallButton>
            </Card>

            <Card>
              <h2 className="text-xl font-semibold mb-4">📈 Holds Analytics</h2>
              <p className="text-white/70 mb-4">Detailed reports and analytics for holds tasks.</p>
              <SmallButton onClick={() => alert('Holds Analytics - Coming Soon')}>
                View Analytics
              </SmallButton>
            </Card>

            <Card>
              <h2 className="text-xl font-semibold mb-4">⏰ Aging Report</h2>
              <p className="text-white/70 mb-4">Track items approaching the 5-day limit.</p>
              <SmallButton onClick={() => alert('Aging Report - Coming Soon')}>
                View Report
              </SmallButton>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
