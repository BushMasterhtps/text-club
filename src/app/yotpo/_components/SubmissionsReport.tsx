"use client";

import { useState, useEffect } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";

const SUBMITTERS = [
  "Mia Pau'u",
  "Alicia Nicholes",
  "Doris Zivkovic",
  "Evelyn Hernandez",
  "Nyariang Wur",
  "Pierina Bardales",
  "Vanessa Medina",
  "Viviana Alvarez",
  "Silas Little"
];

export default function SubmissionsReport() {
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedSubmitter, setSelectedSubmitter] = useState('all');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        submitter: selectedSubmitter
      });
      
      const response = await fetch(`/api/yotpo/submissions-report?${params.toString()}`);
      const result = await response.json();
      
      if (result.success) {
        setData(result.data);
      }
    } catch (error) {
      console.error('Error loading submissions report:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const exportCsv = async () => {
    const params = new URLSearchParams({
      startDate,
      endDate,
      submitter: selectedSubmitter,
      export: 'true'
    });
    
    window.open(`/api/yotpo/submissions-report?${params.toString()}`, '_blank');
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">📊 Form Submissions Report</h2>
          <SmallButton onClick={loadData} disabled={loading}>
            {loading ? 'Loading...' : '🔄 Refresh'}
          </SmallButton>
        </div>
        
        <p className="text-white/70 mb-4">
          Track productivity and submissions from external reps using the Yotpo submission form.
        </p>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-sm text-white/70 mb-2">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ colorScheme: 'dark' }}
            />
          </div>
          
          <div>
            <label className="block text-sm text-white/70 mb-2">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ colorScheme: 'dark' }}
            />
          </div>
          
          <div>
            <label className="block text-sm text-white/70 mb-2">Submitter</label>
            <select
              value={selectedSubmitter}
              onChange={(e) => setSelectedSubmitter(e.target.value)}
              className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ colorScheme: 'dark' }}
            >
              <option value="all">All Submitters</option>
              {SUBMITTERS.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-end gap-2">
            <SmallButton 
              onClick={loadData}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              Search
            </SmallButton>
            <SmallButton 
              onClick={exportCsv}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              📥 Export CSV
            </SmallButton>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-white/60">Loading...</div>
        ) : data ? (
          <>
            {/* Overall Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                <div className="text-xs text-blue-300 mb-1">Total Submissions</div>
                <div className="text-3xl font-bold text-white">{data.metrics.totalSubmissions}</div>
              </div>
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                <div className="text-xs text-green-300 mb-1">Today</div>
                <div className="text-3xl font-bold text-white">{data.metrics.submissionsToday}</div>
              </div>
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4">
                <div className="text-xs text-purple-300 mb-1">This Week</div>
                <div className="text-3xl font-bold text-white">{data.metrics.submissionsThisWeek}</div>
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                <div className="text-xs text-yellow-300 mb-1">Avg Per Day</div>
                <div className="text-3xl font-bold text-white">{data.metrics.avgPerDay.toFixed(1)}</div>
              </div>
            </div>

            {/* Individual Stats */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">Individual Performance</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/5">
                    <tr className="text-left text-white/70">
                      <th className="px-4 py-3">Submitter</th>
                      <th className="px-4 py-3 text-center">Total</th>
                      <th className="px-4 py-3 text-center">Today</th>
                      <th className="px-4 py-3 text-center">This Week</th>
                      <th className="px-4 py-3 text-center">Avg/Day</th>
                      <th className="px-4 py-3">Top Issue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.stats.map((stat: any) => {
                      const avgPerDay = stat.thisWeek / 7;
                      const topIssue = Object.entries(stat.byIssueTopic).sort(([,a]: any, [,b]: any) => b - a)[0];
                      
                      return (
                        <tr key={stat.name} className="hover:bg-white/5">
                          <td className="px-4 py-3 text-white font-medium">{stat.name}</td>
                          <td className="px-4 py-3 text-center text-white">{stat.total}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-green-400 font-medium">{stat.today}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-blue-400 font-medium">{stat.thisWeek}</span>
                          </td>
                          <td className="px-4 py-3 text-center text-white/80">
                            {avgPerDay.toFixed(1)}
                          </td>
                          <td className="px-4 py-3 text-white/70">
                            {topIssue ? `${topIssue[0]} (${topIssue[1]})` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Submissions */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">
                Recent Submissions ({data.submissions.length})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/5">
                    <tr className="text-left text-white/70">
                      <th className="px-3 py-2">Submitted By</th>
                      <th className="px-3 py-2">Date/Time</th>
                      <th className="px-3 py-2">Customer Name</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">Issue Topic</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Assigned To</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.submissions.slice(0, 50).map((sub: any) => (
                      <tr key={sub.id} className="hover:bg-white/5">
                        <td className="px-3 py-2 text-white font-medium">{sub.yotpoSubmittedBy}</td>
                        <td className="px-3 py-2 text-white/80 text-xs">
                          {sub.yotpoDateSubmitted ? new Date(sub.yotpoDateSubmitted).toLocaleString() : '—'}
                        </td>
                        <td className="px-3 py-2 text-white/80">{sub.yotpoCustomerName || '—'}</td>
                        <td className="px-3 py-2 text-white/80 text-xs">{sub.yotpoEmail || '—'}</td>
                        <td className="px-3 py-2 text-white/80">{sub.yotpoProduct || '—'}</td>
                        <td className="px-3 py-2 text-white/80">{sub.yotpoIssueTopic || '—'}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            sub.status === 'PENDING' ? 'bg-yellow-500/20 text-yellow-300' :
                            sub.status === 'IN_PROGRESS' ? 'bg-blue-500/20 text-blue-300' :
                            'bg-green-500/20 text-green-300'
                          }`}>
                            {sub.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-white/80 text-xs">
                          {sub.assignedTo?.name || 'Unassigned'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.submissions.length > 50 && (
                <div className="text-center text-white/60 text-sm mt-4">
                  Showing first 50 of {data.submissions.length} submissions
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-white/60">
            No data available
          </div>
        )}
      </Card>
    </div>
  );
}

