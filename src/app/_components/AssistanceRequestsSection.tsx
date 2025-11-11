"use client";

import { useState, useEffect } from "react";
import { Card } from "@/app/_components/Card";

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-2xl font-semibold mb-4">{children}</h2>
);

const SmallButton = ({ 
  children, 
  onClick, 
  disabled, 
  className = "" 
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  disabled?: boolean;
  className?: string;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`px-3 py-1.5 text-sm rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
  >
    {children}
  </button>
);

const Badge = ({ 
  children, 
  tone 
}: { 
  children: React.ReactNode; 
  tone: "danger" | "success" | "muted";
}) => {
  const toneClasses = {
    danger: "bg-red-900/30 text-red-300 border-red-700",
    success: "bg-green-900/30 text-green-300 border-green-700",
    muted: "bg-neutral-800 text-neutral-400 border-neutral-600"
  };
  
  return (
    <span className={`px-2 py-1 text-xs rounded-md border ${toneClasses[tone]}`}>
      {children}
    </span>
  );
};

interface AssistanceRequest {
  id: string;
  brand: string;
  phone: string;
  text: string;
  agentName: string;
  agentEmail: string;
  assistanceNotes: string;
  managerResponse?: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  taskType?: string;
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

interface AssistanceRequestsSectionProps {
  requests: AssistanceRequest[];
  onRequestsChange: (requests: AssistanceRequest[]) => void;
  title?: string;
}

export function AssistanceRequestsSection({ 
  requests, 
  onRequestsChange,
  title = "🆘 Assistance Requests"
}: AssistanceRequestsSectionProps) {
  const [loading, setLoading] = useState(true);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setLoading(false);
  }, [requests]);

  async function handleResponse(requestId: string) {
    if (!responseText.trim()) return;
    
    setBusy(`responding:${requestId}`);
    try {
      const res = await fetch(`/api/manager/tasks/${requestId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: responseText.trim() }),
      });
      
      if (res.ok) {
        // Update the requests list by removing the responded request
        const updatedRequests = requests.filter(req => req.id !== requestId);
        onRequestsChange(updatedRequests);
        setResponseText("");
        setRespondingTo(null);
      } else {
        alert("Failed to send response");
      }
    } catch (error) {
      console.error("Failed to send response:", error);
      alert("Failed to send response");
    } finally {
      setBusy(null);
    }
  }

  function getStatusEmoji(status: string) {
    switch (status) {
      case "ASSISTANCE_REQUIRED": return "🆘";
      case "IN_PROGRESS": return "▶️";
      default: return "❓";
    }
  }

  function getStatusTone(status: string): "danger" | "success" | "muted" {
    switch (status) {
      case "ASSISTANCE_REQUIRED": return "danger";
      case "IN_PROGRESS": return "success";
      default: return "muted";
    }
  }

  if (loading) {
    return (
      <Card>
        <H2>{title}</H2>
        <div className="text-center py-8 text-neutral-400">Loading...</div>
      </Card>
    );
  }

  const pendingRequests = requests.filter(r => r.status === "ASSISTANCE_REQUIRED");
  const respondedRequests = requests.filter(r => r.status === "IN_PROGRESS" && r.managerResponse);

  return (
    <Card>
      <H2>{title}</H2>
      
      {pendingRequests.length === 0 && respondedRequests.length === 0 && (
        <div className="text-center py-8 text-neutral-400">
          No assistance requests at this time
        </div>
      )}

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <div className="space-y-4 mb-6">
          <h3 className="text-lg font-semibold text-white">Pending ({pendingRequests.length})</h3>
          {pendingRequests.map((request) => (
            <div key={request.id} className="bg-red-900/20 border border-red-800 rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge tone={getStatusTone(request.status)}>
                      {getStatusEmoji(request.status)} {request.status.replace("_", " ")}
                    </Badge>
                    <span className="text-sm text-neutral-400">
                      {new Date(request.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-neutral-400 mb-1">Brand</div>
                      <div className="text-white">{request.brand}</div>
                    </div>
                    <div>
                      <div className="text-sm text-neutral-400 mb-1">Phone</div>
                      <div className="text-white">{request.phone || "Unknown"}</div>
                    </div>
                  </div>
                  
                  {/* Task-specific content */}
                  {request.taskType === "HOLDS" ? (
                    <div className="mt-3 text-sm text-white space-y-1">
                      <div><strong>📄 Order Number:</strong> {request.holdsOrderNumber || "N/A"}</div>
                      <div><strong>✉️ Email:</strong> {request.holdsCustomerEmail || "N/A"}</div>
                      <div><strong>📅 Order Date:</strong> {request.holdsOrderDate ? new Date(request.holdsOrderDate).toLocaleDateString() : "N/A"}</div>
                      <div><strong>🏷️ Queue:</strong> {request.holdsStatus || "N/A"}</div>
                      <div><strong>⭐ Priority:</strong> {request.holdsPriority || "N/A"}</div>
                      <div><strong>📆 Days in System:</strong> {request.holdsDaysInSystem || "N/A"}</div>
                    </div>
                  ) : request.taskType === "YOTPO" ? (
                    <div className="mt-3 text-sm text-white space-y-2">
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
                        <div className="mt-1 bg-neutral-800 p-3 rounded whitespace-pre-wrap text-white">
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
                    <div className="mt-3">
                      <div className="text-sm text-neutral-400 mb-1">Message</div>
                      <div className="text-white bg-neutral-800 p-3 rounded">{request.text}</div>
                    </div>
                  )}
                  
                  <div className="mt-3">
                    <div className="text-sm text-neutral-400 mb-1">Agent Request</div>
                    <div className="text-white bg-red-800/30 p-3 rounded border border-red-700">
                      <div className="text-sm text-red-300 mb-1">
                        {request.agentName} ({request.agentEmail})
                      </div>
                      {request.assistanceNotes}
                    </div>
                  </div>
                </div>
              </div>
              
              {respondingTo === request.id ? (
                <div className="mt-4 space-y-3">
                  <textarea
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    placeholder="Type your response to the agent..."
                    className="w-full h-24 rounded-md bg-neutral-800 text-white placeholder-neutral-400 px-3 py-2 ring-1 ring-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex gap-2">
                    <SmallButton
                      onClick={() => handleResponse(request.id)}
                      disabled={busy === `responding:${request.id}`}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {busy === `responding:${request.id}` ? "Sending..." : "Send Response"}
                    </SmallButton>
                    <SmallButton
                      onClick={() => {
                        setRespondingTo(null);
                        setResponseText("");
                      }}
                      className="bg-neutral-600 hover:bg-neutral-700"
                    >
                      Cancel
                    </SmallButton>
                  </div>
                </div>
              ) : (
                <SmallButton
                  onClick={() => setRespondingTo(request.id)}
                  className="mt-3 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Respond to Agent
                </SmallButton>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Responded Requests */}
      {respondedRequests.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Responded ({respondedRequests.length})</h3>
          {respondedRequests.map((request) => (
            <div key={request.id} className="bg-green-900/20 border border-green-800 rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge tone={getStatusTone(request.status)}>
                      {getStatusEmoji(request.status)} {request.status.replace("_", " ")}
                    </Badge>
                    <span className="text-sm text-neutral-400">
                      {new Date(request.updatedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-neutral-400 mb-1">Brand</div>
                      <div className="text-white">{request.brand}</div>
                    </div>
                    <div>
                      <div className="text-sm text-neutral-400 mb-1">Phone</div>
                      <div className="text-white">{request.phone || "Unknown"}</div>
                    </div>
                  </div>
                  
                  {/* Task-specific content for responded requests */}
                  {request.taskType === "HOLDS" ? (
                    <div className="mt-3 text-sm text-white space-y-1">
                      <div><strong>📄 Order Number:</strong> {request.holdsOrderNumber || "N/A"}</div>
                      <div><strong>✉️ Email:</strong> {request.holdsCustomerEmail || "N/A"}</div>
                      <div><strong>🏷️ Queue:</strong> {request.holdsStatus || "N/A"}</div>
                      <div><strong>⭐ Priority:</strong> {request.holdsPriority || "N/A"}</div>
                    </div>
                  ) : request.taskType === "YOTPO" ? (
                    <div className="mt-3 text-sm text-white space-y-2">
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
                        <div className="mt-1 bg-neutral-800 p-3 rounded whitespace-pre-wrap text-white">
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
                    <div className="mt-3">
                      <div className="text-sm text-neutral-400 mb-1">Message</div>
                      <div className="text-white bg-neutral-800 p-3 rounded">{request.text}</div>
                    </div>
                  )}
                  
                  <div className="mt-3">
                    <div className="text-sm text-neutral-400 mb-1">Agent Request</div>
                    <div className="text-white bg-neutral-700 p-3 rounded">
                      {request.assistanceNotes}
                    </div>
                  </div>
                  {request.managerResponse && (
                    <div className="mt-3">
                      <div className="text-sm text-neutral-400 mb-1">Your Response</div>
                      <div className="text-white bg-green-800/30 p-3 rounded border border-green-700">
                        {request.managerResponse}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

