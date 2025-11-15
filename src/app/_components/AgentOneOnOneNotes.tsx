'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/app/_components/Card';

interface ActionItem {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  dueDate?: string;
}

interface OneOnOneNote {
  id: string;
  meetingDate: string;
  agentId: string;
  agentName: string;
  agentEmail: string;
  managerId: string;
  managerName?: string;
  discussionPoints?: string;
  strengths?: string;
  areasForImprovement?: string;
  actionItems?: ActionItem[];
  nextMeetingDate?: string;
  followUpRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AgentOneOnOneNotesProps {
  agentEmail: string;
}

export default function AgentOneOnOneNotes({ agentEmail }: AgentOneOnOneNotesProps) {
  const [notes, setNotes] = useState<OneOnOneNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  
  // Get most recent note as default
  const mostRecentNote = notes.length > 0 ? notes[0] : null;
  const selectedNote = notes.find(n => n.id === selectedNoteId) || mostRecentNote;

  // Load notes for this agent
  const loadNotes = async () => {
    setLoading(true);
    try {
      // Get agent ID first
      const userResponse = await fetch(`/api/agent/profile?email=${encodeURIComponent(agentEmail)}`);
      const userData = await userResponse.json();
      
      if (!userData.success || !userData.agent) {
        console.error('Failed to fetch agent profile');
        setLoading(false);
        return;
      }

      const response = await fetch(`/api/manager/one-on-one?agentId=${userData.agent.id}`);
      const data = await response.json();
      
      if (data.success) {
        setNotes(data.notes);
      }
    } catch (error) {
      console.error('Error loading one-on-one notes:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotes();
  }, [agentEmail]);

  // Handle note selection from dropdown
  const handleNoteSelect = (noteId: string) => {
    setSelectedNoteId(noteId === 'most-recent' ? null : noteId);
  };

  // Close note details (will revert to most recent)
  const closeNoteDetails = () => {
    setSelectedNoteId(null);
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="text-center py-8">
          <div className="text-white/60">Loading your one-on-one notes...</div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="mb-4">
          <h3 className="text-xl font-semibold text-white/90 dark:text-white/90 light:text-gray-800">
            💬 Your One-on-One Meeting Notes
          </h3>
          <p className="text-white/60 dark:text-white/60 light:text-gray-600 text-sm mt-1">
            Review notes and action items from your performance discussions
          </p>
        </div>

        {notes.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">📭</div>
            <div className="text-white/60 dark:text-white/60 light:text-gray-600">
              No one-on-one notes yet
            </div>
            <div className="text-white/40 dark:text-white/40 light:text-gray-500 text-sm mt-2">
              Your manager will add notes after your performance discussions
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Note Selector Dropdown */}
            {notes.length > 1 && (
              <div>
                <label className="block text-white/80 dark:text-white/80 light:text-gray-700 text-sm font-medium mb-2">
                  View Previous Notes:
                </label>
                <select
                  value={selectedNoteId || 'most-recent'}
                  onChange={(e) => handleNoteSelect(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 dark:bg-white/5 light:bg-gray-50 border border-white/10 dark:border-white/10 light:border-gray-200 rounded-lg text-white dark:text-white light:text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="most-recent">
                    Most Recent: {mostRecentNote ? new Date(mostRecentNote.meetingDate).toLocaleDateString() : 'N/A'}
                  </option>
                  {notes.slice(1).map((note) => (
                    <option key={note.id} value={note.id}>
                      {new Date(note.meetingDate).toLocaleDateString('en-US', {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Selected Note Display */}
            {selectedNote && (
              <div className="p-4 bg-white/5 dark:bg-white/5 light:bg-gray-50 rounded-lg border border-white/10 dark:border-white/10 light:border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">📝</div>
                    <div>
                      <div className="font-semibold text-white dark:text-white light:text-gray-800">
                        One-on-One Meeting
                      </div>
                      <div className="text-white/60 dark:text-white/60 light:text-gray-600 text-sm">
                        with {selectedNote.managerName || 'Manager'}
                      </div>
                    </div>
                  </div>
                  <div className="text-white/60 dark:text-white/60 light:text-gray-600 text-sm">
                    {new Date(selectedNote.meetingDate).toLocaleDateString('en-US', {
                      weekday: 'short',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </div>
                </div>

                {selectedNote.discussionPoints && (
                  <p className="text-white/70 dark:text-white/70 light:text-gray-700 text-sm line-clamp-3 mb-3">
                    {selectedNote.discussionPoints}
                  </p>
                )}

                <div className="flex gap-2 flex-wrap mb-3">
                  {selectedNote.actionItems && Array.isArray(selectedNote.actionItems) && selectedNote.actionItems.length > 0 && (
                    <span className="px-2 py-1 bg-blue-500/20 text-blue-300 dark:text-blue-300 light:text-blue-600 text-xs rounded">
                      {selectedNote.actionItems.length} Action Item{selectedNote.actionItems.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {selectedNote.followUpRequired && (
                    <span className="px-2 py-1 bg-amber-500/20 text-amber-300 dark:text-amber-300 light:text-amber-600 text-xs rounded">
                      ⚠ Follow-up Required
                    </span>
                  )}
                  {selectedNote.nextMeetingDate && (
                    <span className="px-2 py-1 bg-purple-500/20 text-purple-300 dark:text-purple-300 light:text-purple-600 text-xs rounded">
                      Next: {new Date(selectedNote.nextMeetingDate).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <button
                  onClick={() => setSelectedNoteId(selectedNote.id)}
                  className="text-blue-400 dark:text-blue-400 light:text-blue-600 hover:text-blue-300 dark:hover:text-blue-300 light:hover:text-blue-700 text-sm font-medium"
                >
                  View Full Details →
                </button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Note Details Modal */}
      {selectedNote && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 dark:bg-gray-900 light:bg-white rounded-lg border border-white/20 dark:border-white/20 light:border-gray-300 max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-white/10 dark:border-white/10 light:border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-white dark:text-white light:text-gray-800">
                    One-on-One Meeting Details
                  </h3>
                  <p className="text-white/60 dark:text-white/60 light:text-gray-600 text-sm">
                    {new Date(selectedNote.meetingDate).toLocaleDateString()} • 
                    Manager: {selectedNote.managerName || 'Unknown'}
                  </p>
                </div>
                <button
                  onClick={closeNoteDetails}
                  className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 dark:bg-gray-600 dark:hover:bg-gray-700 light:bg-gray-200 light:hover:bg-gray-300 text-white dark:text-white light:text-gray-800 rounded-md text-sm font-medium"
                >
                  ✕ Close
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4">
              {selectedNote.discussionPoints && (
                <div className="p-4 bg-white/5 dark:bg-white/5 light:bg-gray-50 rounded-lg border border-white/10 dark:border-white/10 light:border-gray-200">
                  <h4 className="font-semibold text-white dark:text-white light:text-gray-800 mb-2 flex items-center gap-2">
                    <span>💬</span> Discussion Points:
                  </h4>
                  <p className="text-white/80 dark:text-white/80 light:text-gray-700 whitespace-pre-wrap">{selectedNote.discussionPoints}</p>
                </div>
              )}
              
              {selectedNote.strengths && (
                <div className="p-4 bg-green-500/10 dark:bg-green-500/10 light:bg-green-50 rounded-lg border border-green-500/20 dark:border-green-500/20 light:border-green-200">
                  <h4 className="font-semibold text-green-400 dark:text-green-400 light:text-green-700 mb-2 flex items-center gap-2">
                    <span>💪</span> Strengths & Wins:
                  </h4>
                  <p className="text-white/80 dark:text-white/80 light:text-gray-700 whitespace-pre-wrap">{selectedNote.strengths}</p>
                </div>
              )}
              
              {selectedNote.areasForImprovement && (
                <div className="p-4 bg-amber-500/10 dark:bg-amber-500/10 light:bg-amber-50 rounded-lg border border-amber-500/20 dark:border-amber-500/20 light:border-amber-200">
                  <h4 className="font-semibold text-amber-400 dark:text-amber-400 light:text-amber-700 mb-2 flex items-center gap-2">
                    <span>🎯</span> Areas for Growth:
                  </h4>
                  <p className="text-white/80 dark:text-white/80 light:text-gray-700 whitespace-pre-wrap">{selectedNote.areasForImprovement}</p>
                </div>
              )}
              
              {selectedNote.actionItems && Array.isArray(selectedNote.actionItems) && selectedNote.actionItems.length > 0 && (
                <div className="p-4 bg-blue-500/10 dark:bg-blue-500/10 light:bg-blue-50 rounded-lg border border-blue-500/20 dark:border-blue-500/20 light:border-blue-200">
                  <h4 className="font-semibold text-blue-400 dark:text-blue-400 light:text-blue-700 mb-3 flex items-center gap-2">
                    <span>📋</span> Action Items & Goals:
                  </h4>
                  <div className="space-y-3">
                    {selectedNote.actionItems.map((item: ActionItem, index: number) => (
                      <div key={item.id} className="flex items-start gap-3 p-3 bg-white/5 dark:bg-white/5 light:bg-white rounded border border-white/10 dark:border-white/10 light:border-gray-200">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 dark:bg-blue-500/20 light:bg-blue-100 flex items-center justify-center text-blue-400 dark:text-blue-400 light:text-blue-600 text-xs font-bold">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <p className="text-white/80 dark:text-white/80 light:text-gray-800 font-medium">
                            {item.description}
                          </p>
                          <div className="flex gap-3 mt-2 text-xs">
                            <span className={`px-2 py-0.5 rounded ${
                              item.status === 'completed' 
                                ? 'bg-green-500/20 text-green-300 dark:text-green-300 light:text-green-700 light:bg-green-100' :
                              item.status === 'in_progress' 
                                ? 'bg-yellow-500/20 text-yellow-300 dark:text-yellow-300 light:text-yellow-700 light:bg-yellow-100' :
                              'bg-gray-500/20 text-gray-300 dark:text-gray-300 light:text-gray-700 light:bg-gray-100'
                            }`}>
                              {item.status === 'completed' && '✓ '}
                              {item.status === 'in_progress' && '⟳ '}
                              {item.status === 'pending' && '○ '}
                              {item.status.replace('_', ' ').toUpperCase()}
                            </span>
                            {item.dueDate && (
                              <span className="text-white/60 dark:text-white/60 light:text-gray-600">
                                Due: {new Date(item.dueDate).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {selectedNote.nextMeetingDate && (
                <div className="p-4 bg-purple-500/10 dark:bg-purple-500/10 light:bg-purple-50 rounded-lg border border-purple-500/20 dark:border-purple-500/20 light:border-purple-200">
                  <h4 className="font-semibold text-purple-400 dark:text-purple-400 light:text-purple-700 mb-2 flex items-center gap-2">
                    <span>📅</span> Next Meeting:
                  </h4>
                  <p className="text-white/80 dark:text-white/80 light:text-gray-700">
                    {new Date(selectedNote.nextMeetingDate).toLocaleDateString()}
                  </p>
                </div>
              )}

              <div className="text-white/50 dark:text-white/50 light:text-gray-500 text-xs text-center pt-4 border-t border-white/10 dark:border-white/10 light:border-gray-200">
                Created {new Date(selectedNote.createdAt).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

