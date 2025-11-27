import { useState, useEffect, useRef } from 'react';

interface AssistanceRequest {
  id: string;
  status: string;
  taskType: string;
  [key: string]: any;
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
 * Hook for managing Holds assistance requests (isolated from other task types).
 * Handles fetching, state management, and new request detection for Holds only.
 */
export function useHoldsAssistanceRequests(): UseHoldsAssistanceRequestsReturn {
  const [assistanceRequests, setAssistanceRequests] = useState<AssistanceRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [showNotification, setShowNotification] = useState(false);
  const [newAssistanceCount, setNewAssistanceCount] = useState(0);
  
  // Track previous pending count to detect new requests
  const previousPendingCountRef = useRef(0);
  const isInitialLoadRef = useRef(true);

  const fetchAssistanceRequests = async () => {
    try {
      console.log("🔍 [Holds Assistance] Fetching assistance requests...");
      const response = await fetch("/api/manager/assistance", { cache: "no-store" });
      
      if (!response.ok) {
        console.error("🔍 [Holds Assistance] API error:", response.status, response.statusText);
        return;
      }

      const data = await response.json();
      
      if (data.success) {
        // Filter for HOLDS tasks only
        const holdsRequests = (data.requests || []).filter(
          (req: AssistanceRequest) => req.taskType === 'HOLDS'
        );
        
        // Count pending requests (status === 'ASSISTANCE_REQUIRED')
        const pendingRequests = holdsRequests.filter(
          (req: AssistanceRequest) => req.status === 'ASSISTANCE_REQUIRED'
        );
        const newPendingCount = pendingRequests.length;
        
        console.log("🔍 [Holds Assistance] Total requests:", holdsRequests.length);
        console.log("🔍 [Holds Assistance] Pending count:", newPendingCount);
        console.log("🔍 [Holds Assistance] Previous pending count:", previousPendingCountRef.current);
        
        // Detect new requests
        if (!isInitialLoadRef.current) {
          // Only show notification if there are new pending requests
          if (newPendingCount > previousPendingCountRef.current) {
            const newCount = newPendingCount - previousPendingCountRef.current;
            console.log("🔍 [Holds Assistance] New assistance requests detected:", newCount);
            setNewAssistanceCount(newCount);
            setShowNotification(true);
            
            // Auto-hide notification after 8 seconds
            setTimeout(() => {
              setShowNotification(false);
            }, 8000);
          } else if (newPendingCount === 0 && previousPendingCountRef.current > 0) {
            // All requests resolved - hide notification
            setShowNotification(false);
            setNewAssistanceCount(0);
          }
        } else {
          // On initial load, show notification if there are any pending requests
          if (newPendingCount > 0) {
            console.log("🔍 [Holds Assistance] Initial load: Found pending requests:", newPendingCount);
            setNewAssistanceCount(newPendingCount);
            setShowNotification(true);
            
            // Auto-hide notification after 8 seconds
            setTimeout(() => {
              setShowNotification(false);
            }, 8000);
          }
          isInitialLoadRef.current = false;
        }
        
        setAssistanceRequests(holdsRequests);
        setPendingCount(newPendingCount);
        previousPendingCountRef.current = newPendingCount;
      } else {
        console.error("🔍 [Holds Assistance] API returned error:", data.error);
      }
    } catch (error) {
      console.error("🔍 [Holds Assistance] Error fetching assistance requests:", error);
    }
  };

  // Initial fetch and setup polling
  useEffect(() => {
    fetchAssistanceRequests();
    
    // Poll every 30 seconds for new requests
    const interval = setInterval(fetchAssistanceRequests, 30000);
    
    return () => clearInterval(interval);
  }, []);

  return {
    assistanceRequests,
    pendingCount,
    showNotification,
    newAssistanceCount,
    setShowNotification,
    refresh: fetchAssistanceRequests,
  };
}

