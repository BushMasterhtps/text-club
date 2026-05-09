"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import { useAssistanceRequestsContext } from "@/contexts/AssistanceRequestsContext";
import { fetchManagerAssistance } from "@/lib/manager-assistance-fetch";

interface AssistanceRequestsSectionProps {
  taskType?: "TEXT_CLUB" | "WOD_IVCS" | "EMAIL_REQUESTS" | "STANDALONE_REFUNDS" | "YOTPO" | "HOLDS";
  onPendingCountChange?: (count: number) => void; // Callback to notify parent of pending count changes
  onResponseSent?: () => void; // Callback to refresh notification hook when manager responds
}

interface AssistanceRequest {
  id: string;
  brand: string;
  phone: string;
  text: string;
  email?: string | null;
  agentName: string;
  agentEmail: string;
  assistanceNotes: string;
  managerResponse?: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  taskType?: string;
  // WOD/IVCS specific fields
  wodIvcsSource?: string;
  documentNumber?: string;
  customerName?: string;
  amount?: number;
  webOrderDifference?: number;
  purchaseDate?: string;
  orderAge?: string;
  // Email Request specific fields
  emailRequestFor?: string;
  details?: string;
  salesforceCaseNumber?: string;
  customerNameNumber?: string;
  // Standalone Refund specific fields
  refundAmount?: number;
  paymentMethod?: string;
  refundReason?: string;
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
}

function filterRowsForTaskType(
  rows: AssistanceRequest[],
  taskType: AssistanceRequestsSectionProps["taskType"],
): AssistanceRequest[] {
  if (!taskType) return rows;
  if (taskType === "HOLDS") {
    return rows.filter((req) => req.taskType === "HOLDS");
  }
  return rows.filter(
    (req) =>
      req.taskType !== "HOLDS" &&
      (req.taskType === "TEXT_CLUB" ||
        req.taskType === "WOD_IVCS" ||
        req.taskType === "EMAIL_REQUESTS" ||
        req.taskType === "YOTPO" ||
        req.taskType === "STANDALONE_REFUNDS"),
  );
}

