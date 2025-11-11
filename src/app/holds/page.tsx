"use client";

import { useState } from "react";
import DashboardSwitcher from '@/app/_components/DashboardSwitcher';
import CsvImportSection from './_components/CsvImportSection';
import AssemblyLineQueues from './_components/AssemblyLineQueues';
import AgentAssignmentSection from './_components/AgentAssignmentSection';
import HoldsAnalytics from './_components/HoldsAnalytics';

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
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="p-6 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                <h2 className="text-xl font-semibold mb-4 text-blue-200">📊 System Overview</h2>
                <p className="text-white/70 mb-4">
                  The Holds system manages assembly line workflows for order processing. 
                  Tasks flow through different queues based on their status and age.
                </p>
                <ul className="text-sm text-white/60 space-y-1">
                  <li>• Import CSV data from Google Sheets</li>
                  <li>• Manage 7 different assembly line queues</li>
                  <li>• Assign tasks to agents (max 200 per agent)</li>
                  <li>• Track 5-day aging from order date</li>
                  <li>• View detailed analytics and reports</li>
                </ul>
              </div>

              <div className="p-6 bg-green-900/20 border border-green-500/30 rounded-lg">
                <h2 className="text-xl font-semibold mb-4 text-green-200">🏭 Assembly Line Queues</h2>
                <p className="text-white/70 mb-4">
                  Tasks flow through these queues based on agent actions and age:
                </p>
                <ul className="text-sm text-white/60 space-y-1">
                  <li>• <strong>Agent Research</strong> - Initial review and formatting</li>
                  <li>• <strong>Customer Contact</strong> - 48-hour customer outreach window</li>
                  <li>• <strong>Escalated Call 5+ Day</strong> - Orders 5+ days old requiring calls</li>
                  <li>• <strong>Duplicates</strong> - Duplicate orders pending manager review</li>
                </ul>
              </div>

              <div className="p-6 bg-purple-900/20 border border-purple-500/30 rounded-lg">
                <h2 className="text-xl font-semibold mb-4 text-purple-200">⏰ 5-Day Aging System</h2>
                <p className="text-white/70 mb-4">
                  Aging is calculated from the "Order Date" in your CSV:
                </p>
                <ul className="text-sm text-white/60 space-y-1">
                  <li>• <span className="text-green-300">0-2 days</span> - Normal processing</li>
                  <li>• <span className="text-yellow-300">3-4 days</span> - Approaching limit</li>
                  <li>• <span className="text-red-300">5+ days</span> - Priority escalation</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'import' && <CsvImportSection />}
        {activeSection === 'queues' && <AssemblyLineQueues />}
        {activeSection === 'assignment' && <AgentAssignmentSection />}
        {activeSection === 'analytics' && <HoldsAnalytics />}
      </div>
    </div>
  );
}
