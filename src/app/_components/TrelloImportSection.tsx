'use client';

import { useState, useEffect } from 'react';

interface Agent {
  id: string;
  name: string | null;
  email: string;
}

interface TrelloEntry {
  id: string;
  date: string;
  agentId: string;
  agentName: string;
  agentEmail: string;
  cardsCount: number;
  createdAt: string;
  createdBy: string | null;
}

export default function TrelloImportSection() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [entries, setEntries] = useState<TrelloEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Single entry form
  const [selectedDate, setSelectedDate] = useState(() => {
    // Default to yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  });
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [cardsCount, setCardsCount] = useState('');

  // Batch entry
  const [batchDate, setBatchDate] = useState(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  });
  const [batchEntries, setBatchEntries] = useState<Record<string, string>>({});

  // Load agents
  useEffect(() => {
    loadAgents();
    loadEntries();
  }, []);

  const loadAgents = async () => {
    try {
      const res = await fetch('/api/manager/agents');
      const data = await res.json();
      if (data.success && data.agents) {
        setAgents(data.agents);
      }
    } catch (error) {
      console.error('Error loading agents:', error);
    }
  };

  const loadEntries = async () => {
    try {
      const res = await fetch('/api/manager/trello-import');
      const data = await res.json();
      if (data.success) {
        setEntries(data.entries);
      }
    } catch (error) {
      console.error('Error loading entries:', error);
    }
  };

  const addEntry = async () => {
    if (!selectedDate || !selectedAgentId || !cardsCount) {
      setMessage('Please fill in all fields');
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/manager/trello-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          agentId: selectedAgentId,
          cardsCount: parseInt(cardsCount),
          createdBy: localStorage.getItem('agentEmail') || 'Unknown'
        })
      });

      const data = await res.json();
      
      if (data.success) {
        setMessage(`✓ ${data.message}`);
        setCardsCount('');
        setSelectedAgentId('');
        loadEntries();
      } else {
        setMessage(`✗ ${data.error}`);
      }
    } catch (error) {
      setMessage('✗ Failed to add entry');
    } finally {
      setLoading(false);
    }
  };

  const deleteEntry = async (id: string) => {
    if (!confirm('Delete this entry?')) return;

    try {
      const res = await fetch(`/api/manager/trello-import?id=${id}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      
      if (data.success) {
        setMessage('✓ Entry deleted');
        loadEntries();
      } else {
        setMessage(`✗ ${data.error}`);
      }
    } catch (error) {
      setMessage('✗ Failed to delete entry');
    }
  };

  const addBatchEntries = async () => {
    const entriesToAdd = Object.entries(batchEntries)
      .filter(([_, count]) => count && parseInt(count) > 0)
      .map(([agentId, count]) => ({
        date: batchDate,
        agentId,
        cardsCount: parseInt(count),
        createdBy: localStorage.getItem('agentEmail') || 'Unknown'
      }));

    if (entriesToAdd.length === 0) {
      setMessage('Please enter at least one card count');
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const results = await Promise.all(
        entriesToAdd.map(entry =>
          fetch('/api/manager/trello-import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry)
          })
        )
      );

      const successCount = results.filter(r => r.ok).length;
      setMessage(`✓ Added ${successCount} entries for ${new Date(batchDate).toLocaleDateString()}`);
      setBatchEntries({});
      loadEntries();
    } catch (error) {
      setMessage('✗ Failed to add batch entries');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-white/90 mb-2">📊 Trello Imports</h3>
        <p className="text-sm text-white/60">
          Manually add Trello card completions from Power BI reports. These will be included in Performance Scorecard rankings.
        </p>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${
          message.startsWith('✓') ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
        }`}>
          {message}
        </div>
      )}

      {/* Single Entry Form */}
      <div className="bg-white/5 rounded-lg p-4 border border-white/10">
        <h4 className="font-semibold text-white mb-3">➕ Add Single Entry</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm text-white/60 mb-1 block">📅 Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full rounded-md bg-white/10 text-white px-3 py-2 ring-1 ring-white/10 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-sm text-white/60 mb-1 block">👤 Agent</label>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full rounded-md bg-white/10 text-white px-3 py-2 ring-1 ring-white/10 focus:outline-none"
            >
              <option value="">Select Agent...</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name || a.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-white/60 mb-1 block">📊 Trello Cards</label>
            <input
              type="number"
              min="0"
              value={cardsCount}
              onChange={(e) => setCardsCount(e.target.value)}
              placeholder="0"
              className="w-full rounded-md bg-white/10 text-white px-3 py-2 ring-1 ring-white/10 focus:outline-none"
            />
          </div>
        </div>
        <button
          onClick={addEntry}
          disabled={loading || !selectedDate || !selectedAgentId || !cardsCount}
          className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-white text-sm font-medium"
        >
          {loading ? 'Adding...' : '+ Add Entry'}
        </button>
      </div>

      {/* Batch Entry Form */}
      <div className="bg-white/5 rounded-lg p-4 border border-white/10">
        <h4 className="font-semibold text-white mb-3">📋 Batch Entry (All Agents, One Date)</h4>
        <div className="mb-4">
          <label className="text-sm text-white/60 mb-1 block">📅 Date for All Entries</label>
          <input
            type="date"
            value={batchDate}
            onChange={(e) => setBatchDate(e.target.value)}
            className="w-full max-w-xs rounded-md bg-white/10 text-white px-3 py-2 ring-1 ring-white/10 focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-96 overflow-y-auto">
          {agents.map(agent => (
            <div key={agent.id} className="bg-white/5 rounded p-2">
              <div className="text-xs text-white/60 mb-1">{agent.name || agent.email}</div>
              <input
                type="number"
                min="0"
                value={batchEntries[agent.id] || ''}
                onChange={(e) => setBatchEntries(prev => ({
                  ...prev,
                  [agent.id]: e.target.value
                }))}
                placeholder="0 cards"
                className="w-full rounded bg-white/10 text-white px-2 py-1 text-sm ring-1 ring-white/10 focus:outline-none"
              />
            </div>
          ))}
        </div>
        <button
          onClick={addBatchEntries}
          disabled={loading || Object.keys(batchEntries).length === 0}
          className="mt-3 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-white text-sm font-medium"
        >
          {loading ? 'Importing...' : `Import All for ${new Date(batchDate).toLocaleDateString()}`}
        </button>
      </div>

      {/* Recent Entries Table */}
      <div className="bg-white/5 rounded-lg p-4 border border-white/10">
        <h4 className="font-semibold text-white mb-3">📋 Recent Entries (Last 30 Days)</h4>
        {entries.length === 0 ? (
          <div className="text-center py-8 text-white/60">
            No Trello entries yet. Add your first entry above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr className="text-left text-white/60">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Agent</th>
                  <th className="px-3 py-2 text-right">Cards</th>
                  <th className="px-3 py-2">Entered By</th>
                  <th className="px-3 py-2">Entered At</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <tr key={entry.id} className="border-t border-white/10 text-white/80">
                    <td className="px-3 py-2">
                      {new Date(entry.date).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2">
                      <div>{entry.agentName}</div>
                      <div className="text-xs text-white/40">{entry.agentEmail}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {entry.cardsCount}
                    </td>
                    <td className="px-3 py-2 text-xs text-white/60">
                      {entry.createdBy || 'Unknown'}
                    </td>
                    <td className="px-3 py-2 text-xs text-white/60">
                      {new Date(entry.createdAt).toLocaleDateString()} {new Date(entry.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => deleteEntry(entry.id)}
                        className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs text-white"
                      >
                        🗑️ Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Helper Info */}
      <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
        <h4 className="font-semibold text-blue-300 mb-2">💡 How to Use</h4>
        <ul className="text-sm text-white/70 space-y-1">
          <li>• <strong>Single Entry:</strong> Add one agent's Trello count for one date</li>
          <li>• <strong>Batch Entry:</strong> Enter all agents' counts for one date at once (faster for daily imports)</li>
          <li>• <strong>Power BI Workflow:</strong> Open your Trello Power BI report → Copy agent card counts → Enter here</li>
          <li>• <strong>Updates:</strong> Entering the same agent + date will update the existing count</li>
          <li>• <strong>Rankings:</strong> Trello cards are added to portal tasks in Performance Scorecard</li>
        </ul>
      </div>
    </div>
  );
}

