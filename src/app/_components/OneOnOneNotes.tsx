'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/app/_components/Card';
import { SmallButton } from '@/app/_components/SmallButton';

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
  notes?: string;
  actionItems?: ActionItem[];
  nextMeetingDate?: string;
  followUpRequired: boolean;
  emailTemplate?: string;
  emailSent: boolean;
  emailSentAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface Agent {
  id: string;
  name: string;
  email: string;
}

interface OneOnOneNotesProps {
  agents: Agent[];
}

// Component to display notes grouped by agent
function NotesGroupedByAgent({ 
  notes, 
  onNoteClick,
  expandedAgents,
  setExpandedAgents
}: { 
  notes: OneOnOneNote[];
  onNoteClick: (note: OneOnOneNote) => void;
  expandedAgents: Set<string>;
  setExpandedAgents: (setter: (prev: Set<string>) => Set<string>) => void;
}) {
  // Group notes by agent
  const notesByAgent = notes.reduce((acc, note) => {
    const key = note.agentId;
    if (!acc[key]) {
      acc[key] = {
        agentId: note.agentId,
        agentName: note.agentName,
        agentEmail: note.agentEmail,
        notes: []
      };
    }
    acc[key].notes.push(note);
    return acc;
  }, {} as Record<string, { agentId: string; agentName: string; agentEmail: string; notes: OneOnOneNote[] }>);

  const toggleAgent = (agentId: string) => {
    setExpandedAgents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(agentId)) {
        newSet.delete(agentId);
      } else {
        newSet.add(agentId);
      }
      return newSet;
    });
  };

  return (
    <div className="space-y-3">
      {Object.values(notesByAgent)
        .sort((a, b) => {
          // Sort by most recent note date
          const aLatest = a.notes[0]?.meetingDate || '';
          const bLatest = b.notes[0]?.meetingDate || '';
          return bLatest.localeCompare(aLatest);
        })
        .map((agentGroup) => {
          const isExpanded = expandedAgents.has(agentGroup.agentId);
          const latestNote = agentGroup.notes[0];
          
          return (
            <div
              key={agentGroup.agentId}
              className="bg-white/5 rounded-lg border border-white/10 overflow-hidden"
            >
              {/* Agent Header - Clickable */}
              <div
                className="p-4 cursor-pointer hover:bg-white/10 transition-all flex items-center justify-between"
                onClick={() => toggleAgent(agentGroup.agentId)}
              >
                <div className="flex items-center gap-3">
                  <div className="text-lg">{isExpanded ? '▼' : '▶'}</div>
                  <div>
                    <div className="font-semibold text-white">{agentGroup.agentName}</div>
                    <div className="text-white/60 text-sm">{agentGroup.agentEmail}</div>
                  </div>
                </div>
                <div className="text-white/60 text-sm">
                  {agentGroup.notes.length} note{agentGroup.notes.length !== 1 ? 's' : ''} • 
                  Most recent: {latestNote ? new Date(latestNote.meetingDate).toLocaleDateString() : 'N/A'}
                </div>
              </div>

              {/* Expanded Notes List */}
              {isExpanded && (
                <div className="border-t border-white/10 p-4 space-y-3">
                  {agentGroup.notes.map((note) => (
                    <div
                      key={note.id}
                      className="p-4 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 cursor-pointer transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNoteClick(note);
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-white/80 font-medium">
                          {new Date(note.meetingDate).toLocaleDateString('en-US', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </div>
                        <div className="text-white/60 text-xs">
                          {new Date(note.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      {note.discussionPoints && (
                        <p className="text-white/70 text-sm line-clamp-2 mb-2">
                          {note.discussionPoints}
                        </p>
                      )}
                      <div className="flex gap-2 flex-wrap">
                        {note.emailSent && (
                          <span className="px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded">
                            ✓ Email Sent
                          </span>
                        )}
                        {note.followUpRequired && (
                          <span className="px-2 py-1 bg-amber-500/20 text-amber-300 text-xs rounded">
                            ⚠ Follow-up Required
                          </span>
                        )}
                        {note.actionItems && Array.isArray(note.actionItems) && note.actionItems.length > 0 && (
                          <span className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded">
                            {note.actionItems.length} Action Item{note.actionItems.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        {note.nextMeetingDate && (
                          <span className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded">
                            Next: {new Date(note.nextMeetingDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

export default function OneOnOneNotes({ agents }: OneOnOneNotesProps) {
  const [notes, setNotes] = useState<OneOnOneNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedNote, setSelectedNote] = useState<OneOnOneNote | null>(null);
  const [previousActionItems, setPreviousActionItems] = useState<ActionItem[]>([]);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [generatedEmail, setGeneratedEmail] = useState('');
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  
  // Form state
  const [formData, setFormData] = useState({
    meetingDate: new Date().toISOString().split('T')[0],
    discussionPoints: '',
    strengths: '',
    areasForImprovement: '',
    notes: '',
    actionItems: [] as ActionItem[],
    nextMeetingDate: '',
    followUpRequired: false
  });

  // Load all notes
  const loadNotes = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/manager/one-on-one');
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
  }, []);

  // Load previous action items when agent is selected
  const loadPreviousActionItems = async (agentId: string) => {
    try {
      const response = await fetch(`/api/manager/one-on-one/previous-action-items?agentId=${agentId}`);
      const data = await response.json();
      
      if (data.success && data.hasActionItems) {
        setPreviousActionItems(data.actionItems);
      } else {
        setPreviousActionItems([]);
      }
    } catch (error) {
      console.error('Error loading previous action items:', error);
      setPreviousActionItems([]);
    }
  };

  // Handle agent selection
  const handleAgentSelect = (agent: Agent) => {
    setSelectedAgent(agent);
    setShowForm(true);
    setSelectedNote(null);
    loadPreviousActionItems(agent.id);
    
    // Reset form with agent data
    setFormData({
      meetingDate: new Date().toISOString().split('T')[0],
      discussionPoints: '',
      strengths: '',
      areasForImprovement: '',
      notes: '',
      actionItems: [],
      nextMeetingDate: '',
      followUpRequired: false
    });
  };

  // Add new action item
  const addActionItem = () => {
    const newItem: ActionItem = {
      id: Date.now().toString(),
      description: '',
      status: 'pending',
      dueDate: ''
    };
    setFormData({
      ...formData,
      actionItems: [...formData.actionItems, newItem]
    });
  };

  // Update action item
  const updateActionItem = (id: string, field: keyof ActionItem, value: string) => {
    setFormData({
      ...formData,
      actionItems: formData.actionItems.map(item =>
        item.id === id ? { ...item, [field]: value } : item
      )
    });
  };

  // Remove action item
  const removeActionItem = (id: string) => {
    setFormData({
      ...formData,
      actionItems: formData.actionItems.filter(item => item.id !== id)
    });
  };

  // Generate email template
  const generateEmailTemplate = () => {
    if (!selectedAgent) return '';

    const { meetingDate, discussionPoints, strengths, areasForImprovement, actionItems } = formData;
    
    let email = `Hi ${selectedAgent.name},\n\n`;
    email += `Thank you for taking the time to meet with me on ${new Date(meetingDate).toLocaleDateString()}. I wanted to recap what we discussed:\n\n`;
    
    if (discussionPoints) {
      email += `**Key Discussion Points:**\n${discussionPoints}\n\n`;
    }
    
    if (strengths) {
      email += `**Strengths & Wins:**\n${strengths}\n\n`;
    }
    
    if (areasForImprovement) {
      email += `**Areas for Growth:**\n${areasForImprovement}\n\n`;
    }
    
    if (actionItems.length > 0) {
      email += `**Action Items for Next Time:**\n`;
      actionItems.forEach((item, index) => {
        email += `${index + 1}. ${item.description}`;
        if (item.dueDate) {
          email += ` (Due: ${new Date(item.dueDate).toLocaleDateString()})`;
        }
        email += `\n`;
      });
      email += `\n`;
    }
    
    email += `Please let me know if you have any questions or if there's anything else you'd like to discuss.\n\n`;
    email += `Looking forward to our next check-in!\n\n`;
    email += `Best regards`;
    
    return email;
  };

  // Show email preview
  const handleShowEmailPreview = () => {
    const email = generateEmailTemplate();
    setGeneratedEmail(email);
    setShowEmailModal(true);
  };

  // Save note
  const handleSaveNote = async () => {
    if (!selectedAgent) return;
    
    setLoading(true);
    try {
      const emailTemplate = generateEmailTemplate();
      
      const response = await fetch('/api/manager/one-on-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          agentId: selectedAgent.id,
          agentName: selectedAgent.name,
          agentEmail: selectedAgent.email,
          emailTemplate
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert('One-on-one note saved successfully!');
        setShowForm(false);
        setSelectedAgent(null);
        loadNotes();
      } else {
        alert('Error saving note: ' + data.error);
      }
    } catch (error) {
      console.error('Error saving note:', error);
      alert('Error saving note');
    } finally {
      setLoading(false);
    }
  };

  // Copy email to clipboard
  const copyEmailToClipboard = () => {
    navigator.clipboard.writeText(generatedEmail);
    alert('Email copied to clipboard!');
  };

  // View note details
  const viewNoteDetails = (note: OneOnOneNote) => {
    setSelectedNote(note);
  };

  // Close note details
  const closeNoteDetails = () => {
    setSelectedNote(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white">💬 One-on-One Meeting Notes</h3>
          <p className="text-white/60 text-sm mt-1">
            Track performance discussions and action items with your team
          </p>
        </div>
        {!showForm && (
          <SmallButton
            onClick={() => setShowForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2"
          >
            + New One-on-One
          </SmallButton>
        )}
      </div>

      {/* Form Section */}
      {showForm && (
        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-white">
                {selectedAgent ? `One-on-One with ${selectedAgent.name}` : 'Select an Agent'}
              </h4>
              <SmallButton
                onClick={() => {
                  setShowForm(false);
                  setSelectedAgent(null);
                }}
                className="bg-gray-600 hover:bg-gray-700 text-white"
              >
                ✕ Cancel
              </SmallButton>
            </div>

            {/* Agent Selector */}
            {!selectedAgent && (
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Select Agent
                </label>
                {agents.length === 0 ? (
                  <div className="text-white/60 text-sm py-4">Loading agents...</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {agents.map(agent => (
                      <button
                        key={agent.id}
                        onClick={() => handleAgentSelect(agent)}
                        className="p-3 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 hover:border-blue-500/50 text-left transition-all"
                      >
                        <div className="font-medium text-white">{agent.name || agent.email}</div>
                        <div className="text-white/60 text-xs">{agent.email}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedAgent && (
              <>
                {/* Meeting Date */}
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">
                    Meeting Date
                  </label>
                  <input
                    type="date"
                    value={formData.meetingDate}
                    onChange={(e) => setFormData({ ...formData, meetingDate: e.target.value })}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Previous Action Items */}
                {previousActionItems.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                    <h5 className="text-amber-300 font-medium mb-2">📋 Follow-up from Last Meeting</h5>
                    <div className="space-y-2">
                      {previousActionItems.map((item: ActionItem) => (
                        <div key={item.id} className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={item.status === 'completed'}
                            className="mt-1"
                            readOnly
                          />
                          <div className="flex-1">
                            <div className="text-white/80 text-sm">{item.description}</div>
                            <div className="text-white/50 text-xs">
                              Status: <span className={`font-medium ${
                                item.status === 'completed' ? 'text-green-400' :
                                item.status === 'in_progress' ? 'text-yellow-400' :
                                'text-gray-400'
                              }`}>{item.status.replace('_', ' ')}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Discussion Points */}
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">
                    Key Discussion Points
                  </label>
                  <textarea
                    value={formData.discussionPoints}
                    onChange={(e) => setFormData({ ...formData, discussionPoints: e.target.value })}
                    placeholder="What did you discuss? Performance metrics, challenges, goals..."
                    rows={3}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Strengths */}
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">
                    Strengths & Wins
                  </label>
                  <textarea
                    value={formData.strengths}
                    onChange={(e) => setFormData({ ...formData, strengths: e.target.value })}
                    placeholder="What are they doing well? Recent accomplishments..."
                    rows={2}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Areas for Improvement */}
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">
                    Areas for Growth/Improvement
                  </label>
                  <textarea
                    value={formData.areasForImprovement}
                    onChange={(e) => setFormData({ ...formData, areasForImprovement: e.target.value })}
                    placeholder="What can they work on? Development opportunities..."
                    rows={2}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Private Notes */}
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">
                    Private Manager Notes (Not shown to agent)
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Private observations, concerns, plans..."
                    rows={2}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Action Items */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-white/80 text-sm font-medium">
                      Action Items & Goals
                    </label>
                    <SmallButton
                      onClick={addActionItem}
                      className="bg-green-600 hover:bg-green-700 text-white text-xs"
                    >
                      + Add Item
                    </SmallButton>
                  </div>
                  <div className="space-y-2">
                    {formData.actionItems.map((item) => (
                      <div key={item.id} className="flex gap-2 items-start p-3 bg-white/5 rounded-lg border border-white/10">
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => updateActionItem(item.id, 'description', e.target.value)}
                            placeholder="Action item description..."
                            className="w-full px-2 py-1 bg-white/5 border border-white/10 rounded text-white text-sm placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <div className="flex gap-2 items-center">
                            <select
                              value={item.status}
                              onChange={(e) => updateActionItem(item.id, 'status', e.target.value)}
                              className="px-2 py-1 bg-white/5 border border-white/10 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="pending">Pending</option>
                              <option value="in_progress">In Progress</option>
                              <option value="completed">Completed</option>
                            </select>
                            <input
                              type="date"
                              value={item.dueDate || ''}
                              onChange={(e) => updateActionItem(item.id, 'dueDate', e.target.value)}
                              placeholder="Due date"
                              className="px-2 py-1 bg-white/5 border border-white/10 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                        <SmallButton
                          onClick={() => removeActionItem(item.id)}
                          className="bg-red-600 hover:bg-red-700 text-white text-xs"
                        >
                          ✕
                        </SmallButton>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Next Meeting Date */}
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">
                    Next Meeting Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={formData.nextMeetingDate}
                    onChange={(e) => setFormData({ ...formData, nextMeetingDate: e.target.value })}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Follow-up Required */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.followUpRequired}
                    onChange={(e) => setFormData({ ...formData, followUpRequired: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label className="text-white/80 text-sm">
                    Follow-up required before next meeting
                  </label>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <SmallButton
                    onClick={handleShowEmailPreview}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2"
                  >
                    📧 Preview Email
                  </SmallButton>
                  <SmallButton
                    onClick={handleSaveNote}
                    disabled={loading}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2"
                  >
                    {loading ? 'Saving...' : '💾 Save Note'}
                  </SmallButton>
                </div>
              </>
            )}
          </div>
        </Card>
      )}

      {/* Notes History - Grouped by Agent */}
      <Card className="p-6">
        <h4 className="text-lg font-semibold text-white mb-4">📚 Recent One-on-One Notes</h4>
        {loading && !showForm ? (
          <div className="text-white/60 text-center py-8">Loading notes...</div>
        ) : notes.length === 0 ? (
          <div className="text-white/60 text-center py-8">
            No one-on-one notes yet. Click "New One-on-One" to get started!
          </div>
        ) : (
          <NotesGroupedByAgent 
            notes={notes} 
            onNoteClick={viewNoteDetails}
            expandedAgents={expandedAgents}
            setExpandedAgents={setExpandedAgents}
          />
        )}
      </Card>

      {/* Email Preview Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg border border-white/20 max-w-3xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-white/10">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-white">📧 Email Preview</h3>
                <SmallButton
                  onClick={() => setShowEmailModal(false)}
                  className="bg-gray-600 hover:bg-gray-700 text-white"
                >
                  ✕ Close
                </SmallButton>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <pre className="text-white/90 whitespace-pre-wrap font-sans text-sm leading-relaxed bg-white/5 p-4 rounded-lg border border-white/10">
                {generatedEmail}
              </pre>
              <div className="mt-4 flex gap-3">
                <SmallButton
                  onClick={copyEmailToClipboard}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2"
                >
                  📋 Copy to Clipboard
                </SmallButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Note Details Modal */}
      {selectedNote && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg border border-white/20 max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-white">
                    One-on-One with {selectedNote.agentName}
                  </h3>
                  <p className="text-white/60 text-sm">
                    {new Date(selectedNote.meetingDate).toLocaleDateString()} • 
                    Manager: {selectedNote.managerName || 'Unknown'}
                  </p>
                </div>
                <SmallButton
                  onClick={closeNoteDetails}
                  className="bg-gray-600 hover:bg-gray-700 text-white"
                >
                  ✕ Close
                </SmallButton>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4">
              {selectedNote.discussionPoints && (
                <div>
                  <h4 className="font-semibold text-white mb-2">Discussion Points:</h4>
                  <p className="text-white/80 whitespace-pre-wrap">{selectedNote.discussionPoints}</p>
                </div>
              )}
              {selectedNote.strengths && (
                <div>
                  <h4 className="font-semibold text-green-400 mb-2">Strengths & Wins:</h4>
                  <p className="text-white/80 whitespace-pre-wrap">{selectedNote.strengths}</p>
                </div>
              )}
              {selectedNote.areasForImprovement && (
                <div>
                  <h4 className="font-semibold text-amber-400 mb-2">Areas for Growth:</h4>
                  <p className="text-white/80 whitespace-pre-wrap">{selectedNote.areasForImprovement}</p>
                </div>
              )}
              {selectedNote.actionItems && Array.isArray(selectedNote.actionItems) && selectedNote.actionItems.length > 0 && (
                <div>
                  <h4 className="font-semibold text-blue-400 mb-2">Action Items:</h4>
                  <div className="space-y-2">
                    {selectedNote.actionItems.map((item: ActionItem) => (
                      <div key={item.id} className="flex items-start gap-2 p-2 bg-white/5 rounded">
                        <span className={`px-2 py-0.5 text-xs rounded ${
                          item.status === 'completed' ? 'bg-green-500/20 text-green-300' :
                          item.status === 'in_progress' ? 'bg-yellow-500/20 text-yellow-300' :
                          'bg-gray-500/20 text-gray-300'
                        }`}>
                          {item.status.replace('_', ' ')}
                        </span>
                        <div className="flex-1">
                          <p className="text-white/80 text-sm">{item.description}</p>
                          {item.dueDate && (
                            <p className="text-white/50 text-xs">Due: {new Date(item.dueDate).toLocaleDateString()}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedNote.emailTemplate && (
                <div>
                  <h4 className="font-semibold text-purple-400 mb-2">Email Template:</h4>
                  <pre className="text-white/70 whitespace-pre-wrap font-sans text-sm bg-white/5 p-4 rounded border border-white/10">
                    {selectedNote.emailTemplate}
                  </pre>
                  <SmallButton
                    onClick={() => {
                      navigator.clipboard.writeText(selectedNote.emailTemplate || '');
                      alert('Email copied to clipboard!');
                    }}
                    className="mt-2 bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    📋 Copy Email
                  </SmallButton>
                </div>
              )}
              {selectedNote.nextMeetingDate && (
                <div>
                  <h4 className="font-semibold text-white mb-2">Next Meeting:</h4>
                  <p className="text-white/80">{new Date(selectedNote.nextMeetingDate).toLocaleDateString()}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

