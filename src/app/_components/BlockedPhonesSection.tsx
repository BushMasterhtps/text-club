import React, { useState, useEffect } from 'react';

interface BlockedPhone {
  id: string;
  phone: string;
  brand: string | null;
  reason: string | null;
  blockedAt: string;
  blockedBy: string | null;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-white/[0.02] ring-1 ring-white/10 backdrop-blur-md ${className}`}>
      {children}
    </section>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold text-white/90 tracking-tight">{children}</h2>
  );
}

function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "success" | "danger" | "muted" | "warning" }) {
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
      className={`px-2.5 py-1 rounded-md text-xs font-medium bg-white/5 hover:bg-white/10 active:bg-white/15 ring-1 ring-white/10 text-white disabled:opacity-50 ${className}`}
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

export default function BlockedPhonesSection() {
  const [blockedPhones, setBlockedPhones] = useState<BlockedPhone[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  // Form state
  const [phone, setPhone] = useState('');
  const [brand, setBrand] = useState('');
  const [reason, setReason] = useState('');

  async function loadBlockedPhones() {
    setLoading(true);
    try {
      const res = await fetch('/api/blocked-phones', { cache: 'no-store' });
      const data = await res.json();
      if (data?.success) {
        setBlockedPhones(data.blockedPhones || []);
      }
    } catch (error) {
      console.error('Error loading blocked phones:', error);
    } finally {
      setLoading(false);
    }
  }

  async function createBlockedPhone(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    
    setCreating(true);
    try {
      const res = await fetch('/api/blocked-phones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          brand: brand.trim() || null,
          reason: reason.trim() || null
        })
      });
      
      const data = await res.json();
      if (data?.success) {
        setPhone('');
        setBrand('');
        setReason('');
        await loadBlockedPhones();
      } else {
        alert(data?.error || 'Failed to block phone number');
      }
    } catch (error) {
      console.error('Error creating blocked phone:', error);
      alert('Failed to block phone number');
    } finally {
      setCreating(false);
    }
  }

  async function unblockPhone(id: string) {
    if (!confirm('Are you sure you want to unblock this phone number?')) return;
    
    setDeletingId(id);
    try {
      const res = await fetch(`/api/blocked-phones/${id}`, {
        method: 'DELETE'
      });
      
      const data = await res.json();
      if (data?.success) {
        await loadBlockedPhones();
      } else {
        alert(data?.error || 'Failed to unblock phone number');
      }
    } catch (error) {
      console.error('Error unblocking phone:', error);
      alert('Failed to unblock phone number');
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    loadBlockedPhones();
  }, []);

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return '—';
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <H2>🚫 Blocked Phone Numbers</H2>
        <div className="flex items-center gap-2 text-white/60">
          {loading ? "Loading…" : `${blockedPhones.length} blocked`}
        </div>
      </div>

      {/* Add New Blocked Phone Form */}
      <form onSubmit={createBlockedPhone} className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone number (e.g., +1234567890)"
          required
          className="rounded-md bg-white/10 text-white placeholder-white/40 px-3 py-2 ring-1 ring-white/10 focus:outline-none"
        />
        <input
          type="text"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder="Brand (optional)"
          className="rounded-md bg-white/10 text-white placeholder-white/40 px-3 py-2 ring-1 ring-white/10 focus:outline-none"
        />
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          className="rounded-md bg-white/10 text-white placeholder-white/40 px-3 py-2 ring-1 ring-white/10 focus:outline-none"
        />
        <PrimaryButton disabled={creating || !phone.trim()}>
          {creating ? "Blocking…" : "Block Phone"}
        </PrimaryButton>
      </form>

      {/* Blocked Phones List */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm rounded-xl overflow-hidden">
          <thead className="bg-white/[0.04]">
            <tr className="text-left text-white/60">
              <th className="px-3 py-2">Phone Number</th>
              <th className="px-3 py-2">Brand</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2">Blocked At</th>
              <th className="px-3 py-2 w-20">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {blockedPhones.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-white/60" colSpan={5}>
                  {loading ? "Loading…" : "No blocked phone numbers."}
                </td>
              </tr>
            )}
            {blockedPhones.map((bp) => (
              <tr key={bp.id} className="text-white/90">
                <td className="px-3 py-2">
                  <Badge tone="danger">{bp.phone}</Badge>
                </td>
                <td className="px-3 py-2">{bp.brand || "—"}</td>
                <td className="px-3 py-2">{bp.reason || "—"}</td>
                <td className="px-3 py-2">{formatDate(bp.blockedAt)}</td>
                <td className="px-3 py-2">
                  <SmallButton
                    onClick={() => unblockPhone(bp.id)}
                    disabled={deletingId === bp.id}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {deletingId === bp.id ? "Unblocking…" : "Unblock"}
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
