import { useMemo } from "react";
import { useAssistanceRequestsContext } from "@/contexts/AssistanceRequestsContext";

interface AssistanceRequest {
  id: string;
  status: string;
  taskType: string;
  [key: string]: unknown;
}

interface UseHoldsAssistanceRequestsReturn {
  assistanceRequests: AssistanceRequest[];
  pendingCount: number;
  showNotification: boolean;
  newAssistanceCount: number;
  setShowNotification: (show: boolean) => void;
  refresh: () => Promise<void>;
}

/**
 * Holds assistance UI state — sourced from shared DashboardLayout assistance polling.
 */
export function useHoldsAssistanceRequests(): UseHoldsAssistanceRequestsReturn {
  const ctx = useAssistanceRequestsContext();
  if (!ctx) {
    throw new Error("useHoldsAssistanceRequests must be used within AssistanceRequestsProvider");
  }

  const holdsRequests = useMemo(
    () => ctx.requests.filter((r) => r.taskType === "HOLDS") as AssistanceRequest[],
    [ctx.requests],
  );

  return {
    assistanceRequests: holdsRequests,
    pendingCount: ctx.holdsPendingCount,
    showNotification: ctx.showHoldsNotification,
    newAssistanceCount: ctx.newHoldsAssistanceCount,
    setShowNotification: ctx.setShowHoldsNotification,
    refresh: () => ctx.refresh({ bypassCache: true }),
  };
}
