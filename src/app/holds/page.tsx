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
import HoldsAnalytics from './_components/HoldsAnalytics';
import HoldsOverview from './_components/HoldsOverview';
import { SmallButton } from '@/app/_components/SmallButton';
import AssistanceRequestNotification from '@/app/_components/AssistanceRequestNotification';
import { useHoldsAssistanceRequests } from '@/hooks/useHoldsAssistanceRequests';
import {
  PORTAL_INACTIVITY_TIMEOUT_MINUTES,
  PORTAL_INACTIVITY_WARNING_MINUTES,
  performPortalLogout,
} from '@/lib/portal-session-timeout';

/**
 * Holds tab body — must render inside DashboardLayout so AssistanceRequestsProvider wraps this tree.
 */
function HoldsMain() {
  const { activeSection, setActiveSection } = useDashboardNavigation();
  const activeTab = activeSection as 'overview' | 'tasks' | 'assistance' | 'agents' | 'analytics';

  const {
    showNotification,
    newAssistanceCount,
    setShowNotification,
    refresh: refreshHoldsAssistance,
  } = useHoldsAssistanceRequests();

  return (
    <>
      <AssistanceRequestNotification
        show={showNotification}
        count={newAssistanceCount}
        onDismiss={() => setShowNotification(false)}
        onView={() => setShowNotification(false)}
      />

      <div className="space-y-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <HoldsOverview />
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="space-y-6">
            <CsvImportSection />
            <AssemblyLineQueues />
          </div>
        )}

        {activeTab === 'assistance' && (
          <div className="space-y-6">
            <AssistanceRequestsSection
              taskType="HOLDS"
              onResponseSent={async () => {
                await refreshHoldsAssistance();
              }}
            />
          </div>
        )}

        {activeTab === 'agents' && (
          <div className="text-center py-12 text-white/60">
            <p>Agent management features coming soon...</p>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <HoldsAnalytics />
          </div>
        )}
      </div>
    </>
  );
}

function HoldsPageContent() {
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordCheckDone, setPasswordCheckDone] = useState(false);

  const {
    timeLeft,
    showWarning: warningOpen,
    extendSession
  } = useAutoLogout({
    timeoutMinutes: PORTAL_INACTIVITY_TIMEOUT_MINUTES,
    warningMinutes: PORTAL_INACTIVITY_WARNING_MINUTES,
    onLogout: performPortalLogout,
  });

  useEffect(() => {
    const checkPassword = async () => {
      try {
        const res = await fetch('/api/auth/check-password-change');
        const data = await res.json();

        if (!res.ok || data.mustChangePassword) {
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

  const handleLogout = () => {
    performPortalLogout();
  };

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
      <HoldsMain />

      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}
      <AutoLogoutWarning
        isOpen={warningOpen}
        timeLeft={timeLeft}
        onExtend={extendSession}
        onLogout={performPortalLogout}
        sessionTimeoutMinutes={PORTAL_INACTIVITY_TIMEOUT_MINUTES}
      />
    </DashboardLayout>
  );
}

export default function HoldsPage() {
  return (
    <DashboardNavigationProvider>
      <HoldsPageContent />
    </DashboardNavigationProvider>
  );
}
