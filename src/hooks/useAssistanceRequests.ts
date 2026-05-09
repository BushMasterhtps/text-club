import { useMemo } from "react";
import { useAssistanceRequestsContext } from "@/contexts/AssistanceRequestsContext";

interface AssistanceRequest {
  id: string;
  status: string;
  taskType: string;
  [key: string]: unknown;
}

interface UseAssistanceRequestsReturn {
  assistanceRequests: AssistanceRequest[];
  pendingCount: number;
  showNotification: boolean;
  newAssistanceCount: number;
  setShowNotification: (show: boolean) => void;
  refresh: () => Promise<void>;
}

function isNonHoldsCrossVisible(req: AssistanceRequest): boolean {
  const t = req.taskType;
  return (
    t !== "HOLDS" &&
    (t === "TEXT_CLUB" ||
      t === "WOD_IVCS" ||
      t === "EMAIL_REQUESTS" ||
      t === "YOTPO" ||
      t === "STANDALONE_REFUNDS")
  );
}

/**
 * Non-Holds assistance slice — sourced from shared DashboardLayout assistance polling.
 * Prefer useAssistanceRequestsContext directly in new code.
 */
export function useAssistanceRequests(): UseAssistanceRequestsReturn {
  const ctx = useAssistanceRequestsContext();
  if (!ctx) {
    throw new Error("useAssistanceRequests must be used within AssistanceRequestsProvider");
  }

  const assistanceRequests = useMemo(
    () => ctx.requests.filter((r) => isNonHoldsCrossVisible(r as AssistanceRequest)) as AssistanceRequest[],
    [ctx.requests],
  );

  return {
    assistanceRequests,
    pendingCount: ctx.nonHoldsPendingCount,
    showNotification: ctx.showNotification,
    newAssistanceCount: ctx.newAssistanceCount,
    setShowNotification: ctx.setShowNotification,
    refresh: () => ctx.refresh({ bypassCache: true }),
  };
}
