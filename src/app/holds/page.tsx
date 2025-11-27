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
import { AssistanceRequestsSection } from '@/app/manager/_components/AssistanceRequestsSection';
import CsvImportSection from './_components/CsvImportSection';
import AssemblyLineQueues from './_components/AssemblyLineQueues';
import AgentAssignmentSection from './_components/AgentAssignmentSection';
import HoldsAnalytics from './_components/HoldsAnalytics';
import HoldsOverview from './_components/HoldsOverview';
import { SmallButton } from '@/app/_components/SmallButton';
import AssistanceRequestNotification from '@/app/_components/AssistanceRequestNotification';
import { useHoldsAssistanceRequests } from '@/hooks/useHoldsAssistanceRequests';

function HoldsPageContent() {
  const { activeSection, setActiveSection } = useDashboardNavigation();
  const activeTab = activeSection as 'overview' | 'tasks' | 'assistance' | 'agents' | 'analytics';
  
  // Holds-specific assistance request management
  const {
    showNotification,
    newAssistanceCount,
    setShowNotification,
    refresh: refreshHoldsAssistance,
  } = useHoldsAssistanceRequests();
  
  // Password change modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordCheckDone, setPasswordCheckDone] = useState(false);
  
  const {
    timeLeft,
    showWarning: warningOpen,
    extendSession
  } = useAutoLogout({ 
    timeoutMinutes: 50,
    onLogout: () => {
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
  });


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

  // Assistance requests are now managed by useHoldsAssistanceRequests hook

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
      <ThemeToggle />
      <SessionTimer timeLeft={timeLeft} onExtend={extendSession} />
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
      {/* Unified Holds Assistance Request Notification */}
      <AssistanceRequestNotification
        show={showNotification}
        count={newAssistanceCount}
        onDismiss={() => setShowNotification(false)}
        onView={() => setShowNotification(false)}
      />

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
            <AssistanceRequestsSection 
              taskType="HOLDS"
              onResponseSent={async () => {
                // Refresh the notification hook when manager responds
                await refreshHoldsAssistance();
              }}
            />
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
      <AutoLogoutWarning
        isOpen={warningOpen}
        timeLeft={timeLeft}
        onExtend={extendSession}
        onLogout={() => {
          localStorage.removeItem('authToken');
          window.location.href = '/login';
        }}
      />
    </DashboardLayout>
  );
}

// Export with provider wrapper
export default function HoldsPage() {
  return (
    <DashboardNavigationProvider>
      <HoldsPageContent />
    </DashboardNavigationProvider>
  );
}
