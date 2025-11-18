"use client";

import React, { useState, useEffect, useRef } from "react";

interface SearchResult {
  emailMacros: Array<{
    id: string;
    macroName: string;
    macro: string;
    caseType: string | null;
    brand: string | null;
    description: string | null;
  }>;
  textClubMacros: Array<{
    id: string;
    macroName: string;
    macroDetails: string;
  }>;
  productInquiryQAs: Array<{
    id: string;
    brand: string;
    product: string;
    question: string;
    answer: string;
  }>;
  total: number;
}

export default function KnowledgeSection() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastSearch, setLastSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load last search when opening
  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem("knowledgeLastSearch");
      if (saved) {
        setSearchQuery(saved);
        setLastSearch(saved);
      }
      // Focus search input
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Auto-search when query changes (debounced)
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        performSearch(searchQuery);
        localStorage.setItem("knowledgeLastSearch", searchQuery);
      } else {
        setResults(null);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, isOpen]);

  // Auto-search last query when opening
  useEffect(() => {
    if (isOpen && lastSearch && !searchQuery) {
      setSearchQuery(lastSearch);
    }
  }, [isOpen, lastSearch]);

  const performSearch = async (query: string) => {
    if (!query.trim()) {
      setResults(null);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/knowledge/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.success) {
        setResults(data.data);
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  };

  const CopyButton = ({ text, id, label }: { text: string; id: string; label: string }) => (
    <button
      onClick={() => copyToClipboard(text, id)}
      className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
      title={`Copy ${label}`}
    >
      {copiedId === id ? "✓ Copied" : "📋 Copy"}
    </button>
  );

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center text-2xl transition-all hover:scale-110"
        title="Knowledge Base"
      >
        📚
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col border border-white/20">
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">📚 Knowledge Base</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white/60 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            {/* Search Bar */}
            <div className="p-4 border-b border-white/10">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for macros, instructions, product info... (e.g., 'Return Instructions', 'Lactobacillus')"
                className="w-full px-4 py-2 bg-white/10 rounded-md text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="text-center py-8 text-white/60">Searching...</div>
              ) : !searchQuery.trim() ? (
                <div className="text-center py-8 text-white/60">
                  Enter a search term to find macros, instructions, and product information
                </div>
              ) : results && results.total === 0 ? (
                <div className="text-center py-8 text-white/60">
                  No results found for "{searchQuery}"
                </div>
              ) : results ? (
                <div className="space-y-6">
                  {/* Email Macros */}
                  {results.emailMacros.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                        📧 Email Macros ({results.emailMacros.length})
                      </h3>
                      <div className="space-y-3">
                        {results.emailMacros.map((macro) => (
                          <div
                            key={macro.id}
                            className="p-4 bg-white/5 rounded-lg border border-white/10"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="font-semibold text-white">{macro.macroName}</span>
                                  {macro.brand && (
                                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs">
                                      {macro.brand}
                                    </span>
                                  )}
                                  {macro.caseType && (
                                    <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded text-xs">
                                      {macro.caseType}
                                    </span>
                                  )}
                                </div>
                                {macro.description && (
                                  <p className="text-sm text-white/60 mb-2">{macro.description}</p>
                                )}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <label className="text-xs text-white/60 mb-1 block">Macro Name:</label>
                                  <p className="text-sm text-white/80">{macro.macroName}</p>
                                </div>
                                <CopyButton text={macro.macroName} id={`name-${macro.id}`} label="Macro Name" />
                              </div>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <label className="text-xs text-white/60 mb-1 block">Macro:</label>
                                  <p className="text-sm text-white/80 whitespace-pre-wrap">{macro.macro}</p>
                                </div>
                                <CopyButton text={macro.macro} id={`macro-${macro.id}`} label="Macro" />
                              </div>
                              {macro.caseType && (
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <label className="text-xs text-white/60 mb-1 block">Case Type:</label>
                                    <p className="text-sm text-white/80">{macro.caseType}</p>
                                  </div>
                                  <CopyButton text={macro.caseType} id={`case-${macro.id}`} label="Case Type" />
                                </div>
                              )}
                              {macro.brand && (
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <label className="text-xs text-white/60 mb-1 block">Brand:</label>
                                    <p className="text-sm text-white/80">{macro.brand}</p>
                                  </div>
                                  <CopyButton text={macro.brand} id={`brand-${macro.id}`} label="Brand" />
                                </div>
                              )}
                              {macro.description && (
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <label className="text-xs text-white/60 mb-1 block">Description:</label>
                                    <p className="text-sm text-white/80">{macro.description}</p>
                                  </div>
                                  <CopyButton text={macro.description} id={`desc-${macro.id}`} label="Description" />
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Text Club Macros */}
                  {results.textClubMacros.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                        💬 Text Club Macros ({results.textClubMacros.length})
                      </h3>
                      <div className="space-y-3">
                        {results.textClubMacros.map((macro) => (
                          <div
                            key={macro.id}
                            className="p-4 bg-white/5 rounded-lg border border-white/10"
                          >
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <label className="text-xs text-white/60 mb-1 block">Macro Name:</label>
                                  <p className="text-sm font-semibold text-white">{macro.macroName}</p>
                                </div>
                                <CopyButton text={macro.macroName} id={`name-${macro.id}`} label="Macro Name" />
                              </div>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <label className="text-xs text-white/60 mb-1 block">Macro Details:</label>
                                  <p className="text-sm text-white/80 whitespace-pre-wrap">{macro.macroDetails}</p>
                                </div>
                                <CopyButton text={macro.macroDetails} id={`details-${macro.id}`} label="Macro Details" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Product Inquiry QA */}
                  {results.productInquiryQAs.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                        ❓ Product Inquiry QA ({results.productInquiryQAs.length})
                      </h3>
                      <div className="space-y-3">
                        {results.productInquiryQAs.map((qa) => (
                          <div
                            key={qa.id}
                            className="p-4 bg-white/5 rounded-lg border border-white/10"
                          >
                            <div className="flex items-center gap-2 mb-3">
                              <span className="px-2 py-0.5 bg-green-500/20 text-green-300 rounded text-xs">
                                {qa.brand}
                              </span>
                              <span className="font-semibold text-white">{qa.product}</span>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <label className="text-xs text-white/60 mb-1 block">Brand:</label>
                                  <p className="text-sm text-white/80">{qa.brand}</p>
                                </div>
                                <CopyButton text={qa.brand} id={`brand-${qa.id}`} label="Brand" />
                              </div>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <label className="text-xs text-white/60 mb-1 block">Product:</label>
                                  <p className="text-sm text-white/80">{qa.product}</p>
                                </div>
                                <CopyButton text={qa.product} id={`product-${qa.id}`} label="Product" />
                              </div>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <label className="text-xs text-white/60 mb-1 block">Question:</label>
                                  <p className="text-sm text-white/80 whitespace-pre-wrap">{qa.question}</p>
                                </div>
                                <CopyButton text={qa.question} id={`question-${qa.id}`} label="Question" />
                              </div>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <label className="text-xs text-white/60 mb-1 block">Answer:</label>
                                  <p className="text-sm text-white/80 whitespace-pre-wrap">{qa.answer}</p>
                                </div>
                                <CopyButton text={qa.answer} id={`answer-${qa.id}`} label="Answer" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 text-xs text-white/60">
              {results && results.total > 0 && (
                <p>Found {results.total} result{results.total !== 1 ? "s" : ""}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

