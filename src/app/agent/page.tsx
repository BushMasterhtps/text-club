"use client";

import { useState, useEffect, useRef } from "react";
import ChangePasswordModal from '@/app/_components/ChangePasswordModal';
import ThemeToggle from '@/app/_components/ThemeToggle';
import AgentOneOnOneNotes from '@/app/_components/AgentOneOnOneNotes';
import KnowledgeSection from '@/app/_components/KnowledgeSection';
import { Toast } from '@/app/_components/Toast';
import { useTaskStore } from '@/stores/useTaskStore';
import KanbanBoard from '@/app/agent/_components/KanbanBoard';
import { generateTestTasks } from '@/lib/test-data-generator';

/* ========== Tiny UI atoms (iOS-ish) ========== */
function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl bg-white/[0.02] dark:bg-white/[0.02] light:bg-white/80 ring-1 ring-white/10 dark:ring-white/10 light:ring-gray-200 backdrop-blur-md ${className}`}
    >
      {children}
    </section>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold text-white/90 dark:text-white/90 light:text-gray-800 tracking-tight">{children}</h2>
  );
}

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "success" | "danger" | "muted" | "warning";
}) {
  const toneClasses =
    tone === "success"
      ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
      : tone === "danger"
      ? "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30"
      : tone === "muted"
      ? "bg-white/5 text-white/70 ring-1 ring-white/10"
      : tone === "warning"
      ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30"
      : "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${toneClasses}`}>
      {children}
    </span>
  );
}

function SmallButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={`px-2.5 py-1 rounded-md text-xs font-medium bg-white/5 dark:bg-white/5 light:bg-gray-100 hover:bg-white/10 dark:hover:bg-white/10 light:hover:bg-gray-200 active:bg-white/15 dark:active:bg-white/15 light:active:bg-gray-300 ring-1 ring-white/10 dark:ring-white/10 light:ring-gray-300 text-white dark:text-white light:text-gray-800 disabled:opacity-50 ${className}`}
    />
  );
}

function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={`px-3 py-1.5 rounded-md text-sm font-semibold bg-gradient-to-r from-sky-500/90 to-indigo-500/90 hover:from-sky-500 hover:to-indigo-500 text-white ring-1 ring-sky-400/40 disabled:opacity-50 ${className}`}
    />
  );
}

interface Task {
  id: string;
  brand: string;
  phone: string;
  text: string;
  status: "PENDING" | "IN_PROGRESS" | "ASSISTANCE_REQUIRED" | "RESOLVED" | "COMPLETED";
  assignedToId: string;
  startTime?: string;
  endTime?: string;
  durationSec?: number;
  disposition?: string;
  assistanceNotes?: string;
  managerResponse?: string;
  createdAt: string;
  updatedAt: string;
  taskType?: string;
  // WOD/IVCS specific fields
  wodIvcsSource?: string;
  documentNumber?: string;
  warehouseEdgeStatus?: string;
  amount?: number;
  webOrderDifference?: number;
  webOrder?: string;
  webOrderSubtotal?: number;
  webOrderTotal?: number;
  nsVsWebDiscrepancy?: number;
  customerName?: string;
  netSuiteTotal?: number;
  webTotal?: number;
  webVsNsDifference?: number;
  shippingCountry?: string;
  shippingState?: string;
  purchaseDate?: string;
  orderAge?: string;
  orderAgeDays?: number;
  // Email Request specific fields
  emailRequestFor?: string;
  details?: string;
  timestamp?: string;
  completionTime?: string;
  salesforceCaseNumber?: string;
  customerNameNumber?: string;
  salesOrderId?: string;
  // Standalone Refund specific fields
  amountToBeRefunded?: number;
  verifiedRefund?: boolean;
  paymentMethod?: string;
  refundReason?: string;
  productSku?: string;
  quantity?: number;
  refundAmount?: number;
  // Yotpo specific fields
  yotpoDateSubmitted?: string;
  yotpoPrOrYotpo?: string;
  yotpoCustomerName?: string;
  yotpoEmail?: string;
  yotpoOrderDate?: string;
  yotpoProduct?: string;
  yotpoIssueTopic?: string;
  yotpoReviewDate?: string;
  yotpoReview?: string;
  yotpoSfOrderLink?: string;
  // Holds specific fields
  holdsOrderDate?: string;
  holdsOrderNumber?: string;
  holdsCustomerEmail?: string;
  holdsPriority?: number;
  holdsStatus?: string;
  holdsDaysInSystem?: number;
  holdsOrderAmount?: number;
  holdsQueueHistory?: any;
  holdsNotes?: string;
}

interface AgentStats {
  assigned: number;
  completed: number;
  avgDuration: number;
  assistanceSent: number;
  lastUpdate: string;
}

