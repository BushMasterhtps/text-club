"use client";

import DashboardLayout from "@/app/_components/DashboardLayout";
import { SmallButton } from "@/app/_components/SmallButton";
import AutoLogoutWarning from "@/app/_components/AutoLogoutWarning";
import SessionTimer from "@/app/_components/SessionTimer";
import ThemeToggle from "@/app/_components/ThemeToggle";
import { DashboardNavigationProvider } from "@/contexts/DashboardNavigationContext";
import { useAutoLogout } from "@/hooks/useAutoLogout";
import {
  PORTAL_INACTIVITY_TIMEOUT_MINUTES,
  PORTAL_INACTIVITY_WARNING_MINUTES,
  performPortalLogout,
} from "@/lib/portal-session-timeout";
import { RoutingMatrixAdminContent } from "./_components/RoutingMatrixAdminContent";

function WorkflowAdminPageContent() {
  const { timeLeft, extendSession, showWarning } = useAutoLogout({
    timeoutMinutes: PORTAL_INACTIVITY_TIMEOUT_MINUTES,
    warningMinutes: PORTAL_INACTIVITY_WARNING_MINUTES,
    onLogout: performPortalLogout,
  });

  const headerActions = (
    <>
      <ThemeToggle />
      <SessionTimer timeLeft={timeLeft} onExtend={extendSession} />
      <SmallButton
        onClick={() => {
          window.location.href = "/agent";
        }}
        className="bg-green-600 hover:bg-green-700 text-white"
      >
        Switch to Agent
      </SmallButton>
      <SmallButton onClick={performPortalLogout} className="bg-red-600 hover:bg-red-700 text-white">
        Logout
      </SmallButton>
    </>
  );

  return (
    <DashboardLayout headerActions={headerActions}>
      <RoutingMatrixAdminContent />
      <AutoLogoutWarning
        isOpen={showWarning}
        timeLeft={timeLeft}
        onExtend={extendSession}
        onLogout={performPortalLogout}
        sessionTimeoutMinutes={PORTAL_INACTIVITY_TIMEOUT_MINUTES}
      />
    </DashboardLayout>
  );
}

export default function WorkflowAdminPage() {
  return (
    <DashboardNavigationProvider>
      <WorkflowAdminPageContent />
    </DashboardNavigationProvider>
  );
}
