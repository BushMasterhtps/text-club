"use client";

import React, { useState, useEffect } from "react";
import DashboardSwitcher from '@/app/_components/DashboardSwitcher';
import ChangePasswordModal from '@/app/_components/ChangePasswordModal';
import { useAutoLogout } from '@/hooks/useAutoLogout';
import AutoLogoutWarning from '@/app/_components/AutoLogoutWarning';
import SessionTimer from '@/app/_components/SessionTimer';
import ThemeToggle from '@/app/_components/ThemeToggle';
import UnifiedSettings from '@/app/_components/UnifiedSettings';
import { AssistanceRequestsSection } from '@/app/manager/_components/AssistanceRequestsSection';
import CsvImportSection from './_components/CsvImportSection';
import AssemblyLineQueues from './_components/AssemblyLineQueues';
import AgentAssignmentSection from './_components/AgentAssignmentSection';
import HoldsAnalytics from './_components/HoldsAnalytics';
import HoldsOverview from './_components/HoldsOverview';

export default function HoldsPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'assistance' | 'agents' | 'analytics'>('overview');
  const [assistanceRequests, setAssistanceRequests] = useState<any[]>([]);
  const [newAssistanceCount, setNewAssistanceCount] = useState(0);
  const [showNotification, setShowNotification] = useState(false);
  
  // Password change modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordCheckDone, setPasswordCheckDone] = useState(false);
  
  const {
    warningOpen,
    remainingTime: timeUntilWarning,
    extendSession,
    forceLogout
  } = useAutoLogout({ inactivityMinutes: 120 });

  // Settings modal
  const [showSettings, setShowSettings] = useState(false);

  // Check password requirement
  React.useEffect(() => {
    const checkPassword = async () => {
      try {
        const res = await fetch('/api/auth/check-password-change');
        const data = await res.json();
        
        if (!res.ok || data.requiresChange) {
          setShowPasswordModal(true);
        }
        setPasswordCheckDone(true);
      } catch (err) {
        console.error('Failed to check password status:', err);
        setPasswordCheckDone(true);
      }
    };
    checkPassword();
  }, []);

  // Load assistance requests
  const loadAssistanceRequests = async () => {
    try {
      console.log("🔍 [Holds] Loading assistance requests...");
      const response = await fetch('/api/manager/assistance', { cache: 'no-store' });
      console.log("🔍 [Holds] Assistance API response status:", response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log("🔍 [Holds] Assistance API data:", data);
        
        if (data.success) {
          // Filter for HOLDS tasks only
          const holdsRequests = data.requests.filter((req: any) => req.taskType === 'HOLDS');
          console.log("🔍 [Holds] Holds requests count:", holdsRequests.length);
          
          setAssistanceRequests(holdsRequests);
          
          // Check for pending requests
          const pendingRequests = holdsRequests.filter((req: any) => req.status === 'ASSISTANCE_REQUIRED');
          const currentPendingCount = assistanceRequests.filter((r: any) => r.status === 'ASSISTANCE_REQUIRED').length;
          const newPendingCount = pendingRequests.length;
          
          console.log("🔍 [Holds] Current pending count:", currentPendingCount, "New pending count:", newPendingCount);
          
          // Show notification if there are pending requests
          if (pendingRequests.length > 0 && (newAssistanceCount === 0 || pendingRequests.length > newAssistanceCount)) {
            console.log("🔍 [Holds] New pending assistance requests detected!");
            setShowNotification(true);
            setTimeout(() => setShowNotification(false), 5000);
          }
          
          setNewAssistanceCount(pendingRequests.length);
        }
      } else {
        console.error("🔍 [Holds] Assistance API error:", response.status, response.statusText);
      }
    } catch (error) {
      console.error("🔍 [Holds] Error loading assistance requests:", error);
    }
  };

  useEffect(() => {
    loadAssistanceRequests();
    const interval = setInterval(loadAssistanceRequests, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('authToken');
    window.location.href = '/login';
  };

  // Go to agent portal
  const goToAgent = () => {
    window.location.href = '/agent';
  };

  if (!passwordCheckDone) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-900 to-black flex items-center justify-center">
        <p className="text-white/60">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-900 to-black text-white">
      {/* Notification for new assistance requests */}
      {showNotification && newAssistanceCount > 0 && (
        <div className="fixed top-4 right-4 z-50 bg-gradient-to-r from-orange-600 to-red-600 text-white px-6 py-4 rounded-lg shadow-2xl border border-orange-400/30 animate-bounce">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🆘</span>
            <div>
              <p className="font-semibold text-lg">New Holds Assistance Requests!</p>
              <p className="text-sm text-white/90">{newAssistanceCount} agent{newAssistanceCount > 1 ? 's' : ''} need help</p>
            </div>
            <button
              onClick={() => {
                setShowNotification(false);
                setActiveTab('assistance');
              }}
              className="ml-4 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
            >
              View
            </button>
            <button
              onClick={() => setShowNotification(false)}
              className="ml-2 text-white/70 hover:text-white text-xl"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Top header with logo and title */}
      <div className="bg-neutral-900/50 border-b border-white/10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Left: Logo + Title */}
            <div className="flex items-center gap-3">
              <img 
                src="/golden-companies-logo.jpeg" 
                alt="Golden Companies" 
                className="h-14 w-auto"
              />
              <div>
                <h1 className="text-2xl font-bold text-white/90">Holds Dashboard</h1>
                <p className="text-sm text-white/50">Holds Assembly Line Management & Analytics</p>
              </div>
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSettings(true)}
                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all text-sm font-medium"
              >
                ⚙️ Settings
              </button>
              <ThemeToggle />
              <SessionTimer remainingMinutes={Math.floor(timeUntilWarning / 60)} />
              <button
                onClick={extendSession}
                className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-all text-sm font-medium"
              >
                Extend
              </button>
              <button
                onClick={goToAgent}
                className="px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-all text-sm font-medium"
              >
                Switch to Agent
              </button>
              <button
                onClick={handleLogout}
                className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-all text-sm font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main navigation tabs */}
      <div className="bg-white/5 border-b border-white/10">
        <div className="px-6">
          <div className="flex items-center gap-1 overflow-x-auto">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-3 text-sm font-medium transition-all border-b-2 ${
                activeTab === 'overview'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              📊 Overview
            </button>
            <button
              onClick={() => setActiveTab('tasks')}
              className={`px-4 py-3 text-sm font-medium transition-all border-b-2 ${
                activeTab === 'tasks'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              📋 Task Management
            </button>
            <button
              onClick={() => setActiveTab('assistance')}
              className={`px-4 py-3 text-sm font-medium transition-all border-b-2 relative ${
                activeTab === 'assistance'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              🆘 Assistance Requests
              {newAssistanceCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                  {newAssistanceCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('agents')}
              className={`px-4 py-3 text-sm font-medium transition-all border-b-2 ${
                activeTab === 'agents'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              👥 Agent Management
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-4 py-3 text-sm font-medium transition-all border-b-2 ${
                activeTab === 'analytics'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              📈 Analytics
            </button>
          </div>
        </div>
      </div>

      {/* Dashboard switcher */}
      <DashboardSwitcher />

      {/* Main content */}
      <div className="container mx-auto p-6 space-y-6">
        {/* Overview Tab - Only stats and live agent status */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <HoldsOverview />
          </div>
        )}

        {/* Task Management Tab - CSV Import + Workflow Queues */}
        {activeTab === 'tasks' && (
          <div className="space-y-6">
            <CsvImportSection />
            <AssemblyLineQueues />
          </div>
        )}

        {/* Assistance Requests Tab */}
        {activeTab === 'assistance' && (
          <div className="space-y-6">
            <AssistanceRequestsSection taskType="HOLDS" />
          </div>
        )}

        {/* Agent Management Tab */}
        {activeTab === 'agents' && (
          <div className="text-center py-12 text-white/60">
            <p>Agent management features coming soon...</p>
          </div>
        )}

        {/* Analytics Tab - Reports */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <HoldsAnalytics />
          </div>
        )}
      </div>

      {/* Modals */}
      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}
      {showSettings && (
        <UnifiedSettings onClose={() => setShowSettings(false)} />
      )}
      <AutoLogoutWarning
        isOpen={warningOpen}
        onExtend={extendSession}
        onLogout={forceLogout}
      />
    </div>
  );
}
