"use client";

import { useState } from "react";

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

const ISSUE_TOPICS = [
  "Refund Request",
  "Reship Request",
  "Subscription Adjustment",
  "Product Question",
  "Billing Inquiry",
  "AER",
  "Other"
];

export default function YotpoSubmissionForm() {
  const [formData, setFormData] = useState({
    submittedBy: '',
    prOrYotpo: 'Yotpo',
    customerName: '',
    email: '',
    orderDate: '',
    product: '',
    issueTopic: '',
    reviewDate: '',
    review: '',
    sfOrderLink: ''
  });
  
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [taskId, setTaskId] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
    setError(''); // Clear error when user types
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    
    try {
      const response = await fetch('/api/yotpo/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSuccess(true);
        setTaskId(data.taskId);
        // Reset form
        setFormData({
          submittedBy: '',
          prOrYotpo: 'Yotpo',
          customerName: '',
          email: '',
          orderDate: '',
          product: '',
          issueTopic: '',
          reviewDate: '',
          review: '',
          sfOrderLink: ''
        });
      } else {
        setError(data.error || 'Failed to submit request');
      }
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-8 text-center">
          <div className="mb-6">
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-5xl">✅</span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Request Submitted!</h1>
            <p className="text-white/70 text-lg">
              Your Yotpo request has been added to the queue.
            </p>
          </div>
          
          <div className="bg-white/5 rounded-lg p-4 mb-6">
            <p className="text-sm text-white/60 mb-1">Task ID:</p>
            <p className="text-white font-mono text-lg">{taskId}</p>
          </div>
          
          <button
            onClick={() => setSuccess(false)}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-lg font-medium transition-all"
          >
            Submit Another Request
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            ⭐ Yotpo Request Submission
          </h1>
          <p className="text-white/70">
            Submit customer review and feedback requests
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-8">
          {error && (
            <div className="mb-6 bg-red-500/20 border border-red-500/50 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">❌</span>
                <p className="text-red-200">{error}</p>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {/* Submitted By - REQUIRED */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Submitted By <span className="text-red-400">*</span>
              </label>
              <select
                name="submittedBy"
                value={formData.submittedBy}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                style={{ colorScheme: 'dark' }}
              >
                <option value="">Select your name...</option>
                {SUBMITTERS.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            {/* PR or Yotpo */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                PR or Yotpo
              </label>
              <select
                name="prOrYotpo"
                value={formData.prOrYotpo}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ colorScheme: 'dark' }}
              >
                <option value="Yotpo">Yotpo</option>
                <option value="PRs">PRs</option>
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Customer Name - REQUIRED */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Customer Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  name="customerName"
                  value={formData.customerName}
                  onChange={handleChange}
                  required
                  placeholder="John Smith"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Email - REQUIRED */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Customer Email <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  placeholder="customer@example.com"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Order Date - REQUIRED */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Order Date <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  name="orderDate"
                  value={formData.orderDate}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ colorScheme: 'dark' }}
                />
              </div>

              {/* Review Date - REQUIRED */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Review Date <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  name="reviewDate"
                  value={formData.reviewDate}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
            </div>

            {/* Product - REQUIRED */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Product <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                name="product"
                value={formData.product}
                onChange={handleChange}
                required
                placeholder="Bio Complete 3"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Issue Topic - REQUIRED */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Issue Topic <span className="text-red-400">*</span>
              </label>
              <select
                name="issueTopic"
                value={formData.issueTopic}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ colorScheme: 'dark' }}
              >
                <option value="">Select issue topic...</option>
                {ISSUE_TOPICS.map(topic => (
                  <option key={topic} value={topic}>{topic}</option>
                ))}
              </select>
            </div>

            {/* Review - REQUIRED */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Review / Request Details <span className="text-red-400">*</span>
              </label>
              <textarea
                name="review"
                value={formData.review}
                onChange={handleChange}
                required
                rows={6}
                placeholder="Enter the customer's review or request details..."
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              />
              <p className="text-xs text-white/50 mt-1">
                {formData.review.length} characters
              </p>
            </div>

            {/* SF Order Link - OPTIONAL */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Salesforce Order Link (optional)
              </label>
              <input
                type="url"
                name="sfOrderLink"
                value={formData.sfOrderLink}
                onChange={handleChange}
                placeholder="https://altmar1.lightning.force.com/..."
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={submitting}
                className="w-full px-6 py-4 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-lg transition-all shadow-lg shadow-blue-500/25"
              >
                {submitting ? 'Submitting...' : 'Submit Yotpo Request'}
              </button>
            </div>
          </div>
        </form>

        {/* Info Footer */}
        <div className="mt-6 text-center text-white/50 text-sm">
          <p>This form submits directly to the Yotpo task queue.</p>
          <p>No login required. Select your name from the dropdown above.</p>
        </div>
      </div>
    </div>
  );
}

