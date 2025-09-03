import { useState, useEffect } from "react";
import { Card, H2, Badge, SmallButton } from "../page";

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
}

export function AssistanceRequestsSection() {
  const [requests, setRequests] = useState<AssistanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadRequests, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadRequests() {
    try {
      const res = await fetch("/api/manager/assistance", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch (error) {
      console.error("Failed to load assistance requests:", error);
    } finally {
      setLoading(false);
    }
  }

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
        // Update local state
        setRequests(prev => prev.map(req => 
          req.id === requestId 
            ? { ...req, managerResponse: responseText.trim(), status: "IN_PROGRESS" }
            : req
        ));
        setResponseText("");
        setRespondingTo(null);
        await loadRequests(); // Refresh to get updated data
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

  function getStatusColor(status: string) {
    switch (status) {
      case "ASSISTANCE_REQUIRED": return "bg-red-600";
      case "IN_PROGRESS": return "bg-green-600";
      default: return "bg-gray-600";
    }
  }

  if (loading) {
    return (
      <Card>
        <H2>🆘 Assistance Requests</H2>
        <div className="text-center py-8 text-neutral-400">Loading...</div>
      </Card>
    );
  }

  const pendingRequests = requests.filter(r => r.status === "ASSISTANCE_REQUIRED");
  const respondedRequests = requests.filter(r => r.status === "IN_PROGRESS" && r.managerResponse);

  return (
    <Card>
      <H2>🆘 Assistance Requests</H2>
      
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
                    <Badge className={getStatusColor(request.status)}>
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
                      <div className="text-white">{request.phone}</div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-sm text-neutral-400 mb-1">Message</div>
                    <div className="text-white bg-neutral-800 p-3 rounded">{request.text}</div>
                  </div>
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
                    <Badge className={getStatusColor(request.status)}>
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
                      <div className="text-white">{request.phone}</div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-sm text-neutral-400 mb-1">Message</div>
                    <div className="text-white bg-neutral-800 p-3 rounded">{request.text}</div>
                  </div>
                  <div className="mt-3">
                    <div className="text-sm text-neutral-400 mb-1">Agent Request</div>
                    <div className="text-white bg-red-800/30 p-3 rounded border border-red-700">
                      <div className="text-sm text-red-300 mb-1">
                        {request.agentName} ({request.agentEmail})
                      </div>
                      {request.assistanceNotes}
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-sm text-neutral-400 mb-1">Your Response</div>
                    <div className="text-white bg-green-800/30 p-3 rounded border border-green-700">
                      {request.managerResponse}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
