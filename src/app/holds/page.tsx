"use client";

import React, { useState, useEffect } from "react";
import DashboardLayout from '@/app/_components/DashboardLayout';
import { DashboardNavigationProvider } from '@/contexts/DashboardNavigationContext';
import { useDashboardNavigation } from '@/hooks/useDashboardNavigation';
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
import { SmallButton } from '@/app/_components/SmallButton';

function HoldsPageContent() {
  const { activeSection, setActiveSection } = useDashboardNavigation();
  const activeTab = activeSection as 'overview' | 'tasks' | 'assistance' | 'agents' | 'analytics';
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

  // Header actions
  const headerActions = (
    <>
      <button
        onClick={() => setShowSettings(true)}
        className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all text-sm font-medium"
      >
        ⚙️ Settings
      </button>
      <ThemeToggle />
      <SessionTimer remainingMinutes={Math.floor(timeUntilWarning / 60)} />
      <SmallButton
        onClick={extendSession}
        className="bg-blue-600 hover:bg-blue-700 text-white"
      >
        Extend
      </SmallButton>
      <SmallButton
        onClick={goToAgent}
        className="bg-green-600 hover:bg-green-700 text-white"
      >
        Switch to Agent
      </SmallButton>
      <SmallButton
        onClick={handleLogout}
        className="bg-red-600 hover:bg-red-700 text-white"
      >
        Logout
      </SmallButton>
    </>
  );

  return (
    <DashboardLayout headerActions={headerActions}>
      {/* Notification for new assistance requests */}
      {showNotification && newAssistanceCount > 0 && (
        <div className="fixed top-20 right-6 z-50 bg-gradient-to-r from-orange-600 to-red-600 text-white px-6 py-4 rounded-lg shadow-2xl border border-orange-400/30 animate-bounce">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🆘</span>
            <div>
              <p className="font-semibold text-lg">New Holds Assistance Requests!</p>
              <p className="text-sm text-white/90">{newAssistanceCount} agent{newAssistanceCount > 1 ? 's' : ''} need help</p>
            </div>
            <button
              onClick={() => {
                setShowNotification(false);
                setActiveSection('assistance');
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

      {/* Main content */}
      <div className="space-y-6">
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
