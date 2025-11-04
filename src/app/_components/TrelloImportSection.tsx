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
  
  // Bulk date range entry
  const [bulkStartDate, setBulkStartDate] = useState('');
  const [bulkEndDate, setBulkEndDate] = useState('');
  const [bulkEntries, setBulkEntries] = useState<Record<string, string>>({});
  const [dateRangeCount, setDateRangeCount] = useState<number | null>(null);

  // Load agents
  useEffect(() => {
    loadAgents();
    loadEntries();
  }, []);

  // Check how many entries exist for the selected date range
  useEffect(() => {
    if (bulkStartDate && bulkEndDate) {
      checkDateRangeCount(bulkStartDate, bulkEndDate);
    } else {
      setDateRangeCount(null);
    }
  }, [bulkStartDate, bulkEndDate]);

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

  const checkDateRangeCount = async (startDate: string, endDate: string) => {
    if (!startDate || !endDate) {
      setDateRangeCount(null);
      return;
    }
    
    try {
      const res = await fetch(`/api/manager/trello-import?dateStart=${startDate}&dateEnd=${endDate}`);
      const data = await res.json();
      if (data.success && data.entries) {
        setDateRangeCount(data.entries.length);
      }
    } catch (error) {
      console.error('Error checking date range:', error);
      setDateRangeCount(null);
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
      setMessage(`✓ Added ${successCount} entries for ${batchDate}`);
      setBatchEntries({});
      loadEntries();
    } catch (error) {
      setMessage('✗ Failed to add batch entries');
    } finally {
      setLoading(false);
    }
  };

  const addBulkDateRangeEntries = async () => {
    if (!bulkStartDate || !bulkEndDate) {
      setMessage('Please select start and end dates');
      return;
    }

    const entriesToAdd = Object.entries(bulkEntries)
      .filter(([_, count]) => count && parseInt(count) > 0);

    if (entriesToAdd.length === 0) {
      setMessage('Please enter at least one card count');
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      // Generate all dates in range
      const start = new Date(bulkStartDate);
      const end = new Date(bulkEndDate);
      const dates: string[] = [];
      
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split('T')[0]);
      }

      // Create entries for each agent for each date in range
      const allEntries = [];
      for (const dateStr of dates) {
        for (const [agentId, count] of entriesToAdd) {
          allEntries.push({
            date: dateStr,
            agentId,
            cardsCount: parseInt(count),
            createdBy: localStorage.getItem('agentEmail') || 'Unknown'
          });
        }
      }

      // Process in batches to avoid overwhelming the server
      const BATCH_SIZE = 20; // Process 20 at a time
      let successCount = 0;
      let failCount = 0;
      
      for (let i = 0; i < allEntries.length; i += BATCH_SIZE) {
        const batch = allEntries.slice(i, i + BATCH_SIZE);
        const progress = Math.min(i + BATCH_SIZE, allEntries.length);
        
        // Show progress
        setMessage(`⏳ Processing ${progress}/${allEntries.length} entries...`);
        
        const results = await Promise.all(
          batch.map(entry =>
            fetch('/api/manager/trello-import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(entry)
            }).then(r => ({ ok: r.ok, status: r.status }))
            .catch(err => ({ ok: false, status: 0 }))
          )
        );

        successCount += results.filter(r => r.ok).length;
        failCount += results.filter(r => !r.ok).length;
        
        // Small delay between batches to be gentle on the server
        if (i + BATCH_SIZE < allEntries.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      if (failCount === 0) {
        setMessage(`✓ Successfully added ${successCount} entries across ${dates.length} days for ${entriesToAdd.length} agents`);
      } else {
        setMessage(`⚠️ Added ${successCount} entries, ${failCount} failed. Try again for failed entries.`);
      }
      
      setBulkEntries({});
      loadEntries();
      // Refresh the count for the selected date range
      if (bulkStartDate && bulkEndDate) {
        checkDateRangeCount(bulkStartDate, bulkEndDate);
      }
    } catch (error) {
      console.error('Bulk import error:', error);
      setMessage('✗ Failed to add bulk date range entries');
    } finally {
      setLoading(false);
    }
  };

  const deleteAllEntries = async () => {
    if (!confirm('🚨 DELETE ALL TRELLO ENTRIES?\n\nThis will delete EVERY Trello entry in the database (all dates, all agents).\n\n⚠️ THIS CANNOT BE UNDONE!\n\nType "DELETE ALL" in the next prompt to confirm.')) {
      return;
    }

    const confirmText = prompt('Type "DELETE ALL" to confirm deletion of all Trello entries:');
    if (confirmText !== 'DELETE ALL') {
      setMessage('❌ Deletion cancelled - confirmation text did not match');
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      // Fetch ALL entries
      const res = await fetch('/api/manager/trello-import?dateStart=2020-01-01&dateEnd=2030-12-31');
      const data = await res.json();
      
      if (!data.success || !data.entries) {
        setMessage('✗ Failed to fetch entries to delete');
        return;
      }

      const entriesToDelete = data.entries;
      
      if (entriesToDelete.length === 0) {
        setMessage('No entries found to delete');
        return;
      }

      // Delete in batches
      const BATCH_SIZE = 20;
      let deleteCount = 0;
      let failCount = 0;

      for (let i = 0; i < entriesToDelete.length; i += BATCH_SIZE) {
        const batch = entriesToDelete.slice(i, i + BATCH_SIZE);
        const progress = Math.min(i + BATCH_SIZE, entriesToDelete.length);
        
        setMessage(`⏳ Deleting ${progress}/${entriesToDelete.length} entries...`);
        
        const results = await Promise.all(
          batch.map((entry: TrelloEntry) =>
            fetch(`/api/manager/trello-import?id=${entry.id}`, {
              method: 'DELETE'
            }).then(r => ({ ok: r.ok }))
            .catch(err => ({ ok: false }))
          )
        );

        deleteCount += results.filter(r => r.ok).length;
        failCount += results.filter(r => !r.ok).length;
        
        // Small delay between batches
        if (i + BATCH_SIZE < entriesToDelete.length) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      if (failCount === 0) {
        setMessage(`✓ Successfully deleted ALL ${deleteCount} entries`);
      } else {
        setMessage(`⚠️ Deleted ${deleteCount} entries, ${failCount} failed`);
      }
      
      loadEntries();
      if (bulkStartDate && bulkEndDate) {
        checkDateRangeCount(bulkStartDate, bulkEndDate);
      }
    } catch (error) {
      console.error('Delete all error:', error);
      setMessage('✗ Failed to delete entries');
    } finally {
      setLoading(false);
    }
  };

  const bulkDeleteDateRange = async () => {
    if (!bulkStartDate || !bulkEndDate) {
      setMessage('Please select start and end dates');
      return;
    }

    const dateCount = Math.ceil(
      (new Date(bulkEndDate).getTime() - new Date(bulkStartDate).getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

    // Show the actual count from the counter if available
    const countText = dateRangeCount !== null 
      ? `${dateRangeCount} entries` 
      : `~${dateCount * agents.length} entries (${dateCount} days × ${agents.length} agents)`;

    if (!confirm(`⚠️ BULK DELETE: Remove all Trello entries from ${bulkStartDate} to ${bulkEndDate}?\n\nThis will delete ${countText}.\n\n🗑️ This processes in batches and cannot be undone!\n\nClick OK to proceed.`)) {
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      // Fetch all entries in the date range
      const res = await fetch(`/api/manager/trello-import?dateStart=${bulkStartDate}&dateEnd=${bulkEndDate}`);
      const data = await res.json();
      
      if (!data.success || !data.entries) {
        setMessage('✗ Failed to fetch entries to delete');
        return;
      }

      const entriesToDelete = data.entries;
      
      if (entriesToDelete.length === 0) {
        setMessage('No entries found in this date range');
        return;
      }

      // Delete in batches
      const BATCH_SIZE = 20;
      let deleteCount = 0;
      let failCount = 0;

      for (let i = 0; i < entriesToDelete.length; i += BATCH_SIZE) {
        const batch = entriesToDelete.slice(i, i + BATCH_SIZE);
        const progress = Math.min(i + BATCH_SIZE, entriesToDelete.length);
        
        setMessage(`⏳ Deleting ${progress}/${entriesToDelete.length} entries...`);
        
        const results = await Promise.all(
          batch.map((entry: TrelloEntry) =>
            fetch(`/api/manager/trello-import?id=${entry.id}`, {
              method: 'DELETE'
            }).then(r => ({ ok: r.ok }))
            .catch(err => ({ ok: false }))
          )
        );

        deleteCount += results.filter(r => r.ok).length;
        failCount += results.filter(r => !r.ok).length;
        
        // Small delay between batches
        if (i + BATCH_SIZE < entriesToDelete.length) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      if (failCount === 0) {
        setMessage(`✓ Successfully deleted ${deleteCount} entries`);
      } else {
        setMessage(`⚠️ Deleted ${deleteCount} entries, ${failCount} failed`);
      }
      
      loadEntries();
      // Refresh the count for the selected date range
      if (bulkStartDate && bulkEndDate) {
        checkDateRangeCount(bulkStartDate, bulkEndDate);
      }
    } catch (error) {
      console.error('Bulk delete error:', error);
      setMessage('✗ Failed to delete entries');
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
          {loading ? '⏳ Adding...' : '+ Add Entry'}
        </button>
      </div>

      {/* Batch Entry Form - PRIMARY METHOD FOR DAILY IMPORTS */}
      <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-lg p-4 border-2 border-green-500/30">
        <div className="flex items-center gap-2 mb-3">
          <h4 className="font-semibold text-white text-lg">⭐ Daily Batch Entry (Recommended)</h4>
          <span className="px-2 py-0.5 bg-green-500/20 text-green-300 text-xs rounded-full border border-green-500/30">PRIMARY METHOD</span>
        </div>
        <p className="text-sm text-white/70 mb-4">
          📊 Use this daily: Check Power BI for today's counts → Enter all agents at once → Import. Takes ~60 seconds per day.
        </p>
        <div className="mb-4">
          <label className="text-sm text-white/60 mb-1 block font-medium">📅 Date for All Entries</label>
          <input
            type="date"
            value={batchDate}
            onChange={(e) => setBatchDate(e.target.value)}
            className="w-full max-w-xs rounded-md bg-white/10 text-white px-3 py-2 ring-1 ring-white/10 focus:outline-none text-lg"
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
          {loading ? '⏳ Importing...' : `Import All for ${batchDate}`}
        </button>
      </div>

      {/* Recent Entries Table */}
      <div className="bg-white/5 rounded-lg p-4 border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-white">📋 Recent Entries (Last 90 Days)</h4>
          <button
            onClick={deleteAllEntries}
            disabled={loading || entries.length === 0}
            className="px-3 py-1.5 bg-red-700 hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-white text-xs font-medium border border-red-600"
            title="Delete ALL Trello entries (requires confirmation)"
          >
            🚨 Delete All Entries
          </button>
        </div>
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
                      {entry.date}
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

      {/* Bulk Date Range Entry - HIDDEN: Causes data multiplication issues */}
      <div className="bg-red-900/20 rounded-lg p-4 border-2 border-red-500/40">
        <h4 className="font-semibold text-red-300 mb-3">🚫 Bulk Date Range Entry (NOT FOR POWER BI TOTALS)</h4>
        <div className="bg-red-500/20 border border-red-500/40 rounded-md p-3 mb-4 text-sm text-red-200">
          <p className="font-bold mb-2">⚠️ DO NOT USE THIS FOR POWER BI MONTHLY TOTALS!</p>
          <p className="text-xs">
            This feature multiplies your count by the number of days. If you enter "1000 cards" for a 30-day range, it creates 30,000 cards (1000 per day).
            <br/><br/>
            <strong>Use "Daily Batch Entry" above instead.</strong>
          </p>
        </div>
        <details className="text-xs text-white/50">
          <summary className="cursor-pointer hover:text-white/70 mb-2">Advanced: When would this be used?</summary>
          <p className="mt-2 pl-4 border-l-2 border-white/20">
            Only use this if an agent worked the exact same daily average every single day for a month. 
            Example: Agent worked 20 days at exactly 50 cards/day = enter "50" for that date range.
            <br/><br/>
            For backfilling historical data where you only have monthly totals, use Daily Batch Entry with calculated daily averages instead.
          </p>
        </details>
        <hr className="border-white/10 my-4" />
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-sm text-white/60 mb-1 block">📅 Start Date</label>
            <input
              type="date"
              value={bulkStartDate}
              onChange={(e) => setBulkStartDate(e.target.value)}
              className="w-full rounded-md bg-white/10 text-white px-3 py-2 ring-1 ring-white/10 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-sm text-white/60 mb-1 block">📅 End Date</label>
            <input
              type="date"
              value={bulkEndDate}
              onChange={(e) => setBulkEndDate(e.target.value)}
              className="w-full rounded-md bg-white/10 text-white px-3 py-2 ring-1 ring-white/10 focus:outline-none"
            />
          </div>
        </div>
        {dateRangeCount !== null && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${
            dateRangeCount > 0 
              ? 'bg-blue-500/10 border border-blue-500/20 text-blue-300' 
              : 'bg-white/5 border border-white/10 text-white/60'
          }`}>
            {dateRangeCount > 0 ? (
              <>
                📊 <strong>{dateRangeCount} existing entries</strong> found for this date range.
                {dateRangeCount > 100 && ' (This seems high - might be duplicates!)'}
              </>
            ) : (
              '📭 No entries found for this date range.'
            )}
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-96 overflow-y-auto mb-4">
          {agents.map(agent => (
            <div key={agent.id} className="bg-white/5 rounded p-2">
              <div className="text-xs text-white/60 mb-1">{agent.name || agent.email}</div>
              <input
                type="number"
                min="0"
                value={bulkEntries[agent.id] || ''}
                onChange={(e) => setBulkEntries(prev => ({
                  ...prev,
                  [agent.id]: e.target.value
                }))}
                placeholder="0 cards/day"
                className="w-full rounded bg-white/10 text-white px-2 py-1 text-sm ring-1 ring-white/10 focus:outline-none"
              />
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={addBulkDateRangeEntries}
            disabled={loading || !bulkStartDate || !bulkEndDate || Object.keys(bulkEntries).length === 0}
            className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-white text-sm font-medium"
          >
            {loading ? '⏳ Importing... (Do not refresh)' : `Import for ${bulkStartDate && bulkEndDate ? `${bulkStartDate} to ${bulkEndDate}` : 'Date Range'}`}
          </button>
          {bulkStartDate && bulkEndDate && (
            <button
              onClick={bulkDeleteDateRange}
              disabled={loading}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-white text-sm font-medium"
              title={`Bulk delete all entries between ${bulkStartDate} and ${bulkEndDate}`}
            >
              🗑️ Bulk Delete Range {dateRangeCount !== null && dateRangeCount > 0 ? `(${dateRangeCount})` : ''}
            </button>
          )}
        </div>
      </div>

      {/* Helper Info */}
      <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
        <h4 className="font-semibold text-blue-300 mb-2">💡 Daily Workflow (Recommended)</h4>
        <div className="bg-blue-500/5 rounded p-3 mb-3 border border-blue-500/20">
          <p className="text-sm text-blue-200 font-semibold mb-2">📋 End-of-Day Routine (~60 seconds):</p>
          <ol className="text-sm text-white/70 space-y-1 pl-4">
            <li>1. Open Power BI → Filter to today's date</li>
            <li>2. Note each agent's card count for today</li>
            <li>3. Go to "⭐ Daily Batch Entry" section above</li>
            <li>4. Enter today's counts for all agents</li>
            <li>5. Click "Import All" → Done! ✓</li>
          </ol>
        </div>
        <h5 className="font-semibold text-blue-300 text-sm mb-2">Other Features:</h5>
        <ul className="text-xs text-white/60 space-y-1">
          <li>• <strong>Single Entry:</strong> Add/fix one agent's count for one date</li>
          <li>• <strong>Bulk Delete Range:</strong> Clean up duplicate or wrong data for a date range</li>
          <li>• <strong>Delete All:</strong> Nuclear reset (requires typing "DELETE ALL")</li>
          <li>• <strong>Updates:</strong> Re-entering same agent + date will update (not duplicate)</li>
          <li>• <strong>Rankings:</strong> Trello cards count toward Performance Scorecard daily averages</li>
        </ul>
      </div>
    </div>
  );
}

