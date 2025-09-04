"use client";

import { useState, useEffect } from "react";
import ChangePasswordModal from '@/app/_components/ChangePasswordModal';
import ThemeToggle from '@/app/_components/ThemeToggle';

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
  status: "PENDING" | "IN_PROGRESS" | "ASSISTANCE_REQUIRED" | "COMPLETED";
  assignedToId: string;
  startTime?: string;
  endTime?: string;
  durationSec?: number;
  disposition?: string;
  assistanceNotes?: string;
  managerResponse?: string;
  createdAt: string;
  updatedAt: string;
}

interface AgentStats {
  assigned: number;
  completed: number;
  avgDuration: number;
  assistanceSent: number;
  lastUpdate: string;
}

export default function AgentPage() {
  const [email, setEmail] = useState<string>("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<AgentStats | null>(null);
  
  // New state for interactive features
  const [welcomeMessage, setWelcomeMessage] = useState<string>("");
  const [showCompletedTasks, setShowCompletedTasks] = useState<boolean>(false);
  const [completedTasksToday, setCompletedTasksToday] = useState<Task[]>([]);
  const [lastActivityTime, setLastActivityTime] = useState<Date>(new Date());
  const [taskStreak, setTaskStreak] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [startedTasks, setStartedTasks] = useState<Set<string>>(new Set());
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [forceRender, setForceRender] = useState(0);

  // Password change modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

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

  const startPolling = () => {
    if (pollingInterval) clearInterval(pollingInterval);
    console.log("🔄 Starting SIMPLE polling system...");
    
    // Simple direct polling every 2 seconds
    const interval = setInterval(async () => {
      console.log("🔄 SIMPLE Polling for updates...");
      const currentEmail = localStorage.getItem('agentEmail');
      console.log("🔄 SIMPLE Current email:", currentEmail);
      
      if (currentEmail) {
        try {
          console.log("🔄 SIMPLE About to fetch tasks...");
          const url = `/api/agent/tasks?email=${encodeURIComponent(currentEmail)}`;
          console.log("🔄 SIMPLE Fetching from:", url);
          
          const res = await fetch(url);
          console.log("🔄 SIMPLE Response status:", res.status);
          
          if (res.ok) {
            const data = await res.json();
            console.log("🔄 SIMPLE Response data:", data);
            
            if (data.success) {
              const newTasks = data.tasks;
              console.log("🔄 SIMPLE Loaded tasks:", newTasks.length);
              
                               // Check for manager responses
                 const tasksWithResponses = newTasks.filter((t: any) => t.managerResponse);
                 if (tasksWithResponses.length > 0) {
                   console.log("🔄 SIMPLE Found manager responses:", tasksWithResponses.length);
                   
                   // Automatically add manager responses to DOM (seamless)
                   tasksWithResponses.forEach((task: any) => {
                     const taskElement = document.getElementById(`task-${task.id}`);
                     if (taskElement && task.managerResponse) {
                       // Check if response already exists
                       const existingResponse = taskElement.querySelector('.nuclear-manager-response');
                       if (!existingResponse) {
                         console.log("🚀 AUTO: Adding manager response to task", task.id);
                         
                         // Add new response
                         const responseHTML = `
                           <div class="nuclear-manager-response" style="background: #065f46; border: 2px solid #10b981; border-radius: 8px; padding: 16px; margin: 8px 0; animation: pulse 2s infinite;">
                             <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                               <div style="color: #6ee7b7; font-weight: 600; font-size: 18px;">💬 Manager Response</div>
                               <span style="color: #d1fae5; font-size: 12px; background: #047857; padding: 4px 8px; border-radius: 12px;">✨ Ready to Resume</span>
                             </div>
                             <div style="color: white; margin-bottom: 12px; padding: 12px; background: #064e3b; border-radius: 4px; border: 1px solid #10b981;">
                               ${task.managerResponse}
                             </div>
                             <div style="font-size: 12px; color: #d1fae5; background: #064e3b; padding: 8px; border-radius: 4px; border: 1px solid #10b981;">
                               💡 You can now continue working on this task. Time will resume from when you started.
                             </div>
                           </div>
                         `;
                         
                         // Insert before the controls section
                         const controlsSection = taskElement.querySelector('.space-y-3');
                         if (controlsSection) {
                           controlsSection.insertAdjacentHTML('beforebegin', responseHTML);
                         }
                       }
                     }
                   });
                 }
                 
                 // Update tasks
                 setTasks(newTasks);
                 setLastUpdate(new Date());
            }
          }
        } catch (error) {
          console.error("🔄 SIMPLE Polling error:", error);
        }
      } else {
        console.log("🔄 SIMPLE No email available");
      }
    }, 2000); // 2 seconds for simple polling
    
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

  const loadTasks = async (emailToUse?: string) => {
    console.log("📥 loadTasks called with emailToUse:", emailToUse);
    const currentEmail = emailToUse || email;
    console.log("📥 currentEmail resolved to:", currentEmail);
    if (!currentEmail) {
      console.log("❌ No email, skipping loadTasks");
      return;
    }
    console.log("📥 Loading tasks for:", currentEmail);
    setLoading(true);
    try {
      const url = `/api/agent/tasks?email=${encodeURIComponent(currentEmail)}`;
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
        setLastUpdate(new Date());
        
        // Force complete re-render if we have manager responses
        if (tasksWithResponses.length > 0) {
          console.log("🔄 Forcing complete re-render due to manager responses");
          // Force complete component remount
          setForceRender(prev => prev + 1);
          
          // Also try manual DOM manipulation as backup
          setTimeout(() => {
            console.log("🔧 Attempting manual DOM update for manager responses");
            tasksWithResponses.forEach((task: any) => {
              const taskElement = document.getElementById(`task-${task.id}`);
              if (taskElement && task.managerResponse) {
                // Check if manager response section already exists
                const existingResponse = taskElement.querySelector('.manager-response-section');
                if (!existingResponse) {
                  console.log(`🔧 Adding manager response to task ${task.id}`);
                  const responseHTML = `
                    <div class="manager-response-section bg-green-900/30 border-2 border-green-500/70 rounded-lg p-4 animate-pulse">
                      <div class="flex items-center justify-between mb-3">
                        <div class="text-green-300 font-semibold text-lg">💬 Manager Response</div>
                        <span class="text-green-200 text-sm bg-green-600/30 px-2 py-1 rounded-full">✨ Ready to Resume</span>
                      </div>
                      <div class="text-white mb-3 p-3 bg-green-800/20 rounded border border-green-600/50">
                        ${task.managerResponse}
                      </div>
                      <div class="text-sm text-green-200 bg-green-800/20 p-2 rounded border border-green-600/30">
                        💡 You can now continue working on this task. Time will resume from when you started.
                      </div>
                    </div>
                  `;
                  
                  // Insert before the controls section
                  const controlsSection = taskElement.querySelector('.space-y-3');
                  if (controlsSection) {
                    controlsSection.insertAdjacentHTML('beforebegin', responseHTML);
                  }
                }
              }
            });
          }, 100);
        }
        
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

  const loadStats = async (emailToUse?: string) => {
    const currentEmail = emailToUse || email;
    if (!currentEmail) return;
    try {
      const res = await fetch(`/api/agent/stats?email=${encodeURIComponent(currentEmail)}`);
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
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
    try {
      const res = await fetch(`/api/agent/tasks/${taskId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        // Add to local started tasks state for instant UI update
        setStartedTasks(prev => new Set(prev).add(taskId));
        // Update stats to reflect the change
        await loadStats();
      }
    } catch (error) {
      console.error("Failed to start task:", error);
    }
  };

  const completeTask = async (taskId: string, disposition: string, sfCaseNumber?: string) => {
    if (!disposition) {
      alert("Please select a disposition.");
      return;
    }
    try {
      const res = await fetch(`/api/agent/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, disposition, sfCaseNumber }),
      });
      if (res.ok) {
        // Remove from started tasks since it's completed
        setStartedTasks(prev => {
          const newSet = new Set(prev);
          newSet.delete(taskId);
          return newSet;
        });
        // Remove task from local state for instant UI update
        setTasks(prev => prev.filter(t => t.id !== taskId));
        // Update stats to reflect the completion
        await loadStats();
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
            ? { ...t, status: "ASSISTANCE_REQUIRED", assistanceNotes: message }
            : t
        ));
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
    <main className="mx-auto max-w-4xl p-6 space-y-6 min-h-screen bg-gradient-to-br from-neutral-900 to-black dark:from-neutral-900 dark:to-black light:from-slate-50 light:to-slate-100">
      {/* Header with Stats */}
      <div className="space-y-4">
        {/* Company Logo Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/golden-attentive-logo.svg" 
              alt="Golden Attentive" 
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

            </div>
          </div>
        </div>
        {loading ? (
          <div className="text-center py-8 text-white/60">Loading tasks...</div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-8 text-white/60">No tasks assigned yet.</div>
        ) : (
          <div>
            {/* Manager Response Summary - Show at top */}
            {(() => {
              const hasResponses = tasks.some(t => t.managerResponse);
              const responseTasks = tasks.filter(t => t.managerResponse);
              console.log("🔍 Debug Summary:", { hasResponses, responseCount: responseTasks.length, tasks: tasks.length });
              
              if (hasResponses) {
                return (
                  <div 
                    className="mb-6 p-4 bg-green-900/20 border-2 border-green-500/50 rounded-lg"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-green-400 text-xl">💬</span>
                      <h3 className="text-green-300 font-semibold text-lg">Manager Responses Available</h3>
                      <span className="text-green-200 text-sm bg-green-600/30 px-2 py-1 rounded-full">
                        {responseTasks.length} Response{responseTasks.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {responseTasks.map((task, index) => (
                        <div key={task.id} className="p-3 bg-green-800/20 rounded border border-green-600/30">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-green-200 font-medium">Task {index + 1}: {task.brand}</span>
                            <span className="text-green-200 text-sm bg-green-600/30 px-2 py-1 rounded-full">
                              {task.status.replace("_", " ")}
                            </span>
                          </div>
                          <div className="text-white text-sm">
                            <strong>Manager Response:</strong> {task.managerResponse}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {/* Task Cards */}
            <div className="space-y-4">
              {tasks.map((task, index) => (
                <div id={`task-${task.id}`} key={task.id}>
                  <TaskCard
                    task={task}
                    startedTasks={startedTasks}
                    onStart={() => startTask(task.id)}
                    onComplete={completeTask}
                    onAssistance={requestAssistance}
                  />
                </div>
              ))}
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
  onComplete: (taskId: string, disposition: string, sfCaseNumber?: string) => void;
  onAssistance: (taskId: string, message: string) => void;
}) {
  const [disposition, setDisposition] = useState("");
  const [assistanceMsg, setAssistanceMsg] = useState("");
  const [sfCaseNumber, setSfCaseNumber] = useState("");

  // Clear form fields after successful actions
  const handleComplete = () => {
    if (!disposition) return;
    
    // For "Answered in SF", require SF Case #
    if (disposition === "Answered in SF") {
      if (!sfCaseNumber.trim()) {
        alert("Please enter the SF Case # for Answered in SF disposition.");
        return;
      }
      
      // Send both disposition and SF Case # separately
      onComplete(task.id, disposition, sfCaseNumber.trim());
    } else {
      onComplete(task.id, disposition);
    }
    
    // Clear form fields
    setDisposition("");
    setSfCaseNumber("");
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
  const showDispo = isTaskStarted && task.status !== "ASSISTANCE_REQUIRED";
  const hasManagerResponse = task.status === "ASSISTANCE_REQUIRED" && task.managerResponse;

  // Helper functions
  const getBrandEmoji = (brand: string) => {
    const map: Record<string, string> = { 
      "ActivatedYou": "🧘‍♀️💊", 
      "UPN": "🚀🧬" 
    };
    return map[brand] || "📦";
  };

  const getStatusEmoji = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'pending') return '📥';
    if (s === 'in_progress') return '🚀';
    if (s === 'completed') return '✅';
    if (s === 'assistance_required') return '🆘';
    return '❓';
  };

  return (
    <div className={`bg-white/5 rounded-lg p-4 space-y-3 border ${
      task.managerResponse 
        ? "border-green-500/50 bg-green-900/10" 
        : "border-white/10"
    }`}>
      {/* Brand */}
      <div className="flex items-center gap-2 text-lg font-semibold">
        <span>{getBrandEmoji(task.brand)}</span>
        <span>{task.brand}</span>
        {task.managerResponse && (
          <span className="text-green-400 text-sm font-normal">✨ Ready to Resume</span>
        )}
      </div>

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

      {/* Status */}
      <div className="flex items-center gap-2">
        <span>{getStatusEmoji(task.status)}</span>
        <Badge tone={task.status === "COMPLETED" ? "success" : "warning"}>
          {task.status.replace("_", " ").toUpperCase()}
        </Badge>
      </div>

      {/* Manager Response - Show when available */}
      {task.managerResponse && (
        <div 
          key={`manager-response-${task.id}-${task.managerResponse}`}
          className="bg-green-900/30 border-2 border-green-500/70 rounded-lg p-4 animate-pulse"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="text-green-300 font-semibold text-lg">💬 Manager Response</div>
            <span className="text-green-200 text-sm bg-green-600/30 px-2 py-1 rounded-full">✨ Ready to Resume</span>
          </div>
          <div className="text-white mb-3 p-3 bg-green-800/20 rounded border border-green-600/50">
            {task.managerResponse}
          </div>
          <div className="text-sm text-green-200 bg-green-800/20 p-2 rounded border border-green-600/30">
            💡 You can now continue working on this task. Time will resume from when you started.
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
          <div className="space-y-2">
            <label className="block text-sm font-medium">Disposition:</label>
            <select
              value={disposition}
              onChange={(e) => setDisposition(e.target.value)}
              className="w-full rounded-md bg-white/10 text-white px-3 py-2 ring-1 ring-white/10"
            >
              <option value="">Select disposition...</option>
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
            </select>
            
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
            <PrimaryButton 
              onClick={handleComplete}
              disabled={!disposition || (disposition === "Answered in SF" && !sfCaseNumber.trim())}
              className="w-full"
            >
              Complete Task
            </PrimaryButton>
          </div>
        )}

        {task.status === "ASSISTANCE_REQUIRED" && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
            <div className="text-red-400 font-medium mb-2">🆘 Assistance Required</div>
            <div className="text-sm text-white/80 mb-2">
              <strong>Your request:</strong> {task.assistanceNotes}
            </div>
            {hasManagerResponse && (
              <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3 mt-2">
                <div className="text-green-400 font-medium mb-1">💬 Manager Response:</div>
                <div className="text-sm text-white/90">{task.managerResponse}</div>
              </div>
            )}
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