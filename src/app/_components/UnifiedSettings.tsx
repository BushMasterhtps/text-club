"use client";

import React, { useState, useEffect } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import TrelloImportSection from "@/app/_components/TrelloImportSection";
import KnowledgeBaseSection from "@/app/_components/KnowledgeBaseSection";
// Badge component
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

// Types
type Agent = {
  id: string;
  email: string;
  name: string;
  openCount: number;
  isLive?: boolean;
  lastSeen?: string | null;
  role?: "MANAGER" | "AGENT" | "MANAGER_AGENT";
};

type BlockedPhone = {
  id: string;
  phone: string;
  brand?: string | null;
  reason?: string | null;
  blockedAt: string;
  blockedBy?: string | null;
};

type SpamRule = {
  id: string;
  phrase: string;
  brand?: string | null;
  createdAt: string;
};

// Utility function
function fmtDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString();
}

// Primary button component
function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={`px-3 py-1.5 rounded-md text-sm font-semibold bg-gradient-to-r from-sky-500/90 to-indigo-500/90 hover:from-sky-500 hover:to-indigo-500 text-white ring-1 ring-sky-400/40 disabled:opacity-50 ${className}`}
    />
  );
}

// Users & Access Management Section
function UsersAdminSection() {
  const [rows, setRows] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // create form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"AGENT" | "MANAGER" | "MANAGER_AGENT">("AGENT");
  const [tempPw, setTempPw] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/manager/users", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data?.users)) setRows(data.users as Agent[]);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy("create");
    try {
      const res = await fetch("/api/manager/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || null, email: email.trim(), role, tempPassword: tempPw || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) { alert(data?.error || "Create failed"); return; }
      setName(""); setEmail(""); setTempPw(""); setRole("AGENT");
      await load();
    } finally { setBusy(null); }
  }

  async function setRoleFor(id: string, next: "AGENT" | "MANAGER" | "MANAGER_AGENT") {
    setBusy(`role:${id}`);
    try {
      const res = await fetch("/api/manager/users/role", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, role: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) alert(data?.error || "Failed to update role");
      else setRows((prev) => prev.map((r) => (r.id === id ? { ...r, role: next } : r)));
    } finally { setBusy(null); }
  }

  async function toggleLive(id: string, next: boolean) {
    setBusy(`live:${id}`);
    try {
      const res = await fetch("/api/manager/users/live", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isLive: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) alert(data?.error || "Failed to toggle status");
      else setRows((prev) => prev.map((r) => (r.id === id ? { ...r, isLive: next } : r)));
    } finally { setBusy(null); }
  }

  async function resetPassword(id: string) {
    const pw = prompt("Enter a temporary password for this user (they should change it on first login):");
    if (!pw) return;
    setBusy(`pw:${id}`);
    try {
      const res = await fetch("/api/manager/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, tempPassword: pw }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        alert(data?.error || "Failed to reset password");
      } else {
        alert(data?.message || "Password reset successfully");
      }
    } finally { setBusy(null); }
  }

  async function removeAccess(id: string) {
    if (!confirm("Are you sure you want to remove access for this user?")) return;
    setBusy(`remove:${id}`);
    try {
      const res = await fetch("/api/manager/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        alert(data?.error || "Failed to remove access");
      } else {
        alert(data?.message || "Access removed successfully");
        await load(); // Refresh the list
      }
    } finally { setBusy(null); }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">👥 Users & Access (Admin)</h2>
        <SmallButton onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</SmallButton>
      </div>

      {/* Create */}
      <form onSubmit={createUser} className="grid grid-cols-1 md:grid-cols-5 gap-2">
        <input
          placeholder="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md bg-white/10 text-white placeholder-white/40 px-3 py-2 ring-1 ring-white/10 focus:outline-none"
        />
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          type="email"
          className="rounded-md bg-white/10 text-white placeholder-white/40 px-3 py-2 ring-1 ring-white/10 focus:outline-none"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as any)}
          className="rounded-md bg-white/10 text-white px-3 py-2 ring-1 ring-white/10"
        >
          <option value="AGENT">Agent</option>
          <option value="MANAGER">Manager</option>
          <option value="MANAGER_AGENT">Manager + Agent</option>
        </select>
        <input
          placeholder="Temp password (optional)"
          value={tempPw}
          onChange={(e) => setTempPw(e.target.value)}
          className="rounded-md bg-white/10 text-white placeholder-white/40 px-3 py-2 ring-1 ring-white/10 focus:outline-none"
        />
        <PrimaryButton disabled={busy === "create"}>{busy === "create" ? "Creating…" : "Create User"}</PrimaryButton>
      </form>

      {/* List */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm rounded-xl overflow-hidden">
          <thead className="bg-white/[0.04]">
            <tr className="text-left text-white/60">
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Live/Pause</th>
              <th className="px-3 py-2">Last seen</th>
              <th className="px-3 py-2 w-56">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 && (
              <tr><td className="px-3 py-3 text-white/60" colSpan={6}>{loading ? "Loading…" : "No users yet."}</td></tr>
            )}
            {rows.map((u) => (
              <tr key={u.id} className="text-white/90">
                <td className="px-3 py-2">{u.name || u.email}</td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">
                  <select
                    value={u.role || "AGENT"}
                    onChange={(e) => setRoleFor(u.id, e.target.value as any)}
                    className="rounded-md bg-white/10 text-white px-2 py-1 ring-1 ring-white/10 text-xs"
                    disabled={busy?.startsWith("role:")}
                  >
                    <option value="AGENT">Agent</option>
                    <option value="MANAGER">Manager</option>
                    <option value="MANAGER_AGENT">Manager + Agent</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <label className="text-xs flex items-center gap-2 text-white/80">
                    <input
                      type="checkbox"
                      className="accent-emerald-500"
                      checked={!!u.isLive}
                      onChange={(e) => toggleLive(u.id, e.target.checked)}
                      disabled={busy?.startsWith("live:")}
                    />
                    {u.isLive ? "Live" : "Paused"}
                  </label>
                </td>
                <td className="px-3 py-2">{fmtDate(u.lastSeen || null)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <SmallButton onClick={() => resetPassword(u.id)} disabled={busy?.startsWith("pw:")}>
                      Reset password
                    </SmallButton>
                    <SmallButton 
                      onClick={() => removeAccess(u.id)} 
                      disabled={busy?.startsWith("remove:")}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      Remove Access
                    </SmallButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// Blocked Phone Numbers Section
function BlockedPhonesSection() {
  const [rows, setRows] = useState<BlockedPhone[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // Add form
  const [phone, setPhone] = useState("");
  const [brand, setBrand] = useState("");
  const [reason, setReason] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/blocked-phones", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data?.blockedPhones)) setRows(data.blockedPhones as BlockedPhone[]);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function addBlockedPhone(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setBusy("add");
    try {
      const res = await fetch("/api/blocked-phones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          phone: phone.trim(), 
          brand: brand.trim() || null, 
          reason: reason.trim() || null 
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) { 
        alert(data?.error || "Failed to block phone"); 
        return; 
      }
      setPhone(""); setBrand(""); setReason("");
      await load();
    } finally { setBusy(null); }
  }

  async function unblockPhone(id: string) {
    if (!confirm("Are you sure you want to unblock this phone number?")) return;
    setBusy(`unblock:${id}`);
    try {
      const res = await fetch(`/api/blocked-phones/${id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        alert(data?.error || "Failed to unblock phone");
      } else {
        alert(data?.message || "Phone unblocked successfully");
        await load();
      }
    } finally { setBusy(null); }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">🚫 Blocked Phone Numbers</h2>
        <SmallButton onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</SmallButton>
      </div>

      {/* Add Form */}
      <form onSubmit={addBlockedPhone} className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <input
          placeholder="Phone number (e.g., +1234567890)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          className="rounded-md bg-white/10 text-white placeholder-white/40 px-3 py-2 ring-1 ring-white/10 focus:outline-none"
        />
        <input
          placeholder="Brand (optional)"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className="rounded-md bg-white/10 text-white placeholder-white/40 px-3 py-2 ring-1 ring-white/10 focus:outline-none"
        />
        <input
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-md bg-white/10 text-white placeholder-white/40 px-3 py-2 ring-1 ring-white/10 focus:outline-none"
        />
        <PrimaryButton disabled={busy === "add"}>{busy === "add" ? "Blocking…" : "Block Phone"}</PrimaryButton>
      </form>

      {/* List */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm rounded-xl overflow-hidden">
          <thead className="bg-white/[0.04]">
            <tr className="text-left text-white/60">
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Brand</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2">Blocked At</th>
              <th className="px-3 py-2 w-32">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 && (
              <tr><td className="px-3 py-3 text-white/60" colSpan={5}>{loading ? "Loading…" : "No blocked phone numbers."}</td></tr>
            )}
            {rows.map((bp) => (
              <tr key={bp.id} className="text-white/90">
                <td className="px-3 py-2">{bp.phone}</td>
                <td className="px-3 py-2">{bp.brand || "—"}</td>
                <td className="px-3 py-2">{bp.reason || "—"}</td>
                <td className="px-3 py-2">{fmtDate(bp.blockedAt)}</td>
                <td className="px-3 py-2">
                  <SmallButton 
                    onClick={() => unblockPhone(bp.id)} 
                    disabled={busy?.startsWith("unblock:")}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Unblock
                  </SmallButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// Spam Rules Section
function SpamRulesSection() {
  const [rows, setRows] = useState<SpamRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // Add form
  const [phrase, setPhrase] = useState("");
  const [brand, setBrand] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/spam", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data?.rules)) setRows(data.rules as SpamRule[]);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function addSpamRule(e: React.FormEvent) {
    e.preventDefault();
    if (!phrase.trim()) return;
    setBusy("add");
    try {
      const res = await fetch("/api/spam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          phrase: phrase.trim(), 
          brand: brand.trim() || null
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) { 
        alert(data?.error || "Failed to add spam rule"); 
        return; 
      }
      setPhrase(""); setBrand("");
      await load();
    } finally { setBusy(null); }
  }

  async function deleteSpamRule(id: string) {
    if (!confirm("Are you sure you want to delete this spam rule?")) return;
    setBusy(`delete:${id}`);
    try {
      const res = await fetch(`/api/spam/${id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        alert(data?.error || "Failed to delete spam rule");
      } else {
        alert(data?.message || "Spam rule deleted successfully");
        await load();
      }
    } finally { setBusy(null); }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">🛡️ Spam Rules</h2>
        <div className="flex items-center gap-2">
          <Badge tone="muted">{rows.length} total</Badge>
          <SmallButton onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</SmallButton>
        </div>
      </div>

      {/* Add Form */}
      <form onSubmit={addSpamRule} className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input
          placeholder="Add a new phrase... (e.g., 'unsubscribe')"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          required
          className="rounded-md bg-white/10 text-white placeholder-white/40 px-3 py-2 ring-1 ring-white/10 focus:outline-none"
        />
        <input
          placeholder="Brand (optional)"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className="rounded-md bg-white/10 text-white placeholder-white/40 px-3 py-2 ring-1 ring-white/10 focus:outline-none"
        />
        <PrimaryButton disabled={busy === "add"}>{busy === "add" ? "Adding…" : "Add Rule"}</PrimaryButton>
      </form>

      {/* List */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm rounded-xl overflow-hidden">
          <thead className="bg-white/[0.04]">
            <tr className="text-left text-white/60">
              <th className="px-3 py-2">Phrase</th>
              <th className="px-3 py-2">Brand</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2 w-32">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 && (
              <tr><td className="px-3 py-3 text-white/60" colSpan={4}>{loading ? "Loading…" : "No spam rules yet."}</td></tr>
            )}
            {rows.map((rule) => (
              <tr key={rule.id} className="text-white/90">
                <td className="px-3 py-2">{rule.phrase}</td>
                <td className="px-3 py-2">{rule.brand || "All brands"}</td>
                <td className="px-3 py-2">{fmtDate(rule.createdAt)}</td>
                <td className="px-3 py-2">
                  <SmallButton 
                    onClick={() => deleteSpamRule(rule.id)} 
                    disabled={busy?.startsWith("delete:")}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Delete
                  </SmallButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// Bulk Import Spam Phrases Section
function BulkImportSection() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch("/api/spam/import", {
        method: "POST",
        body: formData,
      });
      
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        alert(data?.error || "Failed to import spam phrases");
      } else {
        alert(data?.message || `Successfully imported ${data.imported || 0} spam phrases`);
        setFile(null);
        // Reset file input
        const fileInput = document.getElementById('spam-import-file') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      }
    } finally { setLoading(false); }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">📥 Bulk Import Spam Phrases</h2>
      </div>

      <form onSubmit={handleImport} className="space-y-4">
        <div className="flex items-center gap-4">
          <input
            id="spam-import-file"
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-white/60 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
          />
          <PrimaryButton disabled={!file || loading}>
            {loading ? "Importing…" : "Import Phrases"}
          </PrimaryButton>
        </div>
        <p className="text-xs text-white/50">
          Upload a CSV file with spam phrases. The file should have a "phrase" column and optionally a "brand" column.
        </p>
      </form>
    </Card>
  );
}

// Trello Import Section Wrapper
function TrelloImportSectionWrapper() {
  return (
    <Card className="p-5">
      <TrelloImportSection />
    </Card>
  );
}

// Agent Specializations Section
function AgentSpecializationsSection() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const loadAgents = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/manager/agents', { cache: 'no-store' });
      const data = await res.json();
      if (data.success && data.agents) {
        setAgents(data.agents);
      }
    } catch (error) {
      console.error('Error loading agents:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const toggleAgentType = async (agentId: string, agentType: string, currentTypes: string[]) => {
    console.log('Toggle agent type:', { agentId, agentType, currentTypes });
    setBusy(`${agentId}-${agentType}`);
    try {
      const newTypes = currentTypes.includes(agentType)
        ? currentTypes.filter(t => t !== agentType)
        : [...currentTypes, agentType];

      console.log('New types will be:', newTypes);

      // Optimistically update UI immediately
      setAgents(prev => prev.map(a => 
        a.id === agentId ? { ...a, agentTypes: newTypes } : a
      ));

      const res = await fetch('/api/manager/agents/update-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, agentTypes: newTypes })
      });

      console.log('API response status:', res.status);
      const data = await res.json();
      console.log('API response data:', data);
      
      if (data.success) {
        // Reload to confirm from server
        await loadAgents();
        console.log('✅ Agent types updated successfully');
      } else {
        // Revert optimistic update on error
        await loadAgents();
        console.error('API error:', data.error);
        alert(data.error || 'Failed to update agent types');
      }
    } catch (error) {
      // Revert optimistic update on error
      await loadAgents();
      console.error('Error updating agent types:', error);
      alert('Failed to update agent types: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">🎯 Agent Specializations</h2>
          <p className="text-sm text-white/60 mt-1">
            Assign agents to specific task types. Holds agents appear in Holds dashboard, Customer Account agents handle all other tasks.
          </p>
        </div>
        <SmallButton onClick={loadAgents} disabled={loading}>
          {loading ? "Loading..." : "🔄 Refresh"}
        </SmallButton>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/5">
            <tr className="text-left text-white/60">
              <th className="px-3 py-2">Agent Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2 text-center">🚧 Holds</th>
              <th className="px-3 py-2 text-center">💬 Text Club</th>
              <th className="px-3 py-2 text-center">📦 WOD/IVCS</th>
              <th className="px-3 py-2 text-center">📧 Email Requests</th>
              <th className="px-3 py-2 text-center">⭐ Yotpo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading && (
              <tr>
                <td colSpan={7} className="px-3 py-3 text-center text-white/60">
                  Loading agents...
                </td>
              </tr>
            )}
            {!loading && agents.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-3 text-center text-white/60">
                  No agents found
                </td>
              </tr>
            )}
            {agents.map((agent) => {
              const agentTypes = agent.agentTypes || [];
              return (
                <tr key={agent.id} className="hover:bg-white/5">
                  <td className="px-3 py-2 text-white">{agent.name || 'N/A'}</td>
                  <td className="px-3 py-2 text-white/70">{agent.email}</td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={agentTypes.includes('HOLDS')}
                      onChange={() => toggleAgentType(agent.id, 'HOLDS', agentTypes)}
                      disabled={busy === `${agent.id}-HOLDS`}
                      className="w-4 h-4 rounded accent-orange-500"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={agentTypes.includes('TEXT_CLUB')}
                      onChange={() => toggleAgentType(agent.id, 'TEXT_CLUB', agentTypes)}
                      disabled={busy === `${agent.id}-TEXT_CLUB`}
                      className="w-4 h-4 rounded accent-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={agentTypes.includes('WOD_IVCS')}
                      onChange={() => toggleAgentType(agent.id, 'WOD_IVCS', agentTypes)}
                      disabled={busy === `${agent.id}-WOD_IVCS`}
                      className="w-4 h-4 rounded accent-red-500"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={agentTypes.includes('EMAIL_REQUESTS')}
                      onChange={() => toggleAgentType(agent.id, 'EMAIL_REQUESTS', agentTypes)}
                      disabled={busy === `${agent.id}-EMAIL_REQUESTS`}
                      className="w-4 h-4 rounded accent-green-500"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={agentTypes.includes('YOTPO')}
                      onChange={() => toggleAgentType(agent.id, 'YOTPO', agentTypes)}
                      disabled={busy === `${agent.id}-YOTPO`}
                      className="w-4 h-4 rounded accent-yellow-500"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
        <p className="text-sm text-blue-200">
          💡 <strong>Tip:</strong> Holds agents appear only in Holds dashboard. Customer Account agents (Text Club, WOD/IVCS, Email Requests, Yotpo) appear in Text Club dashboard.
        </p>
      </div>
    </Card>
  );
}

// Main Unified Settings Component
export default function UnifiedSettings() {
  const [activeTab, setActiveTab] = useState<"users" | "blocked" | "spam" | "import" | "trello" | "specializations" | "knowledge">("users");

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-white/5 rounded-lg p-1">
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "users"
              ? "bg-white/10 text-white"
              : "text-white/60 hover:text-white/80"
          }`}
        >
          👥 Users & Access
        </button>
        <button
          onClick={() => setActiveTab("blocked")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "blocked"
              ? "bg-white/10 text-white"
              : "text-white/60 hover:text-white/80"
          }`}
        >
          🚫 Blocked Phones
        </button>
        <button
          onClick={() => setActiveTab("spam")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "spam"
              ? "bg-white/10 text-white"
              : "text-white/60 hover:text-white/80"
          }`}
        >
          🛡️ Spam Rules
        </button>
        <button
          onClick={() => setActiveTab("import")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "import"
              ? "bg-white/10 text-white"
              : "text-white/60 hover:text-white/80"
          }`}
        >
          📥 Bulk Import
        </button>
        <button
          onClick={() => setActiveTab("trello")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "trello"
              ? "bg-white/10 text-white"
              : "text-white/60 hover:text-white/80"
          }`}
        >
          📊 Trello Imports
        </button>
        <button
          onClick={() => setActiveTab("specializations")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "specializations"
              ? "bg-white/10 text-white"
              : "text-white/60 hover:text-white/80"
          }`}
        >
          🎯 Agent Specializations
        </button>
        <button
          onClick={() => setActiveTab("knowledge")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "knowledge"
              ? "bg-white/10 text-white"
              : "text-white/60 hover:text-white/80"
          }`}
        >
          📚 Knowledge Base
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "users" && <UsersAdminSection />}
      {activeTab === "blocked" && <BlockedPhonesSection />}
      {activeTab === "spam" && <SpamRulesSection />}
      {activeTab === "import" && <BulkImportSection />}
      {activeTab === "trello" && <TrelloImportSectionWrapper />}
      {activeTab === "specializations" && <AgentSpecializationsSection />}
      {activeTab === "knowledge" && <KnowledgeBaseSection />}
    </div>
  );
}