export default function AgentPage() {
  // SECURITY: Middleware handles auth - client-side guard removed to prevent login loops
  // The middleware already verifies JWT and role, which is sufficient protection
  
  const [email, setEmail] = useState<string>("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<AgentStats | null>(null);
  
  // Zustand store
  const { setTasks: setStoreTasks, mergeTasks, setSortOrder: setStoreSortOrder, sortOrder: storeSortOrder } = useTaskStore();
  
  // View mode: 'list' or 'kanban'
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  // Use ref to ensure polling always has current viewMode (avoid closure issues)
  const viewModeRef = useRef<'list' | 'kanban'>('list');
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);
  
  // Test mode (when no database connection)
  const [useTestData, setUseTestData] = useState(false);
  
  // New state for interactive features
  const [welcomeMessage, setWelcomeMessage] = useState<string>("");
  const [showCompletedTasks, setShowCompletedTasks] = useState<boolean>(false);
  const [completedTasksToday, setCompletedTasksToday] = useState<Task[]>([]);
  const [lastActivityTime, setLastActivityTime] = useState<Date>(new Date());
  const [taskStreak, setTaskStreak] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [startedTasks, setStartedTasks] = useState<Set<string>>(new Set());
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  
  // Task filtering state
  const [selectedTaskType, setSelectedTaskType] = useState<string>("ALL");
  const [taskCounts, setTaskCounts] = useState<{
    TEXT_CLUB: number;
    WOD_IVCS: number;
    EMAIL_REQUESTS: number;
    YOTPO: number;
    HOLDS: number;
    STANDALONE_REFUNDS: number;
  }>({
    TEXT_CLUB: 0,
    WOD_IVCS: 0,
    EMAIL_REQUESTS: 0,
    YOTPO: 0,
    HOLDS: 0,
    STANDALONE_REFUNDS: 0
  });
  
  const [completionStats, setCompletionStats] = useState<{
    today: Record<string, number>;
    total: Record<string, number>;
  }>({
    today: { TEXT_CLUB: 0, WOD_IVCS: 0, EMAIL_REQUESTS: 0, YOTPO: 0, HOLDS: 0, STANDALONE_REFUNDS: 0 },
    total: { TEXT_CLUB: 0, WOD_IVCS: 0, EMAIL_REQUESTS: 0, YOTPO: 0, HOLDS: 0, STANDALONE_REFUNDS: 0 }
  });
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [forceRender, setForceRender] = useState(0);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const sortOrderRef = useRef<'asc' | 'desc'>(sortOrder);
  useEffect(() => { sortOrderRef.current = sortOrder; }, [sortOrder]);

  // Personal Scorecard state
  const [scorecardData, setScorecardData] = useState<any>(null);
  const [loadingScorecard, setLoadingScorecard] = useState(false);
  const [showScorecard, setShowScorecard] = useState(true); // Expanded by default
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [selectedSprint, setSelectedSprint] = useState<'current' | number>('current');
  
  // Track selected sprint in a ref so polling can access current value
  const selectedSprintRef = useRef<'current' | number>(selectedSprint);
  useEffect(() => { selectedSprintRef.current = selectedSprint; }, [selectedSprint]);
  const [sprintHistory, setSprintHistory] = useState<any[]>([]);
  const [loadingSprintHistory, setLoadingSprintHistory] = useState(false);

  // One-on-One Notes
  const [showOneOnOneNotes, setShowOneOnOneNotes] = useState(false);

  // Password change modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  // Toast notification state for manager responses
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'info' | 'warning' | 'error'>('info');

  const [isClient, setIsClient] = useState(false);


  // Check if we're on the client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Check if agent is authenticated and start polling
  useEffect(() => {
    if (!isClient) return;
    
    // First check if user is authenticated via API
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.user) {
            // User is authenticated, set their email
            const userEmail = data.user.email;
            localStorage.setItem('agentEmail', userEmail);
            setEmail(userEmail);
            console.log("🔐 Agent authenticated via API:", userEmail);
            return;
          }
        }
      } catch (error) {
        console.error("Auth check failed:", error);
      }
      
      // Fallback to localStorage check
      const savedEmail = localStorage.getItem('agentEmail');
      if (savedEmail) {
        console.log("🔐 Agent authenticated via localStorage:", savedEmail);
        setEmail(savedEmail);
      }
    };
    
    checkAuth();
  }, [isClient]);

  // Start polling when email is set
  useEffect(() => {
    if (!email) return;
    
    // Send initial heartbeat
    sendHeartbeat(email);
      
    // Wait a bit for state to update, then start polling
    setTimeout(() => {
      console.log("🚀 Starting initial load and polling...");
      loadTasks(email);
      loadStats(email);
      loadScorecard(email);
      startPolling();
    }, 100);
  }, [email]);

  // Send heartbeat every 30 seconds to update lastSeen
  useEffect(() => {
    if (!email) return;
    
    const heartbeatInterval = setInterval(() => {
      sendHeartbeat(email);
    }, 30000);
    
    return () => clearInterval(heartbeatInterval);
  }, [email]);

  // Update welcome message when stats change
  useEffect(() => {
    if (stats) {
      setTaskStreak(stats.completed);
      updateWelcomeMessage();
    }
  }, [stats, lastActivityTime]);

  // Update welcome message every minute to check for away status
  useEffect(() => {
    if (!email) return;
    
    const welcomeInterval = setInterval(() => {
      updateWelcomeMessage();
    }, 60000); // Check every minute
    
    return () => clearInterval(welcomeInterval);
  }, [email, lastActivityTime, taskStreak]);

  // Track activity when tasks are completed or started
  useEffect(() => {
    setLastActivityTime(new Date());
  }, [tasks]);

  // Check if user needs to change password and get current user role
  useEffect(() => {
    const checkPasswordChange = async () => {
      try {
        const response = await fetch('/api/auth/check-password-change', { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          if (data.mustChangePassword) {
            setShowPasswordModal(true);
          }
        }
      } catch (error) {
        console.error('Error checking password change status:', error);
      }
    };
    
    const getCurrentUserRole = async () => {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          setCurrentUserRole(data.user?.role || null);
        }
      } catch (error) {
        console.error('Error getting current user role:', error);
      }
    };
    
    if (email) {
      checkPasswordChange();
      getCurrentUserRole();
    }
  }, [email]);

  const sendHeartbeat = async (userEmail: string) => {
    try {
      await fetch('/api/manager/users/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail })
      });
    } catch (error) {
      console.error('Heartbeat error:', error);
    }
  };

  // Function to get first name from email
  function getFirstName(email: string): string {
    const name = email.split('@')[0];
    return name.split('.')[0].charAt(0).toUpperCase() + name.split('.')[0].slice(1);
  }

  // Function to update welcome message based on activity
  function updateWelcomeMessage() {
    if (!email) return;
    
    const firstName = getFirstName(email);
    const now = new Date();
    const timeSinceActivity = now.getTime() - lastActivityTime.getTime();
    const minutesSinceActivity = Math.floor(timeSinceActivity / (1000 * 60));
    
    // Check if agent has been inactive for 10+ minutes
    if (minutesSinceActivity >= 10) {
      const awayTime = lastActivityTime.toLocaleString();
      setWelcomeMessage(`😴 Away Since ${awayTime}`);
      return;
    }
    
    // Check for task streak
    if (taskStreak >= 5) {
      setWelcomeMessage(`🔥 ${taskStreak} done! You're on fire! 🔥`);
      return;
    }
    
    // Default welcome message
    setWelcomeMessage(`👋 Welcome, ${firstName}!`);
  }

  // Function to load completed tasks for today
  async function loadCompletedTasksToday() {
    if (!email) return;
    
    try {
      const response = await fetch(`/api/agent/completed-today?email=${encodeURIComponent(email)}`);
      if (response.ok) {
        const data = await response.json();
        setCompletedTasksToday(data.tasks || []);
      }
    } catch (error) {
      console.error("Failed to load completed tasks:", error);
    }
  }

  const startPolling = (orderOverride?: 'asc' | 'desc') => {
    if (pollingInterval) clearInterval(pollingInterval);
    console.log("🔄 Starting SIMPLE polling system...");
    
    // Scorecard polling counter (refresh every 15 cycles = 30 seconds)
    let scorecardPollCount = 0;
    
    // Polling every 5 seconds (as per requirements)
    const interval = setInterval(async () => {
      console.log("🔄 SIMPLE Polling for updates...");
      const currentEmail = localStorage.getItem('agentEmail');
      console.log("🔄 SIMPLE Current email:", currentEmail);
      
      if (currentEmail) {
        try {
          console.log("🔄 SIMPLE About to fetch tasks...");
          const effectiveOrder = orderOverride ?? sortOrderRef.current;
          const url = `/api/agent/tasks?email=${encodeURIComponent(currentEmail)}&order=${effectiveOrder}`;
          console.log("🔄 SIMPLE Fetching from:", url);
          
          const res = await fetch(url);
          console.log("🔄 SIMPLE Response status:", res.status);
          
          if (res.ok) {
            const data = await res.json();
            console.log("🔄 SIMPLE Response data:", data);
            
            if (data.success) {
              const newTasks = data.tasks;
              console.log("🔄 SIMPLE Loaded tasks:", newTasks.length);
              
              // Check for new manager responses (tasks that now have a response but didn't before)
              const previousResponses = new Map(tasks.map((t: any) => [t.id, t.managerResponse]));
              
              const newResponses = newTasks.filter((t: any) => {
                const hadResponse = previousResponses.get(t.id);
                return t.managerResponse && !hadResponse; // New response that wasn't there before
              });
              
              if (newResponses.length > 0) {
                console.log("🔄 SIMPLE Found new manager responses:", newResponses.length);
                // Show toast notification for new manager responses
                const taskTypeInfo = newResponses[0].taskType === 'TEXT_CLUB' ? 'Text Club' :
                                   newResponses[0].taskType === 'WOD_IVCS' ? 'WOD/IVCS' :
                                   newResponses[0].taskType === 'EMAIL_REQUESTS' ? 'Email Request' :
                                   newResponses[0].taskType === 'YOTPO' ? 'Yotpo' :
                                   newResponses[0].taskType === 'HOLDS' ? 'Holds' : 'Task';
                setToastMessage(`💬 Manager responded to your ${taskTypeInfo} assistance request!`);
                setToastType('info');
              }
              
              // Update tasks (React will handle rendering manager responses)
              setTasks(newTasks);
              // Also update Zustand store
              if (viewMode === 'kanban') {
                // Merge tasks (no reordering) for Kanban
                mergeTasks(newTasks);
              } else {
                // Full update for List view
                setStoreTasks(newTasks);
              }
              setLastUpdate(new Date());
           }
          }
        } catch (error) {
          console.error("🔄 SIMPLE Polling error:", error);
        }
        
        // Refresh scorecard every 30 seconds (15 polling cycles)
        // BUT only if viewing current sprint (historical sprints don't need auto-refresh)
        scorecardPollCount++;
        if (scorecardPollCount >= 15) {
          // Only auto-refresh if viewing current sprint
          // Historical sprints don't change, so no need to refresh them
          // Use ref to get current value (closure-safe)
          if (selectedSprintRef.current === 'current') {
            console.log("📊 Auto-refreshing scorecard (current sprint)...");
            // Skip cache during polling refresh to ensure we get fresh data
            // This prevents stale cached data from overwriting recent task completions
            loadScorecard(currentEmail, true).catch(err => console.error("Failed to refresh scorecard:", err));
          } else {
            console.log("📊 Skipping scorecard auto-refresh (viewing historical sprint)");
          }
          scorecardPollCount = 0; // Reset counter
        }
      } else {
        console.log("🔄 SIMPLE No email available");
      }
    }, 5000); // 5 seconds polling
    
    setPollingInterval(interval);
  };

  const stopPolling = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  };

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  const loadTasks = async (emailToUse?: string, orderOverride?: 'asc' | 'desc', useTestMode?: boolean) => {
    console.log("📥 loadTasks called with emailToUse:", emailToUse);
    const currentEmail = emailToUse || email;
    console.log("📥 currentEmail resolved to:", currentEmail);
    
    // Test data mode
    if (useTestMode || useTestData) {
      console.log("🧪 Using test data mode");
      setLoading(true);
      try {
        const testTasks = generateTestTasks(80);
        setTasks(testTasks);
        setStoreTasks(testTasks);
        setStoreSortOrder(orderOverride ?? sortOrderRef.current);
        setLastUpdate(new Date());
      } catch (error) {
        console.error("Error loading test data:", error);
      } finally {
        setLoading(false);
      }
      return;
    }
    
    if (!currentEmail) {
      console.log("❌ No email, skipping loadTasks");
      return;
    }
    console.log("📥 Loading tasks for:", currentEmail);
    setLoading(true);
    try {
      const effectiveOrder = orderOverride ?? sortOrderRef.current;
      setStoreSortOrder(effectiveOrder);
      const url = `/api/agent/tasks?email=${encodeURIComponent(currentEmail)}&order=${effectiveOrder}`;
      console.log("🌐 Fetching from:", url);
      const res = await fetch(url);
      console.log("📡 Response status:", res.status, res.statusText);
      
      if (!res.ok) {
        console.error("❌ API call failed:", res.status, res.statusText);
        return;
      }
      
      const data = await res.json();
      console.log("📦 Response data:", data);
      if (data.success) {
        const newTasks = data.tasks;
        console.log("📥 Loaded tasks:", newTasks.length, "tasks");
        
        // Check for manager responses
        const tasksWithResponses = newTasks.filter((t: any) => t.managerResponse);
        if (tasksWithResponses.length > 0) {
          console.log("💬 Found tasks with manager responses:", tasksWithResponses.length);
          tasksWithResponses.forEach((task: Task, index: number) => {
            console.log(`💬 Response ${index + 1}:`, {
              id: task.id,
              status: task.status,
              response: task.managerResponse
            });
          });
        } else {
          console.log("❌ No tasks with manager responses found");
        }
        
        // Always update tasks to ensure UI reflects latest data
        setTasks(newTasks);
        // Also update Zustand store
        // CRITICAL: Use ref to get current viewMode (avoid closure issues)
        const currentViewMode = viewModeRef.current;
        if (currentViewMode === 'kanban') {
          // Merge tasks (no reordering) for Kanban - preserves COMPLETED tasks
          mergeTasks(newTasks);
        } else {
          // Full update for List view (doesn't need COMPLETED tasks)
          setStoreTasks(newTasks);
        }
        setLastUpdate(new Date());
        
        // Calculate task counts
        const counts = {
          TEXT_CLUB: newTasks.filter((t: Task) => t.taskType === "TEXT_CLUB").length,
          WOD_IVCS: newTasks.filter((t: Task) => t.taskType === "WOD_IVCS").length,
          EMAIL_REQUESTS: newTasks.filter((t: Task) => t.taskType === "EMAIL_REQUESTS").length,
          YOTPO: newTasks.filter((t: Task) => t.taskType === "YOTPO").length,
          HOLDS: newTasks.filter((t: Task) => t.taskType === "HOLDS").length,
          STANDALONE_REFUNDS: newTasks.filter((t: Task) => t.taskType === "STANDALONE_REFUNDS").length
        };
        setTaskCounts(counts);
        
        // Manager responses are now handled by React rendering only (no DOM manipulation)
        
        console.log("✅ Tasks updated, last update set to:", new Date().toLocaleTimeString());
      } else {
        console.error("❌ API returned success: false:", data);
      }
    } catch (error) {
      console.error("❌ Failed to load tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filter tasks based on selected task type
  const filteredTasks = selectedTaskType === "ALL" 
    ? tasks 
    : tasks.filter(task => task.taskType === selectedTaskType);

  const loadCompletionStats = async (emailToUse?: string, dateToUse?: string) => {
    const currentEmail = emailToUse || email;
    // Use the selected date, not always today's date
    const currentDate = dateToUse || selectedDate;
    
    if (!currentEmail) return;
    
    try {
      const response = await fetch(`/api/agent/completion-stats?email=${encodeURIComponent(currentEmail)}&date=${encodeURIComponent(currentDate)}`);
      const data = await response.json();
      
      if (data.success) {
        setCompletionStats(data.stats);
      } else {
        console.error("Failed to load completion stats:", data.error);
      }
    } catch (error) {
      console.error("Error loading completion stats:", error);
    }
  };

  const loadSprintHistory = async () => {
    setLoadingSprintHistory(true);
    try {
      const res = await fetch('/api/manager/analytics/sprint-history?limit=20');
      const data = await res.json();
      if (data.success) {
        setSprintHistory(data.history || []);
      }
    } catch (error) {
      console.error('Error loading sprint history:', error);
    } finally {
      setLoadingSprintHistory(false);
    }
  };

  const loadHistoricalSprintData = async (sprintNumber: number) => {
    if (!email) return;
    
    setLoadingScorecard(true);
    try {
      // Fetch sprint rankings for the specific sprint
      const res = await fetch(`/api/manager/analytics/sprint-rankings?mode=sprint-${sprintNumber}`);
      const data = await res.json();
      
      if (data.success && data.rankings) {
        // Find the agent's data in the rankings - check competitive first (ranked agents)
        // then unqualified, then seniors
        let myData = data.rankings.competitive.find((agent: any) => agent.email === email);
        if (!myData) {
          myData = data.rankings.unqualified.find((agent: any) => agent.email === email);
        }
        if (!myData) {
          myData = data.rankings.seniors.find((agent: any) => agent.email === email);
        }
        
        if (myData) {
          // Find next rank agent (one rank above)
          const nextRankAgent = myData.rankByHybrid && myData.rankByHybrid > 1
            ? data.rankings.competitive.find((a: any) => a.rankByHybrid === myData.rankByHybrid - 1)
            : null;
          
          // Update scorecard data with historical sprint data
          setScorecardData((prev: any) => ({
            ...prev,
            sprint: {
              my: myData,
              teamAverages: data.teamAverages,
              totalCompetitors: data.rankings.competitive.length,
              nextRankAgent: nextRankAgent
            }
          }));
        } else {
          console.warn(`Agent ${email} not found in sprint ${sprintNumber} rankings`);
        }
      }
    } catch (error) {
      console.error('Error loading historical sprint data:', error);
    } finally {
      setLoadingScorecard(false);
    }
  };

  const loadScorecard = async (emailToUse?: string, skipCache: boolean = false) => {
    const currentEmail = emailToUse || email;
    if (!currentEmail) {
      console.log("⚠️ No email provided to loadScorecard");
      return;
    }

    console.log("📊 Loading scorecard for:", currentEmail, skipCache ? "(skipping cache)" : "");
    setLoadingScorecard(true);
    try {
      const cacheParam = skipCache ? "&skipCache=true" : "";
      // Add cache-busting timestamp when skipping cache, and use no-store to prevent browser caching
      const timestamp = skipCache ? `&_t=${Date.now()}` : "";
      const response = await fetch(`/api/agent/personal-scorecard?email=${encodeURIComponent(currentEmail)}${cacheParam}${timestamp}`, {
        cache: skipCache ? 'no-store' : 'default' // Prevent browser caching when refreshing after task completion
      });
      const data = await response.json();

      console.log("📊 Scorecard API response:", data);

      if (data.success) {
        console.log("✅ Scorecard loaded successfully:", data.agent?.name);
        setScorecardData(data);
        // Load sprint history when scorecard loads
        loadSprintHistory();
      } else {
        // If user is Holds-only agent, don't show error - just don't display scorecard
        if (data.isHoldsOnlyAgent) {
          console.log("ℹ️ Holds-only agent - Performance Scorecard not available");
          setScorecardData(null);
        } else {
          console.error('❌ Failed to load scorecard:', data.error);
        }
      }
    } catch (error) {
      console.error('❌ Error loading scorecard:', error);
    } finally {
      setLoadingScorecard(false);
    }
  };

  const loadStats = async (emailToUse?: string, dateToUse?: string) => {
    const currentEmail = emailToUse || email;
    const currentDate = dateToUse || selectedDate;
    if (!currentEmail) return;
    try {
      const res = await fetch(`/api/agent/stats?email=${encodeURIComponent(currentEmail)}&date=${encodeURIComponent(currentDate)}`);
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
    
    // Also load completion stats
    await loadCompletionStats(currentEmail, currentDate);
  };





  const saveEmail = () => {
    if (!email.trim() || !email.includes('@')) {
      alert('Please enter a valid email.');
      return;
    }
    localStorage.setItem('agentEmail', email);
    loadTasks();
    loadStats();
    startPolling();
  };

  const startTask = async (taskId: string) => {
    // Skip API call in test mode
    if (useTestData) {
      // Just update local state
      setStartedTasks(prev => new Set(prev).add(taskId));
      if (viewMode === 'kanban') {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          useTaskStore.getState().updateTask(taskId, {
            status: 'IN_PROGRESS',
            startTime: new Date().toISOString(),
          });
        }
      }
      return;
    }

    try {
      const res = await fetch(`/api/agent/tasks/${taskId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        // Add to local started tasks state for instant UI update
        setStartedTasks(prev => new Set(prev).add(taskId));
        // Update Zustand store if in Kanban view
        if (viewMode === 'kanban') {
          const task = tasks.find(t => t.id === taskId);
          if (task) {
            useTaskStore.getState().updateTask(taskId, {
              status: 'IN_PROGRESS',
              startTime: new Date().toISOString(),
            });
          }
        }
        // Update stats to reflect the change (but don't reload tasks to avoid page refresh)
        await loadStats();
        // Only merge tasks in background, don't reload (prevents page refresh)
        if (viewMode === 'kanban') {
          // Background merge will happen via polling
        } else {
          // For list view, still need to reload
          await loadTasks();
        }
      } else {
        // Log error for debugging
        const errorData = await res.json().catch(() => ({}));
        console.error("Start task failed:", res.status, errorData);
        alert(`Failed to start task: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error("Failed to start task:", error);
      alert("Network error - please check your connection");
    }
  };

  const completeTask = async (taskId: string, disposition: string, sfCaseNumberOrOrderAmount?: string, dispositionNote?: string) => {
    if (!disposition) {
      alert("Please select a disposition.");
      return;
    }
    try {
      const res = await fetch(`/api/agent/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email, 
          disposition, 
          sfCaseNumber: sfCaseNumberOrOrderAmount, 
          orderAmount: sfCaseNumberOrOrderAmount,
          dispositionNote: dispositionNote 
        }),
      });
      if (res.ok) {
        const responseData = await res.json().catch(() => ({}));
        const serverEndTime = responseData.task?.endTime || new Date().toISOString();
        
        // Remove from started tasks since it's completed
        setStartedTasks(prev => {
          const newSet = new Set(prev);
          newSet.delete(taskId);
          return newSet;
        });
        // Remove task from local state for instant UI update
        setTasks(prev => prev.filter(t => t.id !== taskId));
        // Update Zustand store if in Kanban view - use ref to get current viewMode
        const currentViewMode = viewModeRef.current;
        if (currentViewMode === 'kanban') {
          const store = useTaskStore.getState();
          const task = store.getTask(taskId);
          if (task) {
            store.updateTask(taskId, {
              status: 'COMPLETED',
              endTime: serverEndTime,
              disposition,
            });
            
            // Verify it's in the store
            const updatedTask = store.getTask(taskId);
            console.log('✅ Updated store with completed task:', {
              taskId,
              endTime: serverEndTime,
              status: updatedTask?.status,
              inStore: !!updatedTask
            });
          } else {
            console.warn('⚠️ Task not found in store when completing:', taskId);
          }
        }
        // Update stats AND scorecard to reflect the completion
        // Skip cache to get fresh data immediately after task completion
        await loadStats();
        await loadScorecard(undefined, true); // Skip cache to get fresh data
      }
    } catch (error) {
      console.error("Failed to complete task:", error);
    }
  };

  const requestAssistance = async (taskId: string, message: string) => {
    if (!message.trim()) {
      alert("Please enter an assistance note.");
      return;
    }

    // Skip API call in test mode
    if (useTestData) {
      // Just update local state
      setStartedTasks(prev => {
        const newSet = new Set(prev);
        newSet.delete(taskId);
        return newSet;
      });
      setTasks(prev => prev.map(t => 
        t.id === taskId 
          ? { ...t, status: "ASSISTANCE_REQUIRED", assistanceNotes: message, assistanceRequestedAt: new Date().toISOString() }
          : t
      ));
      if (viewMode === 'kanban') {
        const task = useTaskStore.getState().getTask(taskId);
        if (task) {
          useTaskStore.getState().updateTask(taskId, {
            status: 'ASSISTANCE_REQUIRED',
            assistanceNotes: message,
            assistanceRequestedAt: new Date().toISOString(),
          });
        }
      }
      return;
    }

    try {
      const res = await fetch(`/api/agent/tasks/${taskId}/assistance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, message }),
      });
      if (res.ok) {
        // Remove from started tasks since it's now in assistance state
        setStartedTasks(prev => {
          const newSet = new Set(prev);
          newSet.delete(taskId);
          return newSet;
        });
        // Update the task status locally for instant UI update
        setTasks(prev => prev.map(t => 
          t.id === taskId 
            ? { ...t, status: "ASSISTANCE_REQUIRED", assistanceNotes: message, assistanceRequestedAt: new Date().toISOString() }
            : t
        ));
        // Update Zustand store if in Kanban view
        if (viewMode === 'kanban') {
          const task = useTaskStore.getState().getTask(taskId);
          if (task) {
            useTaskStore.getState().updateTask(taskId, {
              status: 'ASSISTANCE_REQUIRED',
              assistanceNotes: message,
              assistanceRequestedAt: new Date().toISOString(),
            });
          }
        }
        // Update stats to reflect the assistance request
        await loadStats();
      }
    } catch (error) {
      console.error("Failed to request assistance:", error);
    }
  };

  // Helper functions moved to TaskCard component scope

  // Show loading while client is initializing
  if (!isClient) {
  return (
    <main className="mx-auto max-w-xl p-6 space-y-6 min-h-screen bg-gradient-to-br from-neutral-900 to-black dark:from-neutral-900 dark:to-black light:from-slate-50 light:to-slate-100">
        <H2>Loading...</H2>
      </main>
    );
  }

  // Check if user is coming from role switching (has agentEmail) or needs to login
  if (!localStorage.getItem('agentEmail')) {
    return (
      <main className="mx-auto max-w-xl p-6 space-y-6 min-h-screen bg-gradient-to-br from-neutral-900 to-black dark:from-neutral-900 dark:to-black light:from-slate-50 light:to-slate-100">
        <div className="flex justify-end mb-4">
          <ThemeToggle />
        </div>
        <H2>Agent Login</H2>
        <div className="space-y-4">
      <label className="block space-y-2">
            <div className="text-sm text-white/70 dark:text-white/70 light:text-gray-600">Your work email</div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md bg-white/10 dark:bg-white/10 light:bg-white text-white dark:text-white light:text-gray-800 placeholder-white/40 dark:placeholder-white/40 light:placeholder-gray-500 px-3 py-2 ring-1 ring-white/10 dark:ring-white/10 light:ring-gray-300 focus:outline-none"
          placeholder="agent@company.com"
        />
      </label>
          <PrimaryButton onClick={saveEmail} className="w-full">
            Start Working
          </PrimaryButton>
        </div>
      </main>
    );
  }

  return (
    <main className="w-full p-6 space-y-6 min-h-screen bg-gradient-to-br from-neutral-900 to-black dark:from-neutral-900 dark:to-black light:from-slate-50 light:to-slate-100">
      {/* Header with Stats */}
      <div className="space-y-4">
        {/* Company Logo Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/golden-companies-logo.jpeg" 
              alt="Golden Companies" 
              className="h-12 w-auto"
            />
            <div className="text-sm text-white/60 dark:text-white/60 light:text-gray-600">Agent Portal</div>
          </div>
          <ThemeToggle />
        </div>
        
        {/* Welcome Message and Controls */}
        <div className="flex items-center justify-between">
          <H2>{welcomeMessage || `👋 Welcome, ${getFirstName(email)}!`}</H2>
          <div className="flex items-center gap-4">
            <SmallButton onClick={() => { loadTasks(); loadStats(); }}>
              🔄 Refresh
            </SmallButton>
            <SmallButton onClick={() => { setSortOrder('asc'); loadTasks(undefined, 'asc'); stopPolling(); startPolling('asc'); }} className={sortOrder === 'asc' ? 'bg-white/10' : ''}>
              Oldest → Newest
            </SmallButton>
            <SmallButton onClick={() => { setSortOrder('desc'); loadTasks(undefined, 'desc'); stopPolling(); startPolling('desc'); }} className={sortOrder === 'desc' ? 'bg-white/10' : ''}>
              Newest → Oldest
            </SmallButton>
            
            {/* Switch to Manager Button (only if user has MANAGER_AGENT role) */}
            {currentUserRole === 'MANAGER_AGENT' && (
              <SmallButton 
                onClick={() => {
                  // Store current role and switch to manager
                  localStorage.setItem('currentRole', 'AGENT');
                  window.location.href = '/manager';
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Switch to Manager
              </SmallButton>
            )}
            
            <SmallButton 
              onClick={() => {
                localStorage.removeItem('agentEmail');
                localStorage.removeItem('currentRole');
                setEmail("");
                setTasks([]);
                setStats(null);
                stopPolling();
                // Redirect to login page
                window.location.href = '/login';
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Logout
            </SmallButton>
          </div>
        </div>
      </div>

      {/* Date Picker Section */}
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <label className="text-sm text-white/60 dark:text-white/60 light:text-gray-600">
            📅 View stats for:
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              loadStats(undefined, e.target.value);
            }}
            className="border-none rounded-lg px-3 py-2 bg-white/10 dark:bg-white/10 light:bg-gray-100 text-white dark:text-white light:text-gray-800 text-sm ring-1 ring-white/10 dark:ring-white/10 light:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <SmallButton 
            onClick={() => {
              const now = new Date();
              const year = now.getFullYear();
              const month = String(now.getMonth() + 1).padStart(2, '0');
              const day = String(now.getDate()).padStart(2, '0');
              const today = `${year}-${month}-${day}`;
              setSelectedDate(today);
              loadStats(undefined, today);
              // Also refresh completion stats to show today's performance
              loadCompletionStats(undefined, today);
            }}
          >
            Today
          </SmallButton>
        </div>
      </Card>

      {/* Stats Summary */}
      {stats && (
        <Card className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-400">{stats.assigned}</div>
              <div className="text-sm text-white/60">Tasks Assigned</div>
            </div>
            <div 
              className="cursor-pointer hover:bg-white/5 rounded-lg p-2 transition-colors"
              onClick={() => {
                setShowCompletedTasks(true);
                loadCompletedTasksToday();
              }}
            >
              <div className="text-2xl font-bold text-green-400">{stats.completed}</div>
              <div className="text-sm text-white/60">Tasks Completed</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-400">{stats.avgDuration}</div>
              <div className="text-sm text-white/60">Avg Duration (min)</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-400">{stats.assistanceSent}</div>
              <div className="text-sm text-white/60">Assistance Sent</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white/80">{stats.lastUpdate}</div>
              <div className="text-sm text-white/60">Last Update</div>
            </div>
          </div>
        </Card>
      )}

      {/* Completed Tasks Modal */}
      {showCompletedTasks && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <H2>✅ Completed Tasks Today</H2>
            <SmallButton onClick={() => setShowCompletedTasks(false)}>
              ✕ Close
            </SmallButton>
          </div>
          <div className="space-y-3">
            {completedTasksToday.length === 0 ? (
              <div className="text-center text-white/60 py-8">
                No completed tasks today yet. Keep going! 🚀
              </div>
            ) : (
              completedTasksToday.map((task) => (
                <div key={task.id} className="bg-white/5 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-white/90">{task.brand}</div>
                    <Badge tone="success">{task.disposition}</Badge>
                  </div>
                  <div className="text-sm text-white/70">{task.text}</div>
                  <div className="flex items-center justify-between text-xs text-white/50">
                    <span>Completed: {task.endTime ? new Date(task.endTime).toLocaleTimeString() : 'N/A'}</span>
                    <span>Duration: {task.durationSec ? Math.round(task.durationSec / 60) : 0} min</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {/* One-on-One Notes Section */}
      {showOneOnOneNotes && (
        <AgentOneOnOneNotes agentEmail={email} />
      )}

      {/* Task Picker */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <H2>Task Filter</H2>
          <div className="text-sm text-white/60">
            Total: {tasks.length} tasks
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedTaskType("ALL")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              selectedTaskType === "ALL"
                ? "bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/50"
                : "bg-white/5 text-white/70 hover:bg-white/10 ring-1 ring-white/10"
            }`}
          >
            📋 All ({tasks.length})
          </button>
          <button
            onClick={() => setSelectedTaskType("TEXT_CLUB")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              selectedTaskType === "TEXT_CLUB"
                ? "bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/50"
                : "bg-white/5 text-white/70 hover:bg-white/10 ring-1 ring-white/10"
            }`}
          >
            📱 Text Club ({taskCounts.TEXT_CLUB})
          </button>
          <button
            onClick={() => setSelectedTaskType("WOD_IVCS")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              selectedTaskType === "WOD_IVCS"
                ? "bg-red-500/20 text-red-300 ring-1 ring-red-400/50"
                : "bg-white/5 text-white/70 hover:bg-white/10 ring-1 ring-white/10"
            }`}
          >
            📦 WOD/IVCS ({taskCounts.WOD_IVCS})
          </button>
          <button
            onClick={() => setSelectedTaskType("EMAIL_REQUESTS")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              selectedTaskType === "EMAIL_REQUESTS"
                ? "bg-green-500/20 text-green-300 ring-1 ring-green-400/50"
                : "bg-white/5 text-white/70 hover:bg-white/10 ring-1 ring-white/10"
            }`}
          >
            📧 Email Requests ({taskCounts.EMAIL_REQUESTS})
          </button>
          <button
            onClick={() => setSelectedTaskType("YOTPO")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              selectedTaskType === "YOTPO"
                ? "bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-400/50"
                : "bg-white/5 text-white/70 hover:bg-white/10 ring-1 ring-white/10"
            }`}
          >
            ⭐ Yotpo ({taskCounts.YOTPO})
          </button>
          <button
            onClick={() => setSelectedTaskType("HOLDS")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              selectedTaskType === "HOLDS"
                ? "bg-orange-500/20 text-orange-300 ring-1 ring-orange-400/50"
                : "bg-white/5 text-white/70 hover:bg-white/10 ring-1 ring-white/10"
            }`}
          >
            🚧 Holds ({taskCounts.HOLDS})
          </button>
          <button
            onClick={() => setSelectedTaskType("STANDALONE_REFUNDS")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              selectedTaskType === "STANDALONE_REFUNDS"
                ? "bg-purple-500/20 text-purple-300 ring-1 ring-purple-400/50"
                : "bg-white/5 text-white/70 hover:bg-white/10 ring-1 ring-white/10"
            }`}
          >
            💰 Standalone Refunds ({taskCounts.STANDALONE_REFUNDS})
          </button>
        </div>
      </Card>

      {/* Completion Stats */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <H2>Your Performance</H2>
          <div className="text-sm text-white/60">
            {selectedDate === (() => {
              const now = new Date();
              const year = now.getFullYear();
              const month = String(now.getMonth() + 1).padStart(2, '0');
              const day = String(now.getDate()).padStart(2, '0');
              return `${year}-${month}-${day}`;
            })() ? 'Today' : selectedDate}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <div className="text-2xl mb-1">📱</div>
            <div className="text-sm text-white/60">Text Club</div>
            <div className="text-lg font-semibold text-blue-300">{completionStats.today.TEXT_CLUB}</div>
            <div className="text-xs text-white/50">Today</div>
            <div className="text-sm text-white/40 mt-1">Lifetime: {completionStats.total.TEXT_CLUB}</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <div className="text-2xl mb-1">📦</div>
            <div className="text-sm text-white/60">WOD/IVCS</div>
            <div className="text-lg font-semibold text-red-300">{completionStats.today.WOD_IVCS}</div>
            <div className="text-xs text-white/50">Today</div>
            <div className="text-sm text-white/40 mt-1">Lifetime: {completionStats.total.WOD_IVCS}</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <div className="text-2xl mb-1">📧</div>
            <div className="text-sm text-white/60">Email Requests</div>
            <div className="text-lg font-semibold text-green-300">{completionStats.today.EMAIL_REQUESTS}</div>
            <div className="text-xs text-white/50">Today</div>
            <div className="text-sm text-white/40 mt-1">Lifetime: {completionStats.total.EMAIL_REQUESTS}</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <div className="text-2xl mb-1">⭐</div>
            <div className="text-sm text-white/60">Yotpo</div>
            <div className="text-lg font-semibold text-yellow-300">{completionStats.today.YOTPO}</div>
            <div className="text-xs text-white/50">Today</div>
            <div className="text-sm text-white/40 mt-1">Lifetime: {completionStats.total.YOTPO}</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <div className="text-2xl mb-1">🚧</div>
            <div className="text-sm text-white/60">Holds</div>
            <div className="text-lg font-semibold text-orange-300">{completionStats.today.HOLDS}</div>
            <div className="text-xs text-white/50">Today</div>
            <div className="text-sm text-white/40 mt-1">Lifetime: {completionStats.total.HOLDS}</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <div className="text-2xl mb-1">💰</div>
            <div className="text-sm text-white/60">Standalone Refunds</div>
            <div className="text-lg font-semibold text-purple-300">{completionStats.today.STANDALONE_REFUNDS}</div>
            <div className="text-xs text-white/50">Today</div>
            <div className="text-sm text-white/40 mt-1">Lifetime: {completionStats.total.STANDALONE_REFUNDS}</div>
          </div>
        </div>
      </Card>

      {/* Personal Scorecard */}
      {scorecardData && scorecardData.agent && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <H2>📊 Your Performance Scorecard</H2>
            <div className="flex items-center gap-2">
              <SmallButton 
                onClick={() => setShowOneOnOneNotes(!showOneOnOneNotes)}
                className="bg-purple-500/20 hover:bg-purple-500/30 ring-purple-500/40"
              >
                💬 1:1 Notes
              </SmallButton>
              <SmallButton 
                onClick={() => setShowGuideModal(true)}
                className="bg-blue-500/20 hover:bg-blue-500/30 ring-blue-500/40"
              >
                📚 How Rankings Work
              </SmallButton>
              <SmallButton onClick={() => setShowScorecard(!showScorecard)}>
                {showScorecard ? '▲ Hide Details' : '▼ Show Full Details'}
              </SmallButton>
            </div>
          </div>

          {/* ALWAYS SHOW: Quick Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Today's Performance (REDESIGNED - Much Clearer!) */}
            {scorecardData.today && (
              <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-lg p-4 border border-blue-500/30">
                <div className="text-sm font-semibold text-white mb-3">📊 Today's Performance</div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white/5 rounded-lg p-3 text-center">
                    <div className="text-xs text-white/60 mb-1">Tasks Completed</div>
                    <div className="text-3xl font-bold text-blue-400">
                      {scorecardData.today.my?.totalCompleted || 0}
                    </div>
                    {/* REMOVED: Confusing daily comparison - will add 7-day trend instead */}
                  </div>
                  <div className="bg-white/5 rounded-lg p-3 text-center">
                    <div className="text-xs text-white/60 mb-1">Points Earned</div>
                    <div className="text-3xl font-bold text-yellow-400">
                      {scorecardData.today.my?.weightedPoints?.toFixed(1) || '0.0'}
                    </div>
                    {/* REMOVED: Confusing daily comparison - will add 7-day trend instead */}
                  </div>
                  <div className="bg-white/5 rounded-lg p-3 text-center">
                    <div className="text-xs text-white/60 mb-1">Avg Handle Time</div>
                    <div className="text-3xl font-bold text-green-400">
                      {Math.floor((scorecardData.today.my?.avgHandleTimeSec || 0) / 60)}m
                    </div>
                    {/* REMOVED: Confusing daily comparison - will add 7-day trend instead */}
                  </div>
                </div>
                {/* 7-Day Rolling Average Trend */}
                {scorecardData.weeklyTrend && scorecardData.weeklyTrend.thisWeek.daysWorked > 0 && (
                  <div className="mt-4 bg-gradient-to-r from-green-500/10 to-blue-500/10 border border-green-500/30 rounded-lg p-4">
                    <div className="text-sm font-semibold text-white mb-3">📊 7-Day Performance Trend</div>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      {/* Tasks/Day Trend */}
                      <div className="text-center">
                        <div className="text-white/60 mb-1">Tasks/Day</div>
                        <div className="text-lg font-bold text-blue-400">
                          {scorecardData.weeklyTrend.thisWeek.tasksPerDay.toFixed(1)}
                        </div>
                        {scorecardData.weeklyTrend.lastWeek.daysWorked > 0 && (
                          <div className="mt-1">
                            {scorecardData.weeklyTrend.changes.tasksPercent > 0 ? (
                              <div className="text-green-400 font-semibold">
                                ↑ +{scorecardData.weeklyTrend.changes.tasksPercent}%
                              </div>
                            ) : scorecardData.weeklyTrend.changes.tasksPercent < 0 ? (
                              <div className="text-orange-400 font-semibold">
                                ↓ {scorecardData.weeklyTrend.changes.tasksPercent}%
                              </div>
                            ) : (
                              <div className="text-white/50">→ Same</div>
                            )}
                            <div className="text-[10px] text-white/40">vs last week</div>
                          </div>
                        )}
                      </div>
                      
                      {/* Points/Day Trend */}
                      <div className="text-center">
                        <div className="text-white/60 mb-1">Points/Day</div>
                        <div className="text-lg font-bold text-yellow-400">
                          {scorecardData.weeklyTrend.thisWeek.ptsPerDay.toFixed(1)}
                        </div>
                        {scorecardData.weeklyTrend.lastWeek.daysWorked > 0 && (
                          <div className="mt-1">
                            {scorecardData.weeklyTrend.changes.ptsPercent > 0 ? (
                              <div className="text-green-400 font-semibold">
                                ↑ +{scorecardData.weeklyTrend.changes.ptsPercent}%
                              </div>
                            ) : scorecardData.weeklyTrend.changes.ptsPercent < 0 ? (
                              <div className="text-orange-400 font-semibold">
                                ↓ {scorecardData.weeklyTrend.changes.ptsPercent}%
                              </div>
                            ) : (
                              <div className="text-white/50">→ Same</div>
                            )}
                            <div className="text-[10px] text-white/40">vs last week</div>
                          </div>
                        )}
                      </div>
                      
                      {/* Speed Trend */}
                      <div className="text-center">
                        <div className="text-white/60 mb-1">Avg Speed</div>
                        <div className="text-lg font-bold text-green-400">
                          {Math.floor(scorecardData.weeklyTrend.thisWeek.avgHandleTimeSec / 60)}m
                        </div>
                        {scorecardData.weeklyTrend.lastWeek.daysWorked > 0 && scorecardData.weeklyTrend.lastWeek.avgHandleTimeSec > 0 && (
                          <div className="mt-1">
                            {scorecardData.weeklyTrend.changes.speedPercent < 0 ? (
                              <div className="text-green-400 font-semibold">
                                ↓ {Math.abs(scorecardData.weeklyTrend.changes.speedPercent)}% faster
                              </div>
                            ) : scorecardData.weeklyTrend.changes.speedPercent > 0 ? (
                              <div className="text-orange-400 font-semibold">
                                ↑ +{scorecardData.weeklyTrend.changes.speedPercent}% slower
                              </div>
                            ) : (
                              <div className="text-white/50">→ Same</div>
                            )}
                            <div className="text-[10px] text-white/40">vs last week</div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Summary Message */}
                    {scorecardData.weeklyTrend.lastWeek.daysWorked > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        {scorecardData.weeklyTrend.changes.tasksPercent > 0 && scorecardData.weeklyTrend.changes.ptsPercent > 0 ? (
                          <div className="text-xs text-green-400 text-center font-semibold">
                            🎉 Great progress! You're improving across all metrics!
                          </div>
                        ) : scorecardData.weeklyTrend.changes.tasksPercent > 0 || scorecardData.weeklyTrend.changes.ptsPercent > 0 ? (
                          <div className="text-xs text-blue-400 text-center font-semibold">
                            👍 Solid improvement! Keep it up!
                          </div>
                        ) : (
                          <div className="text-xs text-white/60 text-center">
                            💪 Stay consistent to see improvement trends
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                
                <div className="text-[10px] text-white/40 text-center mt-3">
                  💡 7-day averages help you track sustained improvement
                </div>
                
                {/* Hourly Productivity Graph */}
                {scorecardData.today.my?.hourlyBreakdown && Object.keys(scorecardData.today.my.hourlyBreakdown).length > 0 && (
                  <div className="mt-4 bg-white/5 rounded-lg p-4 border border-white/10">
                    <div className="text-xs font-semibold text-white mb-3">📈 Your Hourly Productivity Today (PST):</div>
                    <div className="flex items-end gap-1 h-32">
                      {Array.from({ length: 24 }, (_, hour) => {
                        const data = scorecardData.today.my.hourlyBreakdown[hour];
                        const count = data?.count || 0;
                        const maxCount = Math.max(...Object.values(scorecardData.today.my.hourlyBreakdown).map((d: any) => d.count), 1);
                        const heightPercent = count > 0 ? (count / maxCount) * 100 : 0;
                        
                        return (
                          <div key={hour} className="flex-1 flex flex-col items-center group relative cursor-pointer">
                            <div 
                              className={`w-full rounded-t transition-all ${
                                count > 0 
                                  ? 'bg-gradient-to-t from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 dark:from-blue-500 dark:to-blue-400 dark:hover:from-blue-400 dark:hover:to-blue-300' 
                                  : 'bg-white/5 dark:bg-white/5'
                              }`}
                              style={{ height: `${heightPercent}%`, minHeight: count > 0 ? '12px' : '2px' }}
                            >
                              {count > 0 && (
                                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-950 dark:bg-gray-950 border-2 border-white/40 rounded-lg px-4 py-3 text-xs opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 shadow-2xl backdrop-blur-sm">
                                  <div className="font-extrabold text-lg text-white drop-shadow-lg">{hour % 12 || 12}{hour >= 12 ? 'PM' : 'AM'}</div>
                                  <div className="text-base text-white mt-1 font-bold drop-shadow-md">{count} tasks • {data.points?.toFixed(1) || 0} pts</div>
                                </div>
                              )}
                            </div>
                            {hour % 3 === 0 && (
                              <div className="text-[8px] text-white/40 mt-1">{hour % 12 || 12}{hour >= 12 ? 'p' : 'a'}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-[10px] text-white/50 mt-2 text-center">
                      💡 Hover over bars to see counts & points • Shows when you're most productive
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Current Rankings OR Unranked Status */}
            {!scorecardData.agent.isSenior && (
              <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-lg p-4">
                {(scorecardData.sprint?.my?.qualified || scorecardData.lifetime?.my?.qualified) ? (
                  // QUALIFIED - Show Rankings
                  <>
                    <div className="text-sm font-semibold text-purple-300 mb-2">🏆 Your Rankings</div>
                    <div className="space-y-2">
                      {scorecardData.sprint?.my?.qualified && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-white/60">Current Sprint:</span>
                          <span className="text-lg font-bold text-white">#{scorecardData.sprint.my.rankByPtsPerDay}</span>
                        </div>
                      )}
                  {scorecardData.lifetime?.my?.qualified && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/60">Lifetime Points:</span>
                      <span className="text-lg font-bold text-yellow-300">#{scorecardData.lifetime.my.rankByPtsPerDay}</span>
                    </div>
                  )}
                      {scorecardData.sprint?.my?.tier && (
                        <div className="mt-2 pt-2 border-t border-white/10">
                          <Badge tone={
                            scorecardData.sprint.my.tier === 'Elite' ? 'success' :
                            scorecardData.sprint.my.tier === 'High Performer' ? 'default' :
                            scorecardData.sprint.my.tier === 'Solid Contributor' ? 'muted' :
                            scorecardData.sprint.my.tier === 'Developing' ? 'warning' :
                            'danger'
                          }>
                            {scorecardData.sprint.my.tier}
                          </Badge>
                          <div className="text-xs text-white/50 mt-1">Top {100 - scorecardData.sprint.my.percentile}%</div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  // NOT QUALIFIED - Show Unranked Status
                  <>
                    <div className="text-sm font-semibold text-yellow-300 mb-2">📊 Not Yet Ranked</div>
                    <div className="space-y-3">
                      {/* Lifetime Ranking Requirements */}
                      {scorecardData.lifetime?.my && (
                        <div className="bg-white/5 rounded p-3">
                          <div className="text-xs text-white/70 mb-2">Lifetime Rankings:</div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-white/10 rounded-full h-2">
                              <div 
                                className="bg-yellow-500 rounded-full h-2 transition-all"
                                style={{ width: `${Math.min(100, (scorecardData.lifetime.my.totalCompleted / 20) * 100)}%` }}
                              ></div>
                            </div>
                            <div className="text-xs text-white/70 whitespace-nowrap">
                              {scorecardData.lifetime.my.totalCompleted}/20
                            </div>
                          </div>
                          <div className="text-xs text-white/50 mt-1">
                            {scorecardData.lifetime.my.totalCompleted >= 20 
                              ? '✓ Qualified!' 
                              : `Need ${20 - scorecardData.lifetime.my.totalCompleted} more tasks to qualify`}
                          </div>
                        </div>
                      )}
                      
                      {/* Sprint Ranking Requirements */}
                      {scorecardData.sprint?.my && (
                        <div className="bg-white/5 rounded p-3">
                          <div className="text-xs text-white/70 mb-2">Current Sprint:</div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-white/10 rounded-full h-2">
                              <div 
                                className="bg-purple-500 rounded-full h-2 transition-all"
                                style={{ width: `${Math.min(100, (scorecardData.sprint.my.daysWorked / 3) * 100)}%` }}
                              ></div>
                            </div>
                            <div className="text-xs text-white/70 whitespace-nowrap">
                              {scorecardData.sprint.my.daysWorked}/3
                            </div>
                          </div>
                          <div className="text-xs text-white/50 mt-1">
                            {scorecardData.sprint.my.daysWorked >= 3 
                              ? '✓ Qualified!' 
                              : `Work ${3 - scorecardData.sprint.my.daysWorked} more days to qualify`}
                          </div>
                        </div>
                      )}
                      
                      <div className="text-xs text-white/40 text-center pt-2 border-t border-white/10">
                        💡 Keep working! Rankings unlock as you complete more tasks.
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Senior Agent Badge */}
            {scorecardData.agent.isSenior && (
              <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-lg p-4 flex items-center gap-3">
                <div className="text-3xl">👑</div>
                <div>
                  <div className="text-sm font-semibold text-blue-300">Senior Agent</div>
                  <div className="text-xs text-white/60 mt-1">
                    Exempt from rankings
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* EXPANDABLE: Full Details */}
          {showScorecard && (
            <div className="space-y-4 pt-4 border-t border-white/10">
              {/* Current Sprint Info */}
              {scorecardData.currentSprint && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-blue-300">Current Sprint #{scorecardData.currentSprint.number}</div>
                      <div className="text-xs text-white/60">{scorecardData.currentSprint.period}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-white/60">Days Remaining</div>
                      <div className="text-2xl font-bold text-blue-400">{scorecardData.currentSprint.daysRemaining}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Sprint Selector */}
              {scorecardData.currentSprint && sprintHistory.length > 0 && (
                <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                  <label className="block text-xs text-white/70 mb-2">View Sprint:</label>
                  <select
                    value={selectedSprint}
                    onChange={async (e) => {
                      const value = e.target.value;
                      const newSprint = value === 'current' ? 'current' : parseInt(value);
                      setSelectedSprint(newSprint);
                      
                      // If selecting a historical sprint, load its data
                      if (newSprint !== 'current' && typeof newSprint === 'number') {
                        await loadHistoricalSprintData(newSprint);
                      } else if (newSprint === 'current') {
                        // Reload current sprint data - skip cache to get fresh data
                        await loadScorecard(undefined, true);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-md text-sm font-medium bg-gray-800/50 text-white border border-white/20 hover:bg-gray-700/50 transition-colors"
                  >
                    <option value="current">Current Sprint #{scorecardData.currentSprint.number}</option>
                    {sprintHistory
                      .filter(s => !s.isCurrent)
                      .map((sprint) => (
                        <option key={sprint.sprintNumber} value={sprint.sprintNumber}>
                          Sprint #{sprint.sprintNumber} - {sprint.period}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Detailed Rankings */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Current Sprint Rankings - ALWAYS SHOW (even if unranked) */}
                {scorecardData.sprint && scorecardData.sprint.my && !scorecardData.agent.isSenior && (
                  <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-lg p-4">
                    <div className="text-sm font-semibold text-purple-300 mb-2">
                      {selectedSprint === 'current' ? '🔥 Current Sprint' : `📜 Sprint #${selectedSprint}`}
                    </div>
                    
                    {scorecardData.sprint.my.qualified ? (
                      // QUALIFIED - Show Rankings
                      <>
                        <div className="flex items-end gap-2">
                          <div className="text-3xl font-bold text-white">#{scorecardData.sprint.my.rankByPtsPerDay}</div>
                          <div className="text-sm text-white/60 mb-1">of {scorecardData.sprint.totalCompetitors}</div>
                        </div>
                        <div className="mt-2">
                          <Badge tone={
                            scorecardData.sprint.my.tier === 'Elite' ? 'success' :
                            scorecardData.sprint.my.tier === 'High Performer' ? 'default' :
                            scorecardData.sprint.my.tier === 'Solid Contributor' ? 'muted' :
                            scorecardData.sprint.my.tier === 'Developing' ? 'warning' :
                            'danger'
                          }>
                            {scorecardData.sprint.my.tier}
                          </Badge>
                          <div className="text-xs text-white/50 mt-1">Top {100 - scorecardData.sprint.my.percentile}%</div>
                        </div>
                        {scorecardData.sprint.nextRankAgent && (
                          <div className="mt-3 pt-3 border-t border-white/10">
                            <div className="text-xs text-white/60">Gap to #{scorecardData.sprint.my.rankByPtsPerDay - 1}:</div>
                            <div className="text-sm font-semibold text-orange-300">
                              +{(scorecardData.sprint.nextRankAgent.weightedDailyAvg - scorecardData.sprint.my.weightedDailyAvg).toFixed(1)} pts/day needed
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      // UNRANKED - Show Progress (only for current sprint)
                      <>
                        <div className="text-lg font-bold text-yellow-300 mb-2">Not Yet Ranked</div>
                        <div className="space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-white/70">Days Worked:</span>
                            <span className="text-white font-semibold">{scorecardData.sprint.my.daysWorked}/3</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-white/70">Total Points:</span>
                            <span className="text-yellow-300 font-semibold">{scorecardData.sprint.my.weightedPoints?.toFixed(1) || '0.0'} pts</span>
                          </div>
                          {/* Only show "Points Today" for current sprint */}
                          {selectedSprint === 'current' && (
                            <div className="flex items-center justify-between">
                              <span className="text-white/70">Points Today:</span>
                              <span className="text-blue-300 font-semibold">{scorecardData.today?.my?.weightedPoints?.toFixed(1) || '0.0'} pts</span>
                            </div>
                          )}
                          <div className="mt-3 pt-2 border-t border-white/10">
                            <div className="text-yellow-300 font-semibold">
                              Need {Math.max(0, 3 - scorecardData.sprint.my.daysWorked)} more day{Math.max(0, 3 - scorecardData.sprint.my.daysWorked) !== 1 ? 's' : ''} to qualify
                            </div>
                            <div className="text-white/50 mt-1">
                              Keep working! Your progress is being tracked.
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                    
                    {/* Always show sprint stats */}
                    <div className="mt-3 pt-3 border-t border-white/10 space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">Total Completed:</span>
                        <span className="text-white">{scorecardData.sprint.my.totalCompleted || 0} tasks</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">Points/Day:</span>
                        <span className="text-yellow-300">{scorecardData.sprint.my.weightedDailyAvg?.toFixed(1) || '0.0'} pts/day</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Lifetime Rankings */}
                {scorecardData.lifetime && scorecardData.lifetime.my && scorecardData.lifetime.my.qualified && !scorecardData.agent.isSenior && (
                  <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-lg p-4">
                    <div className="text-sm font-semibold text-yellow-300 mb-2">⭐ Lifetime Points</div>
                    <div className="flex items-end gap-2">
                      <div className="text-3xl font-bold text-white">#{scorecardData.lifetime.my.rankByPtsPerDay}</div>
                      <div className="text-sm text-white/60 mb-1">of {scorecardData.lifetime.totalCompetitors}</div>
                    </div>
                    <div className="mt-2">
                      <div className="text-xs text-white/60">Weighted Points</div>
                      <div className="text-lg font-semibold text-white">{scorecardData.lifetime.my.weightedPoints.toFixed(1)} pts</div>
                      <div className="text-xs text-white/50">{scorecardData.lifetime.my.weightedDailyAvg.toFixed(1)} pts/day</div>
                    </div>
                    {scorecardData.lifetime.nextRankAgent && (() => {
                      const dailyGap = scorecardData.lifetime.nextRankAgent.weightedDailyAvg - scorecardData.lifetime.my.weightedDailyAvg;
                      const totalGap = dailyGap * scorecardData.lifetime.my.daysWorked;
                      const daysNeeded = scorecardData.lifetime.my.weightedDailyAvg > 0 
                        ? Math.ceil(Math.abs(totalGap) / scorecardData.lifetime.my.weightedDailyAvg)
                        : 0;
                      
                      return (
                        <div className="mt-3 pt-3 border-t border-white/10">
                          <div className="text-xs text-white/60">Gap to #{scorecardData.lifetime.my.rankByPtsPerDay - 1}:</div>
                          <div className="text-sm font-semibold text-orange-300">
                            +{dailyGap.toFixed(1)} pts/day
                          </div>
                          <div className="text-[10px] text-white/50 mt-1">
                            (~{daysNeeded} days at your current pace)
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

              </div>

              {/* Senior Agent Message */}
              {scorecardData.agent.isSenior && (
                <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-lg p-4 text-center">
                  <div className="text-2xl mb-2">👑</div>
                  <div className="text-sm font-semibold text-blue-300">Senior Agent</div>
                  <div className="text-xs text-white/60 mt-1">
                    Your contributions are tracked for reference, but you're exempt from competitive rankings.
                  </div>
                </div>
              )}

              {/* Improvement Suggestions */}
              {scorecardData.lifetime && scorecardData.lifetime.my && scorecardData.lifetime.my.qualified && !scorecardData.agent.isSenior && (() => {
                const my = scorecardData.lifetime.my;
                const teamAvg = scorecardData.lifetime.teamAverages;
                
                const complexityGap = my.weightedDailyAvg - teamAvg.ptsPerDay;
                const volumeGap = my.tasksPerDay - teamAvg.tasksPerDay;
                
                const isTopPerformer = my.rankByHybrid <= 3;
                const needsImprovement = my.rankByHybrid > (scorecardData.lifetime.totalCompetitors * 0.75);

                return (
                  <div className={`rounded-lg p-4 border ${
                    isTopPerformer ? 'bg-green-500/10 border-green-500/30' :
                    needsImprovement ? 'bg-orange-500/10 border-orange-500/30' :
                    'bg-blue-500/10 border-blue-500/30'
                  }`}>
                    <div className="text-sm font-semibold text-white mb-2">
                      {isTopPerformer ? '✅ Keep It Up!' :
                       needsImprovement ? '⚠️ Focus Areas' :
                       '🎯 Improvement Path'}
                    </div>
                    
                    {isTopPerformer ? (
                      <div className="text-xs text-green-400">
                        Excellent performance! You're in the top 3. Keep up the great work! 🌟
                      </div>
                    ) : (
                      <div className="space-y-2 text-xs">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="text-white/60">Complexity vs Team:</span>
                              <div className="relative group">
                                <span className="text-blue-400 cursor-help text-[10px]">ℹ️</span>
                                <div className="absolute left-0 top-4 w-56 bg-gray-900 border border-blue-500/50 rounded p-2 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 text-[10px]">
                                  <div className="text-white/80">
                                    <strong className="text-blue-300">Task Difficulty:</strong> Points earned per day based on task types (Email, Yotpo, WOD = high pts, Spam = low pts)
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className={`font-semibold ${complexityGap >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {complexityGap >= 0 ? '+' : ''}{complexityGap.toFixed(1)} pts/day
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="text-white/60">Volume vs Team:</span>
                              <div className="relative group">
                                <span className="text-blue-400 cursor-help text-[10px]">ℹ️</span>
                                <div className="absolute left-0 top-4 w-56 bg-gray-900 border border-blue-500/50 rounded p-2 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 text-[10px]">
                                  <div className="text-white/80">
                                    <strong className="text-blue-300">Tasks Completed:</strong> How many tasks you finish per day compared to team average
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className={`font-semibold ${volumeGap >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {volumeGap >= 0 ? '+' : ''}{volumeGap.toFixed(1)} tasks/day
                            </div>
                          </div>
                        </div>
                        
                        <div className="bg-white/5 rounded p-2 text-white/70">
                          <strong className="text-white">💡 Tips:</strong>
                          {complexityGap < 0 && Math.abs(complexityGap) > Math.abs(volumeGap) && (
                            <div className="mt-1">
                              🎯 <strong>Priority:</strong> Request more task assignments
                              <br/>
                              High-volume workers get better task variety (Email, Yotpo, WOD mix)
                            </div>
                          )}
                          {volumeGap < 0 && Math.abs(volumeGap) > Math.abs(complexityGap) && (
                            <div className="mt-1">
                              📈 <strong>Priority:</strong> Increase daily task completion
                              <br/>
                              Reduce handle time & minimize gaps between tasks
                            </div>
                          )}
                          {complexityGap < 0 && volumeGap < 0 && (
                            <div className="mt-1">
                              ⚡ <strong>Focus:</strong> Both speed AND volume
                              <br/>
                              1. Work faster through your queue
                              <br/>
                              2. Request more assignments when done
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Productivity Insights (NEW!) */}
              {scorecardData.today && scorecardData.today.my && scorecardData.today.my.totalCompleted > 0 && (
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-sm font-semibold text-white mb-3">📊 Today's Productivity Insights</div>
                  
                  {/* Idle Time Analysis */}
                  {scorecardData.today.my.estimatedIdleHours > 0 && (
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded p-3 mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-white/70">⏱️ Time Analysis:</span>
                        <span className="text-xs text-orange-300 font-semibold">
                          {scorecardData.today.my.estimatedIdleHours.toFixed(1)} hrs idle time detected
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div>
                          <span className="text-white/50">Active on tasks:</span>
                          <span className="text-white ml-1">{scorecardData.today.my.activeHours.toFixed(1)} hrs</span>
                        </div>
                        <div>
                          <span className="text-white/50">Waiting/Between tasks:</span>
                          <span className="text-orange-300 ml-1">{scorecardData.today.my.estimatedIdleHours.toFixed(1)} hrs</span>
                        </div>
                      </div>
                      <div className="text-[10px] text-white/60 mt-2">
                        💡 <strong>Tip:</strong> Request more assignments when your queue is empty to reduce idle time!
                      </div>
                    </div>
                  )}

                  {/* Hourly Productivity Graph */}
                  {scorecardData.today.my.hourlyBreakdown && Object.keys(scorecardData.today.my.hourlyBreakdown).length > 0 && (
                    <div className="bg-white/5 rounded p-3">
                      <div className="text-xs text-white/70 mb-3">📈 Tasks Completed Per Hour (PST):</div>
                      <div className="flex items-end gap-1 h-32">
                        {Array.from({ length: 24 }, (_, hour) => {
                          const data = scorecardData.today.my.hourlyBreakdown[hour];
                          const count = data?.count || 0;
                          const maxCount = Math.max(...Object.values(scorecardData.today.my.hourlyBreakdown).map((d: any) => d.count), 1);
                          const heightPercent = count > 0 ? (count / maxCount) * 100 : 0;
                          
                          return (
                            <div key={hour} className="flex-1 flex flex-col items-center group relative cursor-pointer">
                              <div 
                                className={`w-full rounded-t transition-all ${
                                  count > 0 
                                    ? 'bg-gradient-to-t from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 dark:from-blue-500 dark:to-blue-400 dark:hover:from-blue-400 dark:hover:to-blue-300' 
                                    : 'bg-white/5 dark:bg-white/5'
                                }`}
                                style={{ height: `${heightPercent}%`, minHeight: count > 0 ? '12px' : '2px' }}
                              >
                                {count > 0 && (
                                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-950 dark:bg-gray-950 border-2 border-white/40 rounded-lg px-4 py-3 text-xs opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 shadow-2xl backdrop-blur-sm">
                                    <div className="font-extrabold text-lg text-white drop-shadow-lg">{hour % 12 || 12}{hour >= 12 ? 'PM' : 'AM'}</div>
                                    <div className="text-base text-white mt-1 font-bold drop-shadow-md">{count} tasks • {data.points?.toFixed(1) || 0} pts</div>
                                  </div>
                                )}
                              </div>
                              {hour % 3 === 0 && (
                                <div className="text-[8px] text-white/40 mt-1">{hour % 12 || 12}{hour >= 12 ? 'p' : 'a'}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="text-[10px] text-white/50 mt-2 text-center">
                        💡 Hover over bars to see exact counts • Peak hours highlighted in blue
                      </div>
                    </div>
                  )}

                  {/* Clear Improvement Goals */}
                  {scorecardData.lifetime && scorecardData.lifetime.nextRankAgent && (() => {
                    const my = scorecardData.lifetime.my;
                    const next = scorecardData.lifetime.nextRankAgent;
                    const dailyGap = next.weightedDailyAvg - my.weightedDailyAvg;
                    const taskGap = next.tasksPerDay - my.tasksPerDay;
                    
                    // Calculate how many more tasks needed based on current avg task value
                    const myAvgPtsPerTask = my.totalCompleted > 0 ? my.weightedPoints / my.totalCompleted : 0;
                    const tasksNeeded = myAvgPtsPerTask > 0 ? Math.ceil(dailyGap / myAvgPtsPerTask) : 0;
                    
                    return (
                      <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3 mt-3">
                        <div className="text-xs font-semibold text-blue-300 mb-2">🎯 Clear Goal to Reach #{my.rankByHybrid - 1}:</div>
                        <div className="space-y-2 text-[10px] text-white/80">
                          <div className="flex items-center justify-between">
                            <span>Daily Gap:</span>
                            <span className="font-semibold text-orange-300">+{dailyGap.toFixed(1)} pts/day</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Tasks Needed (at your current mix):</span>
                            <span className="font-semibold text-green-300">~{tasksNeeded} more tasks/day</span>
                          </div>
                          <div className="bg-white/5 rounded p-2 mt-2">
                            <strong className="text-white">💡 Faster Path:</strong>
                            <br/>
                            Get {Math.ceil(tasksNeeded / 2)} Email Requests instead of spam
                            <br/>
                            <span className="text-green-400">(Email worth 6pts vs spam 0.8pts - 4X faster!)</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Tasks List */}
      <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
          <H2>Your Tasks</H2>
          <div className="flex items-center gap-4">
            <div className="text-sm text-white/60">
              Last update: {lastUpdate.toLocaleTimeString()}
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${pollingInterval ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} title={pollingInterval ? 'Polling Active' : 'Polling Stopped'}></div>
              <SmallButton 
                onClick={() => { 
                  console.log("🔄 Force Update clicked");
                  const currentEmail = localStorage.getItem('agentEmail');
                  console.log("🔄 Force Update email:", currentEmail);
                  loadTasks(currentEmail || undefined); 
                  loadStats(currentEmail || undefined); 
                }} 
                className="bg-green-600 hover:bg-green-700 text-xs"
              >
                🔄 Force Update
              </SmallButton>
            <SmallButton onClick={() => { setSortOrder('asc'); setStoreSortOrder('asc'); loadTasks(undefined, 'asc'); stopPolling(); startPolling('asc'); }} className={sortOrder === 'asc' ? 'bg-white/10' : ''}>
              Oldest → Newest
            </SmallButton>
            <SmallButton onClick={() => { setSortOrder('desc'); setStoreSortOrder('desc'); loadTasks(undefined, 'desc'); stopPolling(); startPolling('desc'); }} className={sortOrder === 'desc' ? 'bg-white/10' : ''}>
              Newest → Oldest
            </SmallButton>
            
            {/* View Toggle */}
            <div className="flex items-center gap-2 border-l border-white/20 pl-4">
              <SmallButton
                onClick={() => setViewMode('list')}
                className={viewMode === 'list' ? 'bg-white/10' : ''}
              >
                📋 List
              </SmallButton>
              <SmallButton
                onClick={() => setViewMode('kanban')}
                className={viewMode === 'kanban' ? 'bg-white/10' : ''}
              >
                📊 Kanban
              </SmallButton>
            </div>
            
            {/* Test Data Toggle (for local testing) */}
            <SmallButton
              onClick={() => {
                setUseTestData(!useTestData);
                if (!useTestData) {
                  loadTasks(undefined, undefined, true);
                }
              }}
              className={useTestData ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-600 hover:bg-gray-700'}
              title="Toggle test data mode (for local testing without database)"
            >
              {useTestData ? '🧪 Test Mode ON' : '🧪 Test Mode'}
            </SmallButton>

            </div>
          </div>
        </div>
        {loading ? (
          <div className="text-center py-8 text-white/60">Loading tasks...</div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-8 text-white/60">No tasks assigned yet.</div>
        ) : viewMode === 'kanban' ? (
          // Kanban View - Full Width
          <KanbanBoard
              selectedTaskType={selectedTaskType}
              selectedDate={selectedDate}
              agentEmail={email}
              onStartTask={startTask}
              onCompleteTask={completeTask}
              onRequestAssistance={requestAssistance}
              isTestMode={useTestData}
              onStatsUpdate={async () => {
                await loadStats();
                await loadScorecard(undefined, true);
              }}
            />
        ) : (
          // List View (existing)
          <div>
            {/* Manager Response Notification - Simple count only (details shown in each task card) */}
            {(() => {
              const hasResponses = tasks.some(t => t.managerResponse);
              const responseCount = tasks.filter(t => t.managerResponse).length;
              
              if (hasResponses) {
                return (
                  <div className="mb-4 p-3 bg-green-900/20 border border-green-500/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-green-400 text-lg">💬</span>
                      <span className="text-green-300 font-medium">
                        {responseCount} Manager Response{responseCount !== 1 ? 's' : ''} Available
                      </span>
                      <span className="text-green-200 text-xs bg-green-600/30 px-2 py-1 rounded-full">
                        Check tasks below
                      </span>
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {/* Task Cards */}
            <div className="space-y-4">
              {filteredTasks.map((task, index) => {
                // Check if this is an escalated call task
                const isEscalatedCall = task.taskType === "HOLDS" && task.holdsStatus === "Escalated Call 4+ Day";
                
                return (
                  <div 
                    id={`task-${task.id}`} 
                    key={task.id}
                    className={isEscalatedCall ? "border-2 border-red-500/50 rounded-lg bg-red-900/10" : ""}
                  >
                    {/* Queue Status Badge for Holds tasks (visible before starting) */}
                    {task.taskType === "HOLDS" && !startedTasks.has(task.id) && task.holdsStatus && (
                      <div className={`mb-2 px-3 py-1.5 rounded-lg text-sm font-medium ${
                        isEscalatedCall 
                          ? "bg-red-500/20 text-red-300 border border-red-500/50" 
                          : "bg-orange-500/20 text-orange-300 border border-orange-500/30"
                      }`}>
                        <span className="mr-2">🏷️</span>
                        <span>Queue: {task.holdsStatus}</span>
                      </div>
                    )}
                    <TaskCard
                      task={task}
                      startedTasks={startedTasks}
                      onStart={() => startTask(task.id)}
                      onComplete={completeTask}
                      onAssistance={requestAssistance}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Password Change Modal */}
      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        onSuccess={() => {
          setShowPasswordModal(false);
          // Refresh the page to update the JWT token
          window.location.reload();
        }}
      />

      {/* Scorecard Guide Modal */}
      {showGuideModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowGuideModal(false)}>
          <div 
            className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden ring-1 ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-b border-white/10 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-1">📊 Performance Scorecard Guide</h2>
                  <p className="text-sm text-white/60">Everything you need to know about rankings</p>
                </div>
                <button
                  onClick={() => setShowGuideModal(false)}
                  className="text-white/60 hover:text-white text-2xl leading-none"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="space-y-6">
                {/* Section 1: Quick Overview */}
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-blue-300 mb-3">🎯 How to Rank #1</h3>
                  <div className="space-y-2 text-sm text-white/80">
                    <div className="flex items-start gap-2">
                      <span className="text-green-400">✅</span>
                      <div>
                        <strong className="text-white">Work FAST:</strong> Reduce your avg handle time (6min → 4min per task)
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-green-400">✅</span>
                      <div>
                        <strong className="text-white">Request MORE:</strong> Ask for more assignments when your queue is done
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-green-400">✅</span>
                      <div>
                        <strong className="text-white">Natural Variety:</strong> High-volume workers get better task mix (Email, Yotpo, WOD)
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-blue-500/20 text-xs text-blue-200">
                    💡 <strong>Formula:</strong> 30% Task Volume + 70% Task Complexity
                  </div>
                </div>

                {/* Section 2: Task Point Values */}
                <div className="bg-white/5 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-white mb-3">⭐ Task Point Values</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/70">⭐ Yotpo</span>
                      <span className="font-bold text-yellow-300">7.0 pts</span>
                      <span className="text-xs text-green-400">Highest!</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/70">📧 Email Requests</span>
                      <span className="font-bold text-green-300">6.0 pts</span>
                      <span className="text-xs text-green-400">High value</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/70">🚧 Holds</span>
                      <span className="font-bold text-orange-300">5.0 pts</span>
                      <span className="text-xs text-blue-400">Good</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/70">📊 Trello</span>
                      <span className="font-bold text-purple-300">5.0 pts</span>
                      <span className="text-xs text-blue-400">Good</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/70">📦 WOD/IVCS</span>
                      <span className="font-bold text-blue-300">2-4 pts</span>
                      <span className="text-xs text-blue-400">Medium</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/70">📱 Text Club (Answered)</span>
                      <span className="font-bold text-white/70">2-3 pts</span>
                      <span className="text-xs text-white/50">OK</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/70">📱 Text Club (Spam)</span>
                      <span className="font-bold text-red-300">0.8 pts</span>
                      <span className="text-xs text-red-400">Low value</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/10 text-xs text-white/60">
                    💡 Email Requests worth <strong className="text-green-400">7.5X more</strong> than spam!
                  </div>
                </div>

                {/* Section 3: Understanding Your Stats */}
                <div className="bg-white/5 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-white mb-3">📊 Reading Your Stats</h3>
                  
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-semibold text-green-300 mb-1">📦 Tasks</div>
                      <div className="text-xs text-white/70 ml-4">
                        <div><strong className="text-white">+15 ✓</strong> = 15 MORE tasks than yesterday (🟢 green = good!)</div>
                        <div className="mt-1"><strong className="text-white">52 today</strong> = Total completed today</div>
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-sm font-semibold text-yellow-300 mb-1">⭐ Points</div>
                      <div className="text-xs text-white/70 ml-4">
                        <div><strong className="text-white">+67.5 ✓</strong> = 67.5 MORE points than yesterday</div>
                        <div className="mt-1">Based on task difficulty (harder tasks = more points!)</div>
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-sm font-semibold text-blue-300 mb-1">⏱️ Speed</div>
                      <div className="text-xs text-white/70 ml-4">
                        <div><strong className="text-white">↓2m ✓</strong> = 2 minutes FASTER than yesterday (🟢 good!)</div>
                        <div className="mt-1"><strong className="text-white">4m today</strong> = Avg time per task today</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/10 text-xs text-white/60">
                    🎯 <strong>Goal:</strong> See green numbers every day = you're improving!
                  </div>
                </div>

                {/* Section 4: Performance Tiers */}
                <div className="bg-white/5 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-white mb-3">🏅 Performance Tiers</h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Badge tone="success">Elite</Badge>
                      <span className="text-xs text-white/70">Top 10% - Best of the best!</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone="default">High Performer</Badge>
                      <span className="text-xs text-white/70">Top 25% - Excellent work!</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone="muted">Solid Contributor</Badge>
                      <span className="text-xs text-white/70">Top 50% - Doing well!</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone="warning">Developing</Badge>
                      <span className="text-xs text-white/70">Top 75% - Room to grow</span>
                    </div>
                  </div>
                </div>

                {/* Section 5: Requirements */}
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-purple-300 mb-3">📋 Requirements to See Your Rank</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white/5 rounded p-3">
                      <div className="text-sm font-semibold text-yellow-300 mb-1">⭐ Lifetime Rankings</div>
                      <div className="text-xs text-white/70">
                        <div>• Complete <strong className="text-white">20 tasks</strong> total</div>
                        <div className="mt-1">• Never resets (all-time record)</div>
                      </div>
                    </div>
                    <div className="bg-white/5 rounded p-3">
                      <div className="text-sm font-semibold text-purple-300 mb-1">🏆 Current Sprint</div>
                      <div className="text-xs text-white/70">
                        <div>• Work <strong className="text-white">3 days</strong> in sprint</div>
                        <div className="mt-1">• Resets every 2 weeks</div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-white/50 text-center">
                    You'll see progress bars showing exactly where you are!
                  </div>
                </div>

                {/* Section 6: Sprint System */}
                <div className="bg-white/5 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-white mb-3">🏆 Sprint System</h3>
                  <div className="space-y-2 text-sm text-white/80">
                    <div className="flex items-start gap-2">
                      <span>🔄</span>
                      <div><strong className="text-white">Resets every 2 weeks</strong> - Everyone starts equal!</div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span>🏆</span>
                      <div><strong className="text-white">Sprint Champion:</strong> #1 agent gets team-wide recognition</div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span>📅</span>
                      <div><strong className="text-white">Current Sprint:</strong> Nov 1-14 (Sprint #1)</div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span>🎯</span>
                      <div><strong className="text-white">Fresh Opportunity:</strong> New agents can compete with veterans!</div>
                    </div>
                  </div>
                </div>

                {/* Section 7: Pro Tips */}
                <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-green-300 mb-3">💡 Pro Tips to Rank Higher</h3>
                  <div className="space-y-3 text-sm text-white/80">
                    <div className="bg-white/5 rounded p-3">
                      <div className="font-semibold text-white mb-2">Strategy 1: Increase Volume (Most Important! 70% of score)</div>
                      <div className="text-xs space-y-1">
                        <div>• Work faster (6min → 4min per task)</div>
                        <div>• Request more assignments when queue is done</div>
                        <div>• High volume = better task variety automatically</div>
                        <div className="text-green-400 mt-2">✨ Result: Better tasks = more points!</div>
                      </div>
                    </div>
                    
                    <div className="bg-white/5 rounded p-3">
                      <div className="font-semibold text-white mb-2">Strategy 2: Maintain Consistency</div>
                      <div className="text-xs space-y-1">
                        <div>• Work 5 days/week minimum</div>
                        <div>• Focus during peak productivity hours</div>
                        <div>• Beat yesterday's performance daily</div>
                      </div>
                    </div>

                    <div className="bg-white/5 rounded p-3">
                      <div className="font-semibold text-white mb-2">Real Example</div>
                      <div className="text-xs space-y-1">
                        <div className="text-red-300">❌ 50 spam tasks = 40 points</div>
                        <div className="text-green-300">✅ 30 tasks (mixed variety) = 120 points</div>
                        <div className="text-yellow-300 mt-2">💡 Same time, 3X more points!</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 8: FAQ */}
                <div className="bg-white/5 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-white mb-3">❓ Common Questions</h3>
                  <div className="space-y-3 text-sm">
                    <div>
                      <div className="font-semibold text-white">Q: Why am I not ranked yet?</div>
                      <div className="text-xs text-white/70 ml-4 mt-1">
                        A: You need 20 tasks OR 3 days worked. Check your progress bars!
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold text-white">Q: How do I move up faster?</div>
                      <div className="text-xs text-white/70 ml-4 mt-1">
                        A: Work faster and request MORE assignments! High-volume workers naturally get better task variety.
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold text-white">Q: Does the scorecard auto-update?</div>
                      <div className="text-xs text-white/70 ml-4 mt-1">
                        A: Yes! Updates after each task completion and every 30 seconds.
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold text-white">Q: What if I'm #1?</div>
                      <div className="text-xs text-white/70 ml-4 mt-1">
                        A: Keep it up! You're the standard. The scorecard shows you how to maintain your lead.
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold text-white">Q: Can I see other agents' names?</div>
                      <div className="text-xs text-white/70 ml-4 mt-1">
                        A: No. You only see your rank (e.g., "#5 of 11"). Keeps it competitive but respectful.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 9: Daily Checklist */}
                <div className="bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/30 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-orange-300 mb-3">⚡ Daily Checklist</h3>
                  <div className="space-y-2 text-sm text-white/80">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" className="w-4 h-4" disabled />
                      <span>Check "Today vs Yesterday" - am I improving?</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" className="w-4 h-4" disabled />
                      <span>Check my rank - did I move up or down?</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" className="w-4 h-4" disabled />
                      <span>Read improvement tips - what should I focus on?</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" className="w-4 h-4" disabled />
                      <span>Work faster and request more assignments</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" className="w-4 h-4" disabled />
                      <span>Beat yesterday's task count!</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Message */}
                <div className="text-center pt-4">
                  <div className="text-sm text-white/60 mb-3">
                    Questions? Ask your manager for coaching and support!
                  </div>
                  <button
                    onClick={() => setShowGuideModal(false)}
                    className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg font-semibold hover:from-blue-600 hover:to-purple-600 transition-all"
                  >
                    Got It! Let's Go! 🚀
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Knowledge Section - Floating Button */}
      <KnowledgeSection />

      {/* Toast Notification for Manager Responses */}
      {toastMessage && (
        <Toast
          message={toastMessage}
          type={toastType}
          duration={6000}
          onClose={() => setToastMessage(null)}
        />
      )}
    </main>
  );
}

// Task Card Component
function TaskCard({ 
  task, 
  startedTasks, 
  onStart, 
  onComplete, 
  onAssistance 
}: {
  task: Task;
  startedTasks: Set<string>;
  onStart: () => void;
  onComplete: (taskId: string, disposition: string, sfCaseNumber?: string, dispositionNote?: string) => void;
  onAssistance: (taskId: string, message: string) => void;
}) {
  const [disposition, setDisposition] = useState("");
  const [subDisposition, setSubDisposition] = useState("");
  const [assistanceMsg, setAssistanceMsg] = useState("");
  const [sfCaseNumber, setSfCaseNumber] = useState("");
  const [orderAmount, setOrderAmount] = useState("");
  const [dispositionNote, setDispositionNote] = useState("");

  // Clear form fields after successful actions
  const handleComplete = () => {
    if (!disposition) return;
    
    // For WOD/IVCS tasks, require sub-disposition for both main dispositions
    if (task.taskType === "WOD_IVCS" && (disposition === "Completed" || disposition === "Unable to Complete")) {
      if (!subDisposition) {
        alert("Please select a sub-disposition.");
        return;
      }
      // Combine main disposition with sub-disposition
      onComplete(task.id, `${disposition} - ${subDisposition}`);
    }
    // For Email Requests "Unable to Complete", require sub-disposition
    else if (task.taskType === "EMAIL_REQUESTS" && disposition === "Unable to Complete") {
      if (!subDisposition) {
        alert("Please select a sub-disposition for Unable to Complete.");
        return;
      }
      // Combine main disposition with sub-disposition
      onComplete(task.id, `${disposition} - ${subDisposition}`);
    }
    // For Email Requests "Completed", require SF Case #
    else if (task.taskType === "EMAIL_REQUESTS" && disposition === "Completed") {
      if (!sfCaseNumber.trim()) {
        alert("Please enter the SF Case # for Completed disposition.");
        return;
      }
      
      // Send both disposition and SF Case # separately
      onComplete(task.id, disposition, sfCaseNumber.trim());
    }
    // For "Answered in SF", require SF Case #
    else if (disposition === "Answered in SF") {
      if (!sfCaseNumber.trim()) {
        alert("Please enter the SF Case # for Answered in SF disposition.");
        return;
      }
      
      // Send both disposition and SF Case # separately
      onComplete(task.id, disposition, sfCaseNumber.trim());
    }
    // For Yotpo, require SF Case # for all dispositions EXCEPT 4 exemptions
    else if (task.taskType === "YOTPO") {
      const noSfRequired = [
        "Information – Unfeasible request or information not available",
        "Duplicate Request – No new action required",
        "Previously Assisted – Issue already resolved or refund previously issued",
        "No Match – No valid account or order located"
      ];
      
      // If disposition requires SF # but none provided
      if (!noSfRequired.includes(disposition) && !sfCaseNumber.trim()) {
        alert("Please enter the SF Case # for this Yotpo disposition.");
        return;
      }
      
      // Send disposition and SF Case # (if provided)
      if (sfCaseNumber.trim()) {
        onComplete(task.id, disposition, sfCaseNumber.trim());
      } else {
        onComplete(task.id, disposition);
      }
    }
    // For Holds, handle queue movements and completion
    else if (task.taskType === "HOLDS") {
      // MANDATORY: Order Amount required for all Holds completions
      if (!orderAmount || parseFloat(orderAmount) <= 0) {
        alert("Please enter the Order Amount before completing this Holds task.");
        return;
      }
      
      // MANDATORY: Note required for specific dispositions
      const noteRequiredDispositions = ["Unable to Resolve", "Resolved - other", "Resolved - Other"];
      if (noteRequiredDispositions.includes(disposition) && !dispositionNote.trim()) {
        alert("Please enter a note/reason for this disposition.");
        return;
      }
      
      // Determine if this completes the task or moves to another queue
      const completionDispositions = [
        "Refunded & Closed",
        "Refunded & Closed - Customer Requested Cancelation",
        "Refunded & Closed - No Contact",
        "Refunded & Closed - Comma Issue",
        "Resolved - fixed format / fixed address",
        "Resolved - Customer Clarified",
        "Resolved - FRT Released",
        "Resolved - other",
        "Resolved - Other"
      ];
      
      const movesToDuplicates = disposition === "Duplicate";
      const movesToCustomerContact = disposition === "Unable to Resolve" || disposition === "International Order - Unable to Call/ Sent Email";
      
      if (movesToDuplicates || movesToCustomerContact) {
        // Queue movement only - task stays PENDING
        // The API will handle queue movement
        onComplete(task.id, disposition, orderAmount, dispositionNote.trim() || undefined);
      } else if (completionDispositions.includes(disposition)) {
        // Task completion - status becomes COMPLETED
        onComplete(task.id, disposition, orderAmount, dispositionNote.trim() || undefined);
      } else {
        onComplete(task.id, disposition, orderAmount, dispositionNote.trim() || undefined);
      }
    } else {
      onComplete(task.id, disposition);
    }
    
    // Clear form fields
    setDisposition("");
    setSubDisposition("");
    setSfCaseNumber("");
    setOrderAmount("");
    setDispositionNote("");
  };

  const handleAssistance = () => {
    if (assistanceMsg.trim()) {
      onAssistance(task.id, assistanceMsg);
      setAssistanceMsg(""); // Clear assistance message
    }
  };

  // A task is considered "started" only if the agent has explicitly clicked Start
  // This ensures agents must click Start even if tasks were auto-assigned as IN_PROGRESS
  const isTaskStarted = startedTasks.has(task.id);
  // Task is locked when in assistance and waiting for manager response
  const isTaskLocked = task.status === "ASSISTANCE_REQUIRED" && !task.managerResponse;
  // Show disposition controls only if task is started and not locked
  const showDispo = isTaskStarted && !isTaskLocked;
  // Manager response exists (status may be IN_PROGRESS after manager responds)
  const hasManagerResponse = !!task.managerResponse;

  // Helper functions
  const getBrandEmoji = (brand: string) => {
    const map: Record<string, string> = { 
      "ActivatedYou": "🧘‍♀️💊", 
      "UPN": "🚀🧬" 
    };
    return map[brand] || "📧";
  };

  const getStatusEmoji = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'pending') return '📥';
    if (s === 'in_progress') return '🚀';
    if (s === 'completed') return '✅';
    if (s === 'assistance_required') return '🆘';
    return '❓';
  };

  // Get task type display info
  const getTaskTypeInfo = (taskType: string) => {
    switch (taskType) {
      case "WOD_IVCS":
        return { label: "WOD/IVCS", emoji: "📦", color: "text-red-400" };
      case "EMAIL_REQUESTS":
        return { label: "Email Requests", emoji: "📧", color: "text-green-400" };
      case "STANDALONE_REFUNDS":
        return { label: "Standalone Refunds", emoji: "💰", color: "text-purple-400" };
      case "HOLDS":
        return { label: "Holds", emoji: "📄", color: "text-yellow-300" };
      case "TEXT_CLUB":
      default:
        return { label: "Text Club", emoji: "📱", color: "text-blue-400" };
    }
  };

  const taskTypeInfo = getTaskTypeInfo(task.taskType || "TEXT_CLUB");

  // Check if this is an escalated call task for highlighting
  const isEscalatedCall = task.taskType === "HOLDS" && task.holdsStatus === "Escalated Call 4+ Day";

  return (
    <div className={`bg-white/5 rounded-lg p-4 space-y-3 border ${
      task.managerResponse 
        ? "border-green-500/50 bg-green-900/10" 
        : isEscalatedCall
        ? "border-red-500/50 bg-red-900/10"
        : "border-white/10"
    }`}>
      {/* Task Type & Brand */}
      <div className="flex items-center gap-2 text-lg font-semibold">
        <span className={taskTypeInfo.color}>{taskTypeInfo.emoji}</span>
        <span className="text-white/70 text-sm font-normal">{taskTypeInfo.label}</span>
        <span className="text-white/40">•</span>
        <span>{getBrandEmoji(task.brand)}</span>
        {task.taskType === "WOD_IVCS" && !isTaskStarted ? (
          <span className="text-white/40 italic">[hidden until Start]</span>
        ) : (
          <span>{task.brand}</span>
        )}
        {task.managerResponse && (
          <span className="text-green-400 text-sm font-normal">✨ Ready to Resume</span>
        )}
      </div>

      {/* Task-specific content based on type */}
      {task.taskType === "WOD_IVCS" ? (
        <>
          {/* WOD/IVCS specific data - Blurred until started */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-red-400">📋</span>
              <span className="text-white/60">Source:</span>
              {isTaskStarted ? (
                <span className="font-mono">{task.wodIvcsSource || "N/A"}</span>
              ) : (
                <span className="text-white/40 italic">[hidden until Start]</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-400">🔢</span>
              <span className="text-white/60">Primary ID:</span>
              {isTaskStarted ? (
                <span className="font-mono">{task.documentNumber || "N/A"}</span>
              ) : (
                <span className="text-white/40 italic">[hidden until Start]</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-400">👤</span>
              <span className="text-white/60">Customer:</span>
              {isTaskStarted ? (
                <span className="font-mono">{task.customerName || "N/A"}</span>
              ) : (
                <span className="text-white/40 italic">[hidden until Start]</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-400">💵</span>
              <span className="text-white/60">Amount:</span>
              {isTaskStarted ? (
                <span className="font-mono">{task.amount ? `$${task.amount}` : "N/A"}</span>
              ) : (
                <span className="text-white/40 italic">[hidden until Start]</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-400">📊</span>
              <span className="text-white/60">Difference:</span>
              {isTaskStarted ? (
                <span className="font-mono">{task.webOrderDifference ? `$${task.webOrderDifference}` : "N/A"}</span>
              ) : (
                <span className="text-white/40 italic">[hidden until Start]</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-400">📅</span>
              <span className="text-white/60">Origin Date:</span>
              {isTaskStarted ? (
                <span className="font-mono">{task.purchaseDate ? new Date(task.purchaseDate).toLocaleDateString() : "N/A"}</span>
              ) : (
                <span className="text-white/40 italic">[hidden until Start]</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-400">⏰</span>
              <span className="text-white/60">Order Age:</span>
              {isTaskStarted ? (
                <span className="font-mono">{task.orderAge || "N/A"}</span>
              ) : (
                <span className="text-white/40 italic">[hidden until Start]</span>
              )}
            </div>
          </div>
        </>
      ) : task.taskType === "EMAIL_REQUESTS" ? (
        <>
          {/* Email Request specific data - Blurred until started */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-green-400">⏰</span>
              <span className="text-white/60">Completion Time:</span>
              {isTaskStarted ? (
                <span className="font-mono">{task.completionTime ? new Date(task.completionTime).toLocaleString() : "N/A"}</span>
              ) : (
                <span className="text-white/40 italic">[hidden until Start]</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-400">🔢</span>
              <span className="text-white/60">SF Case #:</span>
              {isTaskStarted ? (
                <span className="font-mono">{task.salesforceCaseNumber || "N/A"}</span>
              ) : (
                <span className="text-white/40 italic">[hidden until Start]</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-400">📧</span>
              <span className="text-white/60">Request For:</span>
              {isTaskStarted ? (
                <span className="font-mono">{task.emailRequestFor || "N/A"}</span>
              ) : (
                <span className="text-white/40 italic">[hidden until Start]</span>
              )}
            </div>
            <div className="flex items-start gap-2 col-span-2">
              <span className="text-green-400 mt-1">📝</span>
              <span className="text-white/60">Details:</span>
              {isTaskStarted ? (
                <span className="text-sm leading-relaxed">{task.details || "N/A"}</span>
              ) : (
                <span className="text-white/40 italic">[hidden until Start]</span>
              )}
            </div>
          </div>
        </>
      ) : task.taskType === "YOTPO" ? (
        <>
          {/* Yotpo specific data - Columns C-J */}
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <span className="text-yellow-400">👤</span>
                <span className="text-white/60">Customer:</span>
                {isTaskStarted ? (
                  <span className="font-mono">{task.yotpoCustomerName || "N/A"}</span>
                ) : (
                  <span className="text-white/40 italic">[hidden]</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-yellow-400">📧</span>
                <span className="text-white/60">Email:</span>
                {isTaskStarted ? (
                  <span className="font-mono text-xs">{task.yotpoEmail || "N/A"}</span>
                ) : (
                  <span className="text-white/40 italic">[hidden]</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-yellow-400">📅</span>
                <span className="text-white/60">Order Date:</span>
                {isTaskStarted ? (
                  <span className="font-mono">{task.yotpoOrderDate ? new Date(task.yotpoOrderDate).toLocaleDateString() : "N/A"}</span>
                ) : (
                  <span className="text-white/40 italic">[hidden]</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-yellow-400">📦</span>
                <span className="text-white/60">Product:</span>
                {isTaskStarted ? (
                  <span className="font-mono">{task.yotpoProduct || "N/A"}</span>
                ) : (
                  <span className="text-white/40 italic">[hidden]</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-yellow-400">🏷️</span>
                <span className="text-white/60">Issue Topic:</span>
                {isTaskStarted ? (
                  <span className="font-mono">{task.yotpoIssueTopic || "N/A"}</span>
                ) : (
                  <span className="text-white/40 italic">[hidden]</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-yellow-400">📅</span>
                <span className="text-white/60">Review Date:</span>
                {isTaskStarted ? (
                  <span className="font-mono">{task.yotpoReviewDate ? new Date(task.yotpoReviewDate).toLocaleDateString() : "N/A"}</span>
                ) : (
                  <span className="text-white/40 italic">[hidden]</span>
                )}
              </div>
            </div>
            
            {/* Review Text - Full scrollable view (no height limit to show complete reviews) */}
            <div className="flex items-start gap-2">
              <span className="text-yellow-400 mt-1">⭐</span>
              <span className="text-white/60 min-w-fit">Review:</span>
              {isTaskStarted ? (
                <div className="flex-1 text-sm leading-relaxed bg-white/5 rounded p-3 border border-white/10 whitespace-pre-wrap">
                  {task.yotpoReview || "No review text provided"}
                </div>
              ) : (
                <span className="text-white/40 italic">[hidden until Start]</span>
              )}
            </div>
            
            {/* SF Order Link - Clickable */}
            <div className="flex items-center gap-2">
              <span className="text-yellow-400">🔗</span>
              <span className="text-white/60">SF Order:</span>
              {isTaskStarted ? (
                task.yotpoSfOrderLink ? (
                  <a 
                    href={task.yotpoSfOrderLink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline text-xs break-all"
                  >
                    Open in Salesforce →
                  </a>
                ) : (
                  <span className="font-mono text-white/40">Not provided</span>
                )
              ) : (
                <span className="text-white/40 italic">[hidden]</span>
              )}
            </div>
          </div>
        </>
      ) : task.taskType === "STANDALONE_REFUNDS" ? (
        <>
          {/* Standalone Refund specific data - Blurred until started */}
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-purple-400">💰</span>
              <span className="text-white/60">Refund Amount:</span>
              {isTaskStarted ? (
                <span className="font-mono">{task.refundAmount ? `$${task.refundAmount}` : "N/A"}</span>
              ) : (
                <span className="text-white/40 italic">[hidden until Start]</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-purple-400">💳</span>
              <span className="text-white/60">Payment Method:</span>
              {isTaskStarted ? (
                <span className="font-mono">{task.paymentMethod || "N/A"}</span>
              ) : (
                <span className="text-white/40 italic">[hidden until Start]</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-purple-400">📝</span>
              <span className="text-white/60">Reason:</span>
              {isTaskStarted ? (
                <span className="font-mono">{task.refundReason || "N/A"}</span>
              ) : (
                <span className="text-white/40 italic">[hidden until Start]</span>
              )}
            </div>
          </div>
        </>
      ) : task.taskType === "HOLDS" ? (
        <>
          {/* Holds specific data - Queue status visible, other info hidden until started */}
          <div className="space-y-2 text-sm">
            {/* Queue Status - ALWAYS VISIBLE (even before starting) */}
            <div className="flex items-center gap-2">
              <span className="text-yellow-300">🏷️</span>
              <span className="text-white/60">Queue:</span>
              <span className={`font-mono font-semibold ${
                task.holdsStatus === "Escalated Call 4+ Day" 
                  ? "text-red-400" 
                  : "text-orange-300"
              }`}>
                {task.holdsStatus || "N/A"}
              </span>
              {task.holdsStatus === "Escalated Call 4+ Day" && (
                <span className="px-2 py-0.5 bg-red-500/20 text-red-300 rounded text-xs font-medium border border-red-500/50">
                  ⚠️ Escalated
                </span>
              )}
            </div>
            
            {/* Queue History Timeline - ALWAYS VISIBLE (even before starting) */}
            {task.holdsQueueHistory && Array.isArray(task.holdsQueueHistory) && task.holdsQueueHistory.length > 0 && (
              <div className="mt-2 pt-2 border-t border-white/10">
                <div className="text-xs text-white/60 mb-1">Queue Journey:</div>
                <div className="space-y-1">
                  {task.holdsQueueHistory.slice(0, 3).map((entry: any, idx: number) => (
                    <div key={idx} className="text-xs text-white/70 flex items-center gap-2">
                      <span className="text-white/40">•</span>
                      <span>{entry.queue || 'Unknown'}</span>
                      {entry.enteredAt && (
                        <span className="text-white/40">
                          ({new Date(entry.enteredAt).toLocaleDateString()})
                        </span>
                      )}
                    </div>
                  ))}
                  {task.holdsQueueHistory.length > 3 && (
                    <div className="text-xs text-white/40 italic">
                      +{task.holdsQueueHistory.length - 3} more queue movements
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Other Holds fields - Hidden until started */}
            <div className="flex items-center gap-2">
              <span className="text-yellow-300">📅</span>
              <span className="text-white/60">Order Date:</span>
              {isTaskStarted ? (
                <span className="font-mono">{task.holdsOrderDate ? new Date(task.holdsOrderDate as any).toLocaleDateString() : "N/A"}</span>
              ) : (
                <span className="text-white/40 italic">[hidden until Start]</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-300">#</span>
              <span className="text-white/60">Order Number:</span>
              {isTaskStarted ? (
                <span className="font-mono">{task.holdsOrderNumber || "N/A"}</span>
              ) : (
                <span className="text-white/40 italic">[hidden until Start]</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-300">✉️</span>
              <span className="text-white/60">Customer Email:</span>
              {isTaskStarted ? (
                <span className="font-mono">{task.holdsCustomerEmail || "N/A"}</span>
              ) : (
                <span className="text-white/40 italic">[hidden until Start]</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-300">⭐</span>
              <span className="text-white/60">Priority:</span>
              {isTaskStarted ? (
                <span className={`font-medium ${
                  task.holdsPriority && task.holdsPriority <= 2 
                    ? 'text-yellow-300' 
                    : 'text-white/80'
                }`}>
                  {task.holdsPriority && task.holdsPriority <= 2 
                    ? '👑 White Glove Customer' 
                    : task.holdsPriority && task.holdsPriority >= 4 
                    ? '📦 Normal Customer'
                    : task.holdsPriority || "N/A"}
                </span>
              ) : (
                <span className="text-white/40 italic">[hidden until Start]</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-300">📆</span>
              <span className="text-white/60">Days in System:</span>
              {isTaskStarted ? (
                <span className="font-mono">{task.holdsDaysInSystem ?? "N/A"}</span>
              ) : (
                <span className="text-white/40 italic">[hidden until Start]</span>
              )}
            </div>
            
            {/* Previous Agent Notes - Show if exists */}
            {isTaskStarted && task.holdsNotes && (
              <div className="col-span-2 mt-2 pt-2 border-t border-white/10">
                <div className="flex items-start gap-2">
                  <span className="text-yellow-300 mt-1">📝</span>
                  <div className="flex-1">
                    <span className="text-white/60 text-sm font-medium block mb-1">Previous Agent Notes:</span>
                    <div className="text-sm leading-relaxed bg-blue-900/20 rounded p-3 border border-blue-500/30 text-white/90">
                      {task.holdsNotes}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Text Club specific data */}
          {/* Phone - Blurred until started */}
          <div className="flex items-center gap-2">
            <span className="text-blue-400">📞</span>
            {isTaskStarted ? (
              <span className="font-mono">{task.phone}</span>
            ) : (
              <span className="text-white/40 italic">[hidden until Start]</span>
            )}
          </div>

          {/* Text - Blurred until started */}
          <div className="flex items-start gap-2">
            <span className="text-green-400 mt-1">💬</span>
            {isTaskStarted ? (
              <span className="text-sm leading-relaxed">{task.text}</span>
            ) : (
              <span className="text-white/40 italic">[hidden until Start]</span>
            )}
          </div>
        </>
      )}

      {/* Status */}
      <div className="flex items-center gap-2">
        <span>{getStatusEmoji(task.status)}</span>
        <Badge tone={task.status === "COMPLETED" ? "success" : "warning"}>
          {task.status.replace("_", " ").toUpperCase()}
        </Badge>
        <span className="text-xs text-white/50">• Created: {new Date(task.createdAt).toLocaleString()}</span>
      </div>

      {/* Task Locked Message - Show when waiting for manager response */}
      {isTaskLocked && (
        <div className="bg-amber-900/30 border-2 border-amber-500/70 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-amber-300 text-lg">🆘</span>
            <div className="text-amber-300 font-semibold text-base">Waiting for Manager Response</div>
          </div>
          <div className="text-white/80 text-sm mb-2 p-2 bg-amber-800/20 rounded border border-amber-600/30">
            <strong>Your request:</strong> {task.assistanceNotes}
          </div>
          <div className="text-xs text-amber-200/80">
            ⏸️ Task is locked. You cannot complete or change disposition until the manager responds.
          </div>
        </div>
      )}

      {/* Manager Response - Show when available */}
      {hasManagerResponse && (
        <div 
          key={`manager-response-${task.id}-${task.managerResponse}`}
          className="bg-green-900/30 border-2 border-green-500/70 rounded-lg p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="text-green-300 font-semibold text-lg">💬 Manager Response</div>
            <span className="text-green-200 text-sm bg-green-600/30 px-2 py-1 rounded-full">✨ Ready to Resume</span>
          </div>
          <div className="text-white mb-3 p-3 bg-green-800/20 rounded border border-green-600/50">
            {task.managerResponse}
          </div>
          <div className="text-sm text-green-200 bg-green-800/20 p-2 rounded border border-green-600/30">
            💡 You can now continue working on this task. Timer was paused during assistance.
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="space-y-3">
        {!isTaskStarted && (
          <PrimaryButton onClick={onStart} className="w-full">
            Start Task
          </PrimaryButton>
        )}

        {showDispo && (
          <div className="space-y-4">
            {/* Order Amount field for Holds tasks - MANDATORY */}
            {task.taskType === "HOLDS" && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white">
                  Order Amount: <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={orderAmount}
                    onChange={(e) => {
                      // Allow decimal input and preserve trailing zeros during typing
                      setOrderAmount(e.target.value);
                    }}
                    onBlur={(e) => {
                      // Format to 2 decimal places when field loses focus
                      if (e.target.value && !isNaN(parseFloat(e.target.value))) {
                        setOrderAmount(parseFloat(e.target.value).toFixed(2));
                      }
                    }}
                    className="w-full rounded-md bg-white/10 text-white pl-8 pr-3 py-2 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <p className="text-xs text-white/50">
                  Enter the order amount to track financial impact per disposition
                </p>
              </div>
            )}
            
          <div className="space-y-2">
            <label className="block text-sm font-medium">Disposition:</label>
            <select
              value={disposition}
              onChange={(e) => setDisposition(e.target.value)}
              className="w-full rounded-md bg-white/10 text-white px-3 py-2 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{
                colorScheme: 'dark'
              }}
            >
              <option value="">Select disposition...</option>
              {task.taskType === "WOD_IVCS" ? (
                <>
                  <option value="Completed">✅ Completed</option>
                  <option value="Unable to Complete">❌ Unable to Complete</option>
                </>
              ) : task.taskType === "EMAIL_REQUESTS" ? (
                <>
                  <option value="Completed">✅ Completed</option>
                  <option value="Unable to Complete">❌ Unable to Complete</option>
                </>
              ) : task.taskType === "YOTPO" ? (
                <>
                  <option value="" disabled className="text-white/40 text-xs">— Reship —</option>
                  <option value="Reship – Item or order not received">📦 Item or order not received</option>
                  <option value="Reship – Incorrect item received">🔄 Incorrect item received</option>
                  <option value="Reship – Damaged or quality issue">⚠️ Damaged or quality issue</option>
                  <option value="" disabled className="text-white/40 text-xs">— Refund —</option>
                  <option value="Refund – Full refund issued">💵 Full refund issued</option>
                  <option value="Refund – Partial refund issued">💰 Partial refund issued</option>
                  <option value="Refund – Return to sender (RTS)">📮 Return to sender (RTS)</option>
                  <option value="Refund – Out of stock">📭 Out of stock</option>
                  <option value="Refund – Refund issued with condolences (pet passing or sensitive case)">🐾 Refund with condolences</option>
                  <option value="Refund – Chargeback or fraud (no further action required)">🚫 Chargeback or fraud</option>
                  <option value="" disabled className="text-white/40 text-xs">— Subscription —</option>
                  <option value="Subscription – Cancelled">❌ Cancelled</option>
                  <option value="Subscription – Updated (next charge date, frequency, etc.)">🔄 Updated (date/frequency)</option>
                  <option value="Subscription – Cancelled due to PayPal limitations">💳 Cancelled (PayPal limitations)</option>
                  <option value="" disabled className="text-white/40 text-xs">— Information —</option>
                  <option value="Information – Billing Inquiry">💳 Billing Inquiry</option>
                  <option value="Information – Tracking or delivery status provided">📍 Tracking or delivery status</option>
                  <option value="Information – Product usage or transition tips sent">💡 Product usage/transition tips</option>
                  <option value="Information – Product Information sent">ℹ️ Product Information sent</option>
                  <option value="Information – Shelf life or storage details sent">🗓️ Shelf life or storage details</option>
                  <option value="Information – Store locator or sourcing information sent">🏪 Store locator/sourcing info</option>
                  <option value="Information – Medical or veterinary guidance provided">🏥 Medical/veterinary guidance</option>
                  <option value="Information – Unfeasible request or information not available">🚫 Unfeasible request</option>
                  <option value="" disabled className="text-white/40 text-xs">— AER —</option>
                  <option value="AER – Serious AER - Refund Issued">🚨 Serious AER - Refund Issued</option>
                  <option value="AER – None Serious AER - RA Issued">⚠️ None Serious AER - RA Issued</option>
                  <option value="" disabled className="text-white/40 text-xs">— Other —</option>
                  <option value="Return Authorization – Created and sent to customer">📋 Return authorization sent</option>
                  <option value="Verification – Requested LOT number and photos from customer">📸 LOT number/photos requested</option>
                  <option value="Duplicate Request – No new action required">🔄 Duplicate request</option>
                  <option value="Previously Assisted – Issue already resolved or refund previously issued">✅ Previously assisted</option>
                  <option value="Unsubscribed – Customer removed from communications">🚫 Unsubscribed</option>
                  <option value="No Match – No valid account or order located">❓ No match found</option>
                  <option value="Escalation – Sent Negative Feedback Macro">⚠️ Escalation (negative feedback)</option>
                  <option value="Passed MBG">🔬 Passed MBG</option>
                  <option value="Delivered – Order delivered after review, no further action required">✅ Delivered</option>
                </>
              ) : task.taskType === "HOLDS" ? (
                <>
                  {/* Dispositions vary by current queue */}
                  {task.holdsStatus === "Agent Research" ? (
                    <>
                      <option value="Duplicate">🔄 Duplicate</option>
                      <option value="Refunded & Closed">💰 Refunded & Closed</option>
                      <option value="Refunded & Closed - Customer Requested Cancelation">❌ Refunded & Closed - Customer Requested Cancelation</option>
                      <option value="Resolved - fixed format / fixed address">✅ Resolved - fixed format / fixed address</option>
                      <option value="Resolved - other">✅ Resolved - other (requires note)</option>
                      <option value="International Order - Unable to Call/ Sent Email">🌍 International Order - Unable to Call/ Sent Email (→ Customer Contact)</option>
                      <option value="Unable to Resolve">⏭️ Unable to Resolve (→ Customer Contact) (requires note)</option>
                      <option value="Closed & Refunded - Fraud/Reseller">🔒 Closed & Refunded - Fraud/Reseller</option>
                    </>
                  ) : task.holdsStatus === "Customer Contact" ? (
                    <>
                      <option value="In Communication">💬 In Communication (→ Customer Contact)</option>
                      <option value="Refunded & Closed - No Contact">💰 Refunded & Closed - No Contact</option>
                      <option value="Refunded & Closed - Customer Requested Cancelation">❌ Refunded & Closed - Customer Requested Cancelation</option>
                      <option value="Refunded & Closed - Comma Issue">🔧 Refunded & Closed - Comma Issue</option>
                      <option value="Resolved - Customer Clarified">✅ Resolved - Customer Clarified</option>
                      <option value="Resolved - FRT Released">📦 Resolved - FRT Released</option>
                      <option value="Resolved - Other">✅ Resolved - Other (requires note)</option>
                      <option value="Closed & Refunded - Fraud/Reseller">🔒 Closed & Refunded - Fraud/Reseller</option>
                    </>
                  ) : task.holdsStatus === "Escalated Call 4+ Day" ? (
                    <>
                      <option value="Unable to Resolve">⏭️ Unable to Resolve (→ Escalation) (requires note)</option>
                      <option value="International Order - Unable to Call / Sent Email">🌍 International Order - Unable to Call / Sent Email (→ Customer Contact)</option>
                      <option value="Refunded & Closed - Customer Requested Cancelation">❌ Refunded & Closed - Customer Requested Cancelation</option>
                      <option value="Resolved - Customer Clarified">✅ Resolved - Customer Clarified</option>
                      <option value="Refunded & Closed - No Contact">💰 Refunded & Closed - No Contact</option>
                      <option value="Resolved - FRT Released">📦 Resolved - FRT Released</option>
                      <option value="Resolved - Other">✅ Resolved - Other (requires note)</option>
                      <option value="Closed & Refunded - Fraud/Reseller">🔒 Closed & Refunded - Fraud/Reseller</option>
                    </>
                  ) : (
                    <>
                      {/* Duplicates queue or unknown - show Agent Research options as default */}
                      <option value="Duplicate">🔄 Duplicate</option>
                      <option value="Refunded & Closed">💰 Refunded & Closed</option>
                      <option value="Refunded & Closed - Customer Requested Cancelation">❌ Refunded & Closed - Customer Requested Cancelation</option>
                      <option value="Resolved - fixed format / fixed address">✅ Resolved - fixed format / fixed address</option>
                      <option value="Resolved - other">✅ Resolved - other (requires note)</option>
                      <option value="Unable to Resolve">⏭️ Unable to Resolve (→ Customer Contact) (requires note)</option>
                    </>
                  )}
                </>
              ) : (
                <>
                  <option value="Answered in Attentive">✅ Answered in Attentive</option>
                  <option value="Answered in SF">📋 Answered in SF</option>
                  <option value="Previously Assisted">🔄 Previously Assisted</option>
                  <option value="No Response Required (leadership advised)">⏸️ No Response Required</option>
                  <optgroup label="Spam">
                    <option value="Spam - Negative Feedback">🚫 Negative Feedback</option>
                    <option value="Spam - Positive Feedback">👍 Positive Feedback</option>
                    <option value="Spam - Off topic">📝 Off topic</option>
                    <option value="Spam - Gibberish">🤪 Gibberish</option>
                    <option value="Spam - One word statement">💬 One word statement</option>
                    <option value="Spam - Reaction Message">😀 Reaction Message</option>
                  </optgroup>
                </>
              )}
            </select>

            {/* Sub-disposition dropdown for WOD/IVCS "Completed" */}
            {task.taskType === "WOD_IVCS" && disposition === "Completed" && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/70">Sub-disposition:</label>
                <select
                  value={subDisposition}
                  onChange={(e) => setSubDisposition(e.target.value)}
                  className="w-full rounded-md bg-white/10 text-white px-3 py-2 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{
                    colorScheme: 'dark'
                  }}
                >
                  <option value="">Select sub-disposition...</option>
                  <option value="Fixed Amounts">✅ Fixed Amounts</option>
                  <option value="Unable to fix amounts (everything is matching)">✅ Unable to fix amounts (everything is matching)</option>
                  <option value="Added PayPal Payment info">💳 Added PayPal Payment info</option>
                  <option value="Cannot edit CS">📝 Cannot edit CS</option>
                  <option value="Completed SO only - CS line location error">🔧 Completed SO only - CS line location error</option>
                </select>
              </div>
            )}

            {/* Sub-disposition dropdown for WOD/IVCS "Unable to Complete" */}
            {task.taskType === "WOD_IVCS" && disposition === "Unable to Complete" && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/70">Sub-disposition:</label>
                <select
                  value={subDisposition}
                  onChange={(e) => setSubDisposition(e.target.value)}
                  className="w-full rounded-md bg-white/10 text-white px-3 py-2 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{
                    colorScheme: 'dark'
                  }}
                >
                  <option value="">Select sub-disposition...</option>
                  <option value="Not Completed - Canada Lock">🇨🇦 Not Completed - Canada Lock</option>
                  <option value="Not Completed - Meta">📱 Not Completed - Meta</option>
                  <option value="Not Completed - No edit button">🔄 Not Completed - No edit button</option>
                  <option value="Not Completed - Locked (CS was able to be edited)">🔒 Not Completed - Locked (CS was able to be edited)</option>
                  <option value="Not Completed - Reship">📦 Not Completed - Reship</option>
                </select>
              </div>
            )}

            {/* Sub-disposition dropdown for Email Requests "Unable to Complete" */}
            {task.taskType === "EMAIL_REQUESTS" && disposition === "Unable to Complete" && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/70">Sub-disposition:</label>
                <select
                  value={subDisposition}
                  onChange={(e) => setSubDisposition(e.target.value)}
                  className="w-full rounded-md bg-white/10 text-white px-3 py-2 ring-1 ring-white/10"
                >
                  <option value="">Select sub-disposition...</option>
                  <option value="Unfeasable request / Information not available">🚫 Unfeasable request / Information not available</option>
                  <option value="Incomplete or Missing Info">📝 Incomplete or Missing Info</option>
                  <option value="Link/Sale Unavailable">🔗 Link/Sale Unavailable</option>
                  <option value="No Specification on Requests">❓ No Specification on Requests</option>
                  <option value="Requesting info on ALL Products">📦 Requesting info on ALL Products</option>
                  <option value="Duplicate Request">🔄 Duplicate Request</option>
                </select>
              </div>
            )}
            
            {/* SF Case # field for "Answered in SF" */}
            {disposition === "Answered in SF" && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/80">
                  SF Case # <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={sfCaseNumber}
                  onChange={(e) => setSfCaseNumber(e.target.value)}
                  placeholder="Enter Salesforce Case Number"
                  className="w-full rounded-md bg-white/10 text-white placeholder-white/40 px-3 py-2 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            )}

            {/* SF Case # field for Email Requests "Completed" */}
            {task.taskType === "EMAIL_REQUESTS" && disposition === "Completed" && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/80">
                  SF Case # <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={sfCaseNumber}
                  onChange={(e) => setSfCaseNumber(e.target.value)}
                  placeholder="Enter Salesforce Case Number"
                  className="w-full rounded-md bg-white/10 text-white placeholder-white/40 px-3 py-2 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            )}

            {/* SF Case # field for Yotpo (required for most dispositions, with 4 exceptions) */}
            {task.taskType === "YOTPO" && disposition && (() => {
              // Exceptions: These dispositions DO NOT require SF Case Number
              const noSfRequired = [
                "Information – Unfeasible request or information not available",
                "Duplicate Request – No new action required",
                "Previously Assisted – Issue already resolved or refund previously issued",
                "No Match – No valid account or order located"
              ];
              
              return !noSfRequired.includes(disposition);
            })() && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/80">
                  SF Case # <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={sfCaseNumber}
                  onChange={(e) => setSfCaseNumber(e.target.value)}
                  placeholder="Enter Salesforce Case Number"
                  className="w-full rounded-md bg-white/10 text-white placeholder-white/40 px-3 py-2 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            )}

            {/* Disposition Notes field for Holds tasks (required for ALL Resolved dispositions) */}
            {task.taskType === "HOLDS" && disposition && (() => {
              // Dispositions that require a note
              const requiresNote = [
                "Unable to Resolve", // Required when in Escalation queue
                "Resolved - other",
                "Resolved - Other",
                "Resolved - fixed format / fixed address",
                "Resolved - Customer Clarified",
                "Resolved - FRT Released"
              ];
              
              // Check if disposition starts with "Resolved"
              const isResolved = disposition.toLowerCase().startsWith("resolved");
              
              // "Unable to Resolve" requires note when in Escalation queue
              const isUnableToResolveInEscalation = disposition === "Unable to Resolve" && task.holdsStatus === "Escalated Call 4+ Day";
              
              return requiresNote.includes(disposition) || isResolved || isUnableToResolveInEscalation;
            })() && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/80">
                  Reason / Notes: <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={dispositionNote}
                  onChange={(e) => setDispositionNote(e.target.value)}
                  placeholder={disposition.toLowerCase().startsWith("resolved") 
                    ? "Provide details about how this order was resolved (required for all Resolved dispositions)..."
                    : "Explain why this order cannot be resolved or provide additional details..."}
                  rows={3}
                  className="w-full rounded-md bg-white/10 text-white placeholder-white/40 px-3 py-2 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  required
                />
                <p className="text-xs text-white/50">
                  This note will be visible in the Queue Journey, Resolved Orders Report, and to assigned agents
                </p>
              </div>
            )}

            <PrimaryButton 
              onClick={handleComplete}
              disabled={(() => {
                // No disposition selected
                if (!disposition) return true;
                
                // Text Club: SF Case # required for "Answered in SF"
                if (disposition === "Answered in SF" && !sfCaseNumber.trim()) return true;
                
                // Email Requests validations
                if (task.taskType === "EMAIL_REQUESTS") {
                  if (disposition === "Completed" && !sfCaseNumber.trim()) return true;
                  if (disposition === "Unable to Complete" && !subDisposition) return true;
                }
                
                // WOD/IVCS validations
                if (task.taskType === "WOD_IVCS") {
                  if ((disposition === "Completed" || disposition === "Unable to Complete") && !subDisposition) return true;
                }
                
                // Holds validations
                if (task.taskType === "HOLDS") {
                  // Order amount ALWAYS required
                  const orderAmountValid = orderAmount && parseFloat(orderAmount) > 0;
                  if (!orderAmountValid) return true;
                  
                  // Note required for ALL "Resolved" dispositions
                  const isResolved = disposition.toLowerCase().startsWith("resolved");
                  const noteRequiredDispositions = ["Unable to Resolve", "Resolved - other", "Resolved - Other", "Resolved - fixed format / fixed address", "Resolved - Customer Clarified", "Resolved - FRT Released"];
                  if ((noteRequiredDispositions.includes(disposition) || isResolved) && !dispositionNote.trim()) return true;
                }
                
                // Yotpo: SF Case # required except for 4 dispositions
                if (task.taskType === "YOTPO" && disposition) {
                  const noSfRequired = [
                    "Information – Unfeasible request or information not available",
                    "Duplicate Request – No new action required",
                    "Previously Assisted – Issue already resolved or refund previously issued",
                    "No Match – No valid account or order located"
                  ];
                  if (!noSfRequired.includes(disposition) && !sfCaseNumber.trim()) return true;
                }
                
                // All validations passed
                return false;
              })()}
              className="w-full"
            >
              Complete Task
            </PrimaryButton>
          </div>
          </div>
        )}

        {/* Assistance Required section - Only show if locked (no manager response yet) */}
        {isTaskLocked && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
            <div className="text-red-400 font-medium mb-2">🆘 Assistance Required</div>
            <div className="text-sm text-white/80 mb-2">
              <strong>Your request:</strong> {task.assistanceNotes}
            </div>
          </div>
        )}

        {showDispo && (
          <div className="space-y-2">
            <input
              type="text"
              value={assistanceMsg}
              onChange={(e) => setAssistanceMsg(e.target.value)}
              placeholder="Need help with..."
              className="w-full rounded-md bg-white/10 text-white placeholder-white/40 px-3 py-2 ring-1 ring-white/10"
            />
            <SmallButton 
              onClick={handleAssistance}
              disabled={!assistanceMsg.trim()}
              className="w-full bg-orange-600 hover:bg-orange-700"
            >
              🆘 Request Assistance
            </SmallButton>
          </div>
        )}
      </div>
    </div>
  );
}