export function AssistanceRequestsSection({ taskType = "TEXT_CLUB", onPendingCountChange, onResponseSent }: AssistanceRequestsSectionProps) {
  const [requests, setRequests] = useState<AssistanceRequest[]>([]);
  /** True only until the first fetch for this `taskType` finishes (empty list may still be a valid result). */
  const [bootstrapping, setBootstrapping] = useState(true);
  /** True during standalone polls / manual refresh (no shared context). */
  const [localRefreshing, setLocalRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [responseText, setResponseText] = useState<Record<string, string>>({});
  const previousPendingCountRef = useRef(0);
  const hasCompletedInitialFetch = useRef(false);

  const assistanceContext = useAssistanceRequestsContext();
  const useSharedList = assistanceContext != null;

  const filteredFromShared = useMemo(() => {
    if (!assistanceContext?.requests) return null;
    return filterRowsForTaskType(assistanceContext.requests as AssistanceRequest[], taskType);
  }, [assistanceContext?.requests, assistanceContext?.lastUpdated, taskType]);

  useEffect(() => {
    if (!useSharedList || filteredFromShared === null) return;
    setRequests(filteredFromShared);
    setBootstrapping(
      assistanceContext!.loading &&
        assistanceContext!.lastUpdated === null &&
        assistanceContext!.requests.length === 0,
    );
    hasCompletedInitialFetch.current = true;
  }, [
    useSharedList,
    filteredFromShared,
    assistanceContext?.loading,
    assistanceContext?.lastUpdated,
    assistanceContext?.requests.length,
  ]);

  const loadRequests = async (options?: { forceRefresh?: boolean }) => {
    const isInitial = !hasCompletedInitialFetch.current;
    if (isInitial) {
      setBootstrapping(true);
    } else {
      setLocalRefreshing(true);
    }
    try {
      const { ok, data } = await fetchManagerAssistance({
        bypassCache: options?.forceRefresh,
      });

      if (!ok || !data || data.success !== true) {
        if (options?.forceRefresh) {
          console.warn("Assistance refresh failed or empty; keeping existing requests in UI");
        }
        return;
      }

      let filteredRequests = filterRowsForTaskType((data.requests ?? []) as AssistanceRequest[], taskType);

      const pendingCount = filteredRequests.filter((req: AssistanceRequest) => req.status === "ASSISTANCE_REQUIRED").length;

      if (onPendingCountChange) {
        const previousCount = previousPendingCountRef.current;
        if (pendingCount !== previousCount) {
          onPendingCountChange(pendingCount);
          previousPendingCountRef.current = pendingCount;
        }
      }

      setRequests(filteredRequests);
    } catch (error) {
      console.error("Error loading assistance requests:", error);
    } finally {
      if (isInitial) {
        setBootstrapping(false);
        hasCompletedInitialFetch.current = true;
      } else {
        setLocalRefreshing(false);
      }
    }
  };

  useEffect(() => {
    if (useSharedList) return;
    hasCompletedInitialFetch.current = false;
    setBootstrapping(true);
    setRequests([]);
    void loadRequests();
    const interval = setInterval(() => void loadRequests(), 30000);
    return () => clearInterval(interval);
  }, [taskType, useSharedList]);

  useEffect(() => {
    if (!onPendingCountChange || !useSharedList || filteredFromShared === null) return;
    const pendingCount = filteredFromShared.filter((req) => req.status === "ASSISTANCE_REQUIRED").length;
    if (pendingCount !== previousPendingCountRef.current) {
      onPendingCountChange(pendingCount);
      previousPendingCountRef.current = pendingCount;
    }
  }, [useSharedList, filteredFromShared, onPendingCountChange]);

  const refreshing = useSharedList ? !!assistanceContext?.refreshing : localRefreshing;

  const handleResponse = async (requestId: string) => {
    const response = responseText[requestId]?.trim();
    if (!response) {
      alert("Please enter a response");
      return;
    }

    setBusy(requestId);
    try {
      const res = await fetch(`/api/manager/tasks/${requestId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      
      const data = await res.json();
      if (data.success) {
        setRequests((prev) => prev.filter((req) => req.id !== requestId));
        setResponseText((prev) => ({ ...prev, [requestId]: "" }));
        if (assistanceContext) {
          await assistanceContext.refresh({ bypassCache: true });
        } else if (onResponseSent) {
          await Promise.resolve(onResponseSent());
        }
        if (!assistanceContext) {
          await loadRequests({ forceRefresh: true });
        }
      } else {
        alert(data.error || "Failed to send response");
      }
    } catch (error) {
      console.error("Error sending response:", error);
      alert("Failed to send response");
    } finally {
      setBusy(null);
    }
  };

  const getTaskTypeInfo = (task: AssistanceRequest) => {
    if (task.taskType === "WOD_IVCS") {
      return { label: "WOD/IVCS", emoji: "🔧", color: "text-red-400" };
    } else if (task.taskType === "EMAIL_REQUESTS") {
      return { label: "Email Request", emoji: "📧", color: "text-green-400" };
    } else if (task.taskType === "STANDALONE_REFUNDS") {
      return { label: "Standalone Refund", emoji: "💰", color: "text-purple-400" };
    } else if (task.taskType === "YOTPO") {
      return { label: "Yotpo Review", emoji: "⭐", color: "text-yellow-400" };
    } else if (task.taskType === "HOLDS") {
      return { label: "Holds", emoji: "📄", color: "text-orange-400" };
    } else {
      return { label: "Text Club", emoji: "💬", color: "text-blue-400" };
    }
  };

  const getStatusEmoji = (status: string) => {
    switch (status) {
      case "ASSISTANCE_REQUIRED": return "🆘";
      case "IN_PROGRESS": return "▶️";
      default: return "❓";
    }
  };

  const getStatusTone = (status: string) => {
    switch (status) {
      case "ASSISTANCE_REQUIRED": return "danger";
      case "IN_PROGRESS": return "success";
      default: return "muted";
    }
  };

  const pendingRequests = requests.filter(r => r.status === "ASSISTANCE_REQUIRED");
  const respondedRequests = requests.filter(r => r.status === "IN_PROGRESS" && r.managerResponse);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">
          🆘 Assistance Requests
          {taskType === "HOLDS" 
            ? " (Holds Only)" 
            : " (All Task Types)"}
        </h3>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {refreshing ? (
            <span className="text-xs text-white/50" aria-live="polite">
              Refreshing…
            </span>
          ) : null}
          <span className="text-sm text-white/60">{requests.length} total requests</span>
          <SmallButton
            onClick={() =>
              void (useSharedList
                ? assistanceContext!.refresh({ bypassCache: true })
                : loadRequests({ forceRefresh: true }))
            }
            disabled={bootstrapping || refreshing}
          >
            {refreshing ? "Refreshing…" : "🔄 Refresh"}
          </SmallButton>
        </div>
      </div>

      {bootstrapping && requests.length === 0 ? (
        <div className="text-center py-8 text-white/60">Loading assistance requests...</div>
      ) : requests.length === 0 ? (
        <div className="text-center py-8 text-white/60">
          No assistance requests at this time.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pending Requests */}
          {pendingRequests.length > 0 && (
            <div>
              <h4 className="text-md font-medium text-white mb-3">
                🆘 Pending Requests ({pendingRequests.length})
              </h4>
              <div className="space-y-4">
                {pendingRequests.map((request) => {
                  const taskTypeInfo = getTaskTypeInfo(request);
                  return (
                    <div key={request.id} className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={taskTypeInfo.color}>{taskTypeInfo.emoji}</span>
                            <span className="text-sm text-white/70">{taskTypeInfo.label}</span>
                            <span className="text-white/40">•</span>
                            <span className="font-medium">{request.brand}</span>
                            <span className="text-white/40">•</span>
                            <span className="text-sm text-white/60">{request.agentName}</span>
                          </div>
                          
                          {/* Task-specific content */}
                          {request.taskType === "WOD_IVCS" ? (
                            <div className="text-sm text-white/80 space-y-1">
                              <div><strong>Customer:</strong> {request.customerName || "N/A"}</div>
                              <div><strong>Order:</strong> {request.documentNumber || "N/A"}</div>
                              <div><strong>Amount:</strong> {request.amount ? `$${request.amount}` : "N/A"}</div>
                              <div><strong>Age:</strong> {request.orderAge || "N/A"}</div>
                            </div>
                          ) : request.taskType === "EMAIL_REQUESTS" ? (
                            <div className="text-sm text-white/80 space-y-1">
                              {request.email && (
                                <div><strong>📧 Email:</strong> {request.email}</div>
                              )}
                              {request.customerNameNumber && (
                                <div><strong>👤 Customer Name:</strong> {request.customerNameNumber}</div>
                              )}
                              {request.salesforceCaseNumber && (
                                <div><strong>📋 SF Case #:</strong> {request.salesforceCaseNumber}</div>
                              )}
                              <div><strong>Request For:</strong> {request.emailRequestFor || "N/A"}</div>
                              {request.details && (
                                <div className="mt-2">
                                  <strong>Details:</strong>
                                  <div className="mt-1 bg-white/5 p-3 rounded border border-white/10 whitespace-pre-wrap text-white/90">
                                    {request.details}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : request.taskType === "STANDALONE_REFUNDS" ? (
                            <div className="text-sm text-white/80 space-y-1">
                              <div><strong>Refund Amount:</strong> {request.refundAmount ? `$${request.refundAmount}` : "N/A"}</div>
                              <div><strong>Payment Method:</strong> {request.paymentMethod || "N/A"}</div>
                              <div><strong>Reason:</strong> {request.refundReason || "N/A"}</div>
                            </div>
                          ) : request.taskType === "HOLDS" ? (
                            <div className="text-sm text-white/80 space-y-1">
                              <div><strong>📄 Order Number:</strong> {request.holdsOrderNumber || "N/A"}</div>
                              <div><strong>✉️ Customer Email:</strong> {request.holdsCustomerEmail || "N/A"}</div>
                              <div><strong>📅 Order Date:</strong> {request.holdsOrderDate ? new Date(request.holdsOrderDate).toLocaleDateString() : "N/A"}</div>
                              <div><strong>🏷️ Queue:</strong> {request.holdsStatus || "N/A"}</div>
                              <div><strong>⭐ Priority:</strong> {request.holdsPriority || "N/A"}</div>
                              <div><strong>📆 Days in System:</strong> {request.holdsDaysInSystem || "N/A"}</div>
                            </div>
                          ) : request.taskType === "YOTPO" ? (
                            <div className="text-sm text-white/80 space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div><strong>👤 Customer:</strong> {request.yotpoCustomerName || "N/A"}</div>
                                <div><strong>📧 Email:</strong> {request.yotpoEmail || "N/A"}</div>
                                <div><strong>📅 Order Date:</strong> {request.yotpoOrderDate ? new Date(request.yotpoOrderDate).toLocaleDateString() : "N/A"}</div>
                                <div><strong>📦 Product:</strong> {request.yotpoProduct || "N/A"}</div>
                                <div><strong>🏷️ Issue Topic:</strong> {request.yotpoIssueTopic || "N/A"}</div>
                                <div><strong>📅 Review Date:</strong> {request.yotpoReviewDate ? new Date(request.yotpoReviewDate).toLocaleDateString() : "N/A"}</div>
                              </div>
                              <div className="mt-2">
                                <strong>⭐ Review:</strong>
                                <div className="mt-1 bg-white/5 p-3 rounded border border-white/10 whitespace-pre-wrap text-white/90">
                                  {request.yotpoReview || "No review text"}
                                </div>
                              </div>
                              {request.yotpoSfOrderLink && (
                                <div>
                                  <strong>🔗 SF Order:</strong>{' '}
                                  <a
                                    href={request.yotpoSfOrderLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:text-blue-300 underline"
                                  >
                                    Open in Salesforce →
                                  </a>
                                </div>
                              )}
                            </div>
                          ) : (
                            // Text Club tasks - show all available details
                            <div className="text-sm text-white/80 space-y-1">
                              {request.email && (
                                <div><strong>📧 Email:</strong> {request.email}</div>
                              )}
                              <div><strong>📞 Phone:</strong> {request.phone}</div>
                              <div><strong>💬 Message:</strong> {request.text}</div>
                              {request.brand && request.brand !== "Unknown" && (
                                <div><strong>🏷️ Brand:</strong> {request.brand}</div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="text-2xl">{getStatusEmoji(request.status)}</div>
                      </div>
                      
                      <div className="mb-3">
                        <div className="text-sm text-white/60 mb-1">Agent Request</div>
                        <div className="text-white bg-red-800/30 p-3 rounded border border-red-700">
                          <div className="text-sm text-red-300 mb-1">
                            {request.agentName} ({request.agentEmail})
                          </div>
                          {request.assistanceNotes}
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <textarea
                          value={responseText[request.id] || ""}
                          onChange={(e) => setResponseText(prev => ({ ...prev, [request.id]: e.target.value }))}
                          placeholder="Enter your response..."
                          className="flex-1 rounded-md bg-white/10 text-white placeholder-white/40 px-3 py-2 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={3}
                        />
                        <SmallButton
                          onClick={() => handleResponse(request.id)}
                          disabled={busy === request.id || !responseText[request.id]?.trim()}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          {busy === request.id ? "Sending..." : "Send Response"}
                        </SmallButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Responded Requests */}
          {respondedRequests.length > 0 && (
            <div>
              <h4 className="text-md font-medium text-white mb-3">
                ✅ Responded Requests ({respondedRequests.length})
              </h4>
              <div className="space-y-4">
                {respondedRequests.map((request) => {
                  const taskTypeInfo = getTaskTypeInfo(request);
                  return (
                    <div key={request.id} className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={taskTypeInfo.color}>{taskTypeInfo.emoji}</span>
                            <span className="text-sm text-white/70">{taskTypeInfo.label}</span>
                            <span className="text-white/40">•</span>
                            <span className="font-medium">{request.brand}</span>
                            <span className="text-white/40">•</span>
                            <span className="text-sm text-white/60">{request.agentName}</span>
                          </div>
                          
                          {/* Task-specific content (same as pending requests) */}
                          {request.taskType === "YOTPO" ? (
                            <div className="text-sm text-white/80 space-y-2 mt-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div><strong>👤 Customer:</strong> {request.yotpoCustomerName || "N/A"}</div>
                                <div><strong>📧 Email:</strong> {request.yotpoEmail || "N/A"}</div>
                                <div><strong>📅 Order Date:</strong> {request.yotpoOrderDate ? new Date(request.yotpoOrderDate).toLocaleDateString() : "N/A"}</div>
                                <div><strong>📦 Product:</strong> {request.yotpoProduct || "N/A"}</div>
                                <div><strong>🏷️ Issue Topic:</strong> {request.yotpoIssueTopic || "N/A"}</div>
                                <div><strong>📅 Review Date:</strong> {request.yotpoReviewDate ? new Date(request.yotpoReviewDate).toLocaleDateString() : "N/A"}</div>
                              </div>
                              <div className="mt-2">
                                <strong>⭐ Review:</strong>
                                <div className="mt-1 bg-white/5 p-3 rounded border border-white/10 whitespace-pre-wrap text-white/90">
                                  {request.yotpoReview || "No review text"}
                                </div>
                              </div>
                              {request.yotpoSfOrderLink && (
                                <div>
                                  <strong>🔗 SF Order:</strong>{' '}
                                  <a
                                    href={request.yotpoSfOrderLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:text-blue-300 underline"
                                  >
                                    Open in Salesforce →
                                  </a>
                                </div>
                              )}
                            </div>
                          ) : request.taskType === "WOD_IVCS" ? (
                            <div className="text-sm text-white/80 space-y-1 mt-2">
                              <div><strong>Customer:</strong> {request.customerName || "N/A"}</div>
                              <div><strong>Order:</strong> {request.documentNumber || "N/A"}</div>
                              <div><strong>Amount:</strong> {request.amount ? `$${request.amount}` : "N/A"}</div>
                            </div>
                          ) : request.taskType === "EMAIL_REQUESTS" ? (
                            <div className="text-sm text-white/80 space-y-1 mt-2">
                              {request.email && (
                                <div><strong>📧 Email:</strong> {request.email}</div>
                              )}
                              {request.customerNameNumber && (
                                <div><strong>👤 Customer Name:</strong> {request.customerNameNumber}</div>
                              )}
                              {request.salesforceCaseNumber && (
                                <div><strong>📋 SF Case #:</strong> {request.salesforceCaseNumber}</div>
                              )}
                              <div><strong>Request For:</strong> {request.emailRequestFor || "N/A"}</div>
                              {request.details && (
                                <div className="mt-2">
                                  <strong>Details:</strong>
                                  <div className="mt-1 bg-white/5 p-3 rounded border border-white/10 whitespace-pre-wrap text-white/90">
                                    {request.details}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : request.taskType === "STANDALONE_REFUNDS" ? (
                            <div className="text-sm text-white/80 space-y-1 mt-2">
                              <div><strong>Refund Amount:</strong> {request.refundAmount ? `$${request.refundAmount}` : "N/A"}</div>
                              <div><strong>Payment Method:</strong> {request.paymentMethod || "N/A"}</div>
                            </div>
                          ) : request.taskType === "HOLDS" ? (
                            <div className="text-sm text-white/80 space-y-1 mt-2">
                              <div><strong>📄 Order Number:</strong> {request.holdsOrderNumber || "N/A"}</div>
                              <div><strong>✉️ Customer Email:</strong> {request.holdsCustomerEmail || "N/A"}</div>
                              <div><strong>🏷️ Queue:</strong> {request.holdsStatus || "N/A"}</div>
                              <div><strong>⭐ Priority:</strong> {request.holdsPriority || "N/A"}</div>
                            </div>
                          ) : (
                            // Text Club tasks - show all available details
                            <div className="text-sm text-white/80 space-y-1 mt-2">
                              {request.email && (
                                <div><strong>📧 Email:</strong> {request.email}</div>
                              )}
                              <div><strong>📞 Phone:</strong> {request.phone}</div>
                              <div><strong>💬 Message:</strong> {request.text}</div>
                              {request.brand && request.brand !== "Unknown" && (
                                <div><strong>🏷️ Brand:</strong> {request.brand}</div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="text-2xl">{getStatusEmoji(request.status)}</div>
                      </div>
                      
                      <div className="mb-3">
                        <div className="text-sm text-white/60 mb-1">Agent Request</div>
                        <div className="text-white bg-red-800/30 p-3 rounded border border-red-700">
                          <div className="text-sm text-red-300 mb-1">
                            {request.agentName} ({request.agentEmail})
                          </div>
                          {request.assistanceNotes}
                        </div>
                      </div>
                      
                      <div>
                        <div className="text-sm text-white/60 mb-1">Your Response</div>
                        <div className="text-white bg-green-800/30 p-3 rounded border border-green-700">
                          {request.managerResponse}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}