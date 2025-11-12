"use client";

import { useState } from "react";
import DashboardSwitcher from '@/app/_components/DashboardSwitcher';
import CsvImportSection from './_components/CsvImportSection';
import AssemblyLineQueues from './_components/AssemblyLineQueues';
import AgentAssignmentSection from './_components/AgentAssignmentSection';
import HoldsAnalytics from './_components/HoldsAnalytics';
import HoldsOverview from './_components/HoldsOverview';

export default function HoldsPage() {
  const [activeSection, setActiveSection] = useState<'overview' | 'import' | 'queues' | 'assignment' | 'analytics'>('overview');

  return (
    <div className="min-h-screen bg-neutral-900 text-white">
      <DashboardSwitcher />
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6 text-white/90">Holds Dashboard</h1>
        
        <div className="mb-6 p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
          <p className="text-green-200">
            <strong>✅ Holds Dashboard - Fully Functional</strong><br/>
            Assembly line management for holds tasks is now available. Import CSV data, manage queues, assign tasks, and view analytics.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setActiveSection('overview')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeSection === 'overview'
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            📊 Overview
          </button>
          <button
            onClick={() => setActiveSection('import')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeSection === 'import'
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            📁 CSV Import
          </button>
          <button
            onClick={() => setActiveSection('queues')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeSection === 'queues'
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            🏭 Assembly Line Queues
          </button>
          <button
            onClick={() => setActiveSection('assignment')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeSection === 'assignment'
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            👥 Agent Assignment
          </button>
          <button
            onClick={() => setActiveSection('analytics')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeSection === 'analytics'
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            📈 Analytics & Reports
          </button>
        </div>

        {/* Content Sections */}
        {activeSection === 'overview' && (
          <HoldsOverview />
        )}

        {activeSection === 'import' && <CsvImportSection />}
        {activeSection === 'queues' && <AssemblyLineQueues />}
        {activeSection === 'assignment' && <AgentAssignmentSection />}
        {activeSection === 'analytics' && <HoldsAnalytics />}
      </div>
    </div>
  );
}
