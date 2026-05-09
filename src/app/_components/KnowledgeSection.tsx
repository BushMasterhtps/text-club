"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

type KnowledgeTab = "search" | "email" | "text" | "qa";

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

type EmailBrowseItem = SearchResult["emailMacros"][number];
type TextBrowseItem = SearchResult["textClubMacros"][number];
type QaBrowseItem = SearchResult["productInquiryQAs"][number];

const BROWSE_LIMIT = 40;

type FacetOption = { label: string; values: string[] };

function stableFacetValue(values: string[]): string {
  return JSON.stringify([...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })));
}

export default function KnowledgeSection() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<KnowledgeTab>("search");
  const wasOpenRef = useRef(false);

  // ——— Search All tab
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ——— Email browse
  const [emailBrandOptions, setEmailBrandOptions] = useState<FacetOption[]>([]);
  const [emailCaseTypeOptions, setEmailCaseTypeOptions] = useState<FacetOption[]>([]);
  /** null = any brand; else OR-match these exact DB strings (case/whitespace variants). */
  const [emailBrandValues, setEmailBrandValues] = useState<string[] | null>(null);
  const [emailCaseValues, setEmailCaseValues] = useState<string[] | null>(null);
  const [emailKeyword, setEmailKeyword] = useState("");
  const [emailItems, setEmailItems] = useState<EmailBrowseItem[]>([]);
  const [emailNextCursor, setEmailNextCursor] = useState<string | null>(null);
  const [emailHasMore, setEmailHasMore] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailFacetsLoading, setEmailFacetsLoading] = useState(false);

  // ——— Text Club browse
  const [textKeyword, setTextKeyword] = useState("");
  const [textItems, setTextItems] = useState<TextBrowseItem[]>([]);
  const [textNextCursor, setTextNextCursor] = useState<string | null>(null);
  const [textHasMore, setTextHasMore] = useState(false);
  const [textLoading, setTextLoading] = useState(false);

  // ——— Product QA browse
  const [qaBrandOptions, setQaBrandOptions] = useState<FacetOption[]>([]);
  const [qaProductOptions, setQaProductOptions] = useState<FacetOption[]>([]);
  const [qaBrandValues, setQaBrandValues] = useState<string[] | null>(null);
  const [qaProductValues, setQaProductValues] = useState<string[] | null>(null);
  const [qaKeyword, setQaKeyword] = useState("");
  const [qaItems, setQaItems] = useState<QaBrowseItem[]>([]);
  const [qaNextCursor, setQaNextCursor] = useState<string | null>(null);
  const [qaHasMore, setQaHasMore] = useState(false);
  const [qaLoading, setQaLoading] = useState(false);
  const [qaFacetsLoading, setQaFacetsLoading] = useState(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Restore last search only when the modal transitions from closed → open (not on tab switches).
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const saved = localStorage.getItem("knowledgeLastSearch");
      if (saved) setSearchQuery(saved);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeTab === "search") {
      const t = setTimeout(() => searchInputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [isOpen, activeTab]);

  // Global search debounce (Search All tab only)
  useEffect(() => {
    if (!isOpen || activeTab !== "search") return;

    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        void performSearch(searchQuery);
        localStorage.setItem("knowledgeLastSearch", searchQuery);
      } else {
        setResults(null);
        localStorage.removeItem("knowledgeLastSearch");
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, isOpen, activeTab]);

  const performSearch = async (query: string) => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/knowledge/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.success) setResults(data.data);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setSearchLoading(false);
    }
  };

  // Email facets: brands always global; case types scoped to selected brand cluster when set.
  useEffect(() => {
    if (!isOpen || activeTab !== "email") return;
    let cancelled = false;
    (async () => {
      setEmailFacetsLoading(true);
      try {
        let url = "/api/knowledge/facets?type=email-macros";
        if (emailBrandValues && emailBrandValues.length > 0) {
          url += `&brandValues=${encodeURIComponent(JSON.stringify(emailBrandValues))}`;
        }
        const res = await fetch(url);
        const data = await res.json();
        if (!cancelled && data.success) {
          const brandOpts = data.data.brandOptions ?? [];
          const caseOpts = data.data.caseTypeOptions ?? [];
          setEmailBrandOptions(brandOpts);
          setEmailCaseTypeOptions(caseOpts);
          setEmailCaseValues((prev) => {
            if (prev === null) return null;
            const valid = new Set(caseOpts.map((o: FacetOption) => stableFacetValue(o.values)));
            return valid.has(stableFacetValue(prev)) ? prev : null;
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setEmailFacetsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab, emailBrandValues]);

  // QA brand facets + products when brand cluster changes
  useEffect(() => {
    if (!isOpen || activeTab !== "qa") return;
    let cancelled = false;
    (async () => {
      setQaFacetsLoading(true);
      try {
        const brandRes = await fetch("/api/knowledge/facets?type=product-inquiry-qa");
        const brandData = await brandRes.json();
        if (!cancelled && brandData.success) {
          setQaBrandOptions(brandData.data.brandOptions ?? []);
        } else if (!cancelled && !brandRes.ok) {
          console.error("Product Q&A facets (brands) failed:", brandRes.status, brandData);
        }

        if (qaBrandValues && qaBrandValues.length > 0) {
          const bv = encodeURIComponent(JSON.stringify(qaBrandValues));
          const pRes = await fetch(`/api/knowledge/facets?type=product-inquiry-qa&brandValues=${bv}`);
          const pData = await pRes.json();
          if (!cancelled && pData.success) {
            setQaProductOptions(pData.data.productOptions ?? []);
          } else if (!cancelled && !pRes.ok) {
            console.error("Product Q&A facets (products) failed:", pRes.status, pData);
          }
        } else if (!cancelled) {
          setQaProductOptions([]);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setQaFacetsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab, qaBrandValues]);

  const buildBrowseUrl = useCallback(
    (type: string, params: Record<string, string>, cursor: string | null) => {
      const sp = new URLSearchParams({ type, limit: String(BROWSE_LIMIT) });
      Object.entries(params).forEach(([k, v]) => {
        if (v) sp.set(k, v);
      });
      if (cursor) sp.set("cursor", cursor);
      return `/api/knowledge/browse?${sp.toString()}`;
    },
    []
  );

  // Debounced email browse (reset)
  useEffect(() => {
    if (!isOpen || activeTab !== "email") return;
    const t = setTimeout(() => {
      void (async () => {
        setEmailLoading(true);
        try {
          const browseParams: Record<string, string> = {};
          if (emailKeyword.trim()) browseParams.q = emailKeyword.trim();
          if (emailBrandValues?.length) {
            browseParams.brandIn = JSON.stringify(emailBrandValues);
          }
          if (emailCaseValues?.length) {
            browseParams.caseTypeIn = JSON.stringify(emailCaseValues);
          }
          const url = buildBrowseUrl("email-macros", browseParams, null);
          const res = await fetch(url);
          const data = await res.json();
          if (data.success) {
            setEmailItems(data.data.items);
            setEmailNextCursor(data.data.nextCursor);
            setEmailHasMore(data.data.hasMore);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setEmailLoading(false);
        }
      })();
    }, 400);
    return () => clearTimeout(t);
  }, [isOpen, activeTab, emailBrandValues, emailCaseValues, emailKeyword, buildBrowseUrl]);

  // Debounced text browse
  useEffect(() => {
    if (!isOpen || activeTab !== "text") return;
    const t = setTimeout(() => {
      void (async () => {
        setTextLoading(true);
        try {
          const url = buildBrowseUrl("text-club-macros", { q: textKeyword }, null);
          const res = await fetch(url);
          const data = await res.json();
          if (data.success) {
            setTextItems(data.data.items);
            setTextNextCursor(data.data.nextCursor);
            setTextHasMore(data.data.hasMore);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setTextLoading(false);
        }
      })();
    }, 400);
    return () => clearTimeout(t);
  }, [isOpen, activeTab, textKeyword, buildBrowseUrl]);

  // Debounced QA browse
  useEffect(() => {
    if (!isOpen || activeTab !== "qa") return;
    const t = setTimeout(() => {
      void (async () => {
        setQaLoading(true);
        try {
          const browseParams: Record<string, string> = {};
          if (qaKeyword.trim()) browseParams.q = qaKeyword.trim();
          if (qaBrandValues?.length) {
            browseParams.brandIn = JSON.stringify(qaBrandValues);
          }
          if (qaProductValues?.length) {
            browseParams.productIn = JSON.stringify(qaProductValues);
          }
          const url = buildBrowseUrl("product-inquiry-qa", browseParams, null);
          const res = await fetch(url);
          const data = await res.json();
          if (data.success) {
            setQaItems(data.data.items);
            setQaNextCursor(data.data.nextCursor);
            setQaHasMore(data.data.hasMore);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setQaLoading(false);
        }
      })();
    }, 400);
    return () => clearTimeout(t);
  }, [isOpen, activeTab, qaBrandValues, qaProductValues, qaKeyword, buildBrowseUrl]);

  const loadMoreEmail = async () => {
    if (!emailNextCursor || emailLoading) return;
    setEmailLoading(true);
    try {
      const browseParams: Record<string, string> = {};
      if (emailKeyword.trim()) browseParams.q = emailKeyword.trim();
      if (emailBrandValues?.length) {
        browseParams.brandIn = JSON.stringify(emailBrandValues);
      }
      if (emailCaseValues?.length) {
        browseParams.caseTypeIn = JSON.stringify(emailCaseValues);
      }
      const url = buildBrowseUrl("email-macros", browseParams, emailNextCursor);
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        const incoming: EmailBrowseItem[] = data.data.items;
        setEmailItems((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          const merged = [...prev];
          for (const row of incoming) {
            if (!seen.has(row.id)) {
              seen.add(row.id);
              merged.push(row);
            }
          }
          return merged;
        });
        setEmailNextCursor(data.data.nextCursor);
        setEmailHasMore(data.data.hasMore);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setEmailLoading(false);
    }
  };

  const loadMoreText = async () => {
    if (!textNextCursor || textLoading) return;
    setTextLoading(true);
    try {
      const url = buildBrowseUrl("text-club-macros", { q: textKeyword }, textNextCursor);
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        const incoming: TextBrowseItem[] = data.data.items;
        setTextItems((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          const merged = [...prev];
          for (const row of incoming) {
            if (!seen.has(row.id)) {
              seen.add(row.id);
              merged.push(row);
            }
          }
          return merged;
        });
        setTextNextCursor(data.data.nextCursor);
        setTextHasMore(data.data.hasMore);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTextLoading(false);
    }
  };

  const loadMoreQa = async () => {
    if (!qaNextCursor || qaLoading) return;
    setQaLoading(true);
    try {
      const browseParams: Record<string, string> = {};
      if (qaKeyword.trim()) browseParams.q = qaKeyword.trim();
      if (qaBrandValues?.length) {
        browseParams.brandIn = JSON.stringify(qaBrandValues);
      }
      if (qaProductValues?.length) {
        browseParams.productIn = JSON.stringify(qaProductValues);
      }
      const url = buildBrowseUrl("product-inquiry-qa", browseParams, qaNextCursor);
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        const incoming: QaBrowseItem[] = data.data.items;
        setQaItems((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          const merged = [...prev];
          for (const row of incoming) {
            if (!seen.has(row.id)) {
              seen.add(row.id);
              merged.push(row);
            }
          }
          return merged;
        });
        setQaNextCursor(data.data.nextCursor);
        setQaHasMore(data.data.hasMore);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setQaLoading(false);
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
      type="button"
      onClick={() => copyToClipboard(text, id)}
      className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
      title={`Copy ${label}`}
    >
      {copiedId === id ? "✓ Copied" : "📋 Copy"}
    </button>
  );

  const tabBtn = (id: KnowledgeTab, label: string) => (
    <button
      type="button"
      key={id}
      onClick={() => setActiveTab(id)}
      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        activeTab === id
          ? "bg-blue-600 text-white"
          : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center text-2xl transition-all hover:scale-110"
        title="Knowledge Base"
      >
        📚
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col border border-white/20">
            <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
              <h2 className="text-xl font-semibold text-white">📚 Knowledge Base</h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-white/60 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            <div className="px-4 pt-3 pb-2 border-b border-white/10 flex flex-wrap gap-2 shrink-0">
              {tabBtn("search", "Search All")}
              {tabBtn("email", "Email Macros")}
              {tabBtn("text", "Text Club Macros")}
              {tabBtn("qa", "Product Q&A")}
            </div>

            <div className="flex-1 overflow-y-auto p-4 min-h-0">
              {activeTab === "search" && (
                <>
                  <div className="mb-4">
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search across all categories (e.g. 'Return Instructions', 'Lactobacillus')"
                      className="w-full px-4 py-2 bg-white/10 rounded-md text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {searchLoading ? (
                    <div className="text-center py-8 text-white/60">Searching...</div>
                  ) : !searchQuery.trim() ? (
                    <div className="text-center py-8 text-white/60">
                      Enter a search term to find macros and product information across all categories.
                    </div>
                  ) : results && results.total === 0 ? (
                    <div className="text-center py-8 text-white/60">No results found for &quot;{searchQuery}&quot;</div>
                  ) : results ? (
                    <div className="space-y-6">
                      {results.emailMacros.length > 0 && (
                        <div>
                          <h3 className="text-lg font-semibold text-white mb-3">
                            📧 Email Macros ({results.emailMacros.length})
                          </h3>
                          <div className="space-y-3">
                            {results.emailMacros.map((macro) => (
                              <div key={macro.id} className="p-4 bg-white/5 rounded-lg border border-white/10">
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
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
                                <div className="space-y-2">
                                  <div className="flex justify-between gap-2">
                                    <p className="text-sm text-white/80 whitespace-pre-wrap flex-1">{macro.macro}</p>
                                    <CopyButton text={macro.macro} id={`sm-${macro.id}`} label="Macro" />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {results.textClubMacros.length > 0 && (
                        <div>
                          <h3 className="text-lg font-semibold text-white mb-3">
                            💬 Text Club Macros ({results.textClubMacros.length})
                          </h3>
                          <div className="space-y-3">
                            {results.textClubMacros.map((macro) => (
                              <div key={macro.id} className="p-4 bg-white/5 rounded-lg border border-white/10">
                                <p className="text-sm font-semibold text-white mb-1">{macro.macroName}</p>
                                <div className="flex justify-between gap-2">
                                  <p className="text-sm text-white/80 whitespace-pre-wrap flex-1">
                                    {macro.macroDetails}
                                  </p>
                                  <CopyButton text={macro.macroDetails} id={`st-${macro.id}`} label="Details" />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {results.productInquiryQAs.length > 0 && (
                        <div>
                          <h3 className="text-lg font-semibold text-white mb-3">
                            ❓ Product Inquiry QA ({results.productInquiryQAs.length})
                          </h3>
                          <div className="space-y-3">
                            {results.productInquiryQAs.map((qa) => (
                              <div key={qa.id} className="p-4 bg-white/5 rounded-lg border border-white/10">
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                  <span className="px-2 py-0.5 bg-green-500/20 text-green-300 rounded text-xs">
                                    {qa.brand}
                                  </span>
                                  <span className="font-semibold text-white">{qa.product}</span>
                                </div>
                                <p className="text-sm text-white/70 mb-1">{qa.question}</p>
                                <div className="flex justify-between gap-2">
                                  <p className="text-sm text-white/80 whitespace-pre-wrap flex-1">{qa.answer}</p>
                                  <CopyButton text={qa.answer} id={`sq-${qa.id}`} label="Answer" />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </>
              )}

              {activeTab === "email" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-white/50 mb-1">Brand</label>
                      <select
                        value={emailBrandValues === null ? "" : stableFacetValue(emailBrandValues)}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) setEmailBrandValues(null);
                          else {
                            try {
                              const parsed = JSON.parse(v) as unknown;
                              setEmailBrandValues(
                                Array.isArray(parsed) && parsed.every((x) => typeof x === "string")
                                  ? (parsed as string[])
                                  : null
                              );
                            } catch {
                              setEmailBrandValues(null);
                            }
                          }
                        }}
                        className="w-full px-3 py-2 bg-white/10 rounded-md text-white border border-white/10"
                        disabled={emailFacetsLoading}
                      >
                        <option value="">Any brand</option>
                        {emailBrandOptions.map((opt, i) => (
                          <option key={i} value={stableFacetValue(opt.values)}>
                            {opt.label}
                            {opt.values.length > 1 ? ` (${opt.values.length} variants)` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-white/50 mb-1">Case type / subcategory</label>
                      <select
                        value={emailCaseValues === null ? "" : stableFacetValue(emailCaseValues)}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) setEmailCaseValues(null);
                          else {
                            try {
                              const parsed = JSON.parse(v) as unknown;
                              setEmailCaseValues(
                                Array.isArray(parsed) && parsed.every((x) => typeof x === "string")
                                  ? (parsed as string[])
                                  : null
                              );
                            } catch {
                              setEmailCaseValues(null);
                            }
                          }
                        }}
                        className="w-full px-3 py-2 bg-white/10 rounded-md text-white border border-white/10"
                        disabled={emailFacetsLoading}
                      >
                        <option value="">Any case type</option>
                        {emailCaseTypeOptions.map((opt, i) => (
                          <option key={i} value={stableFacetValue(opt.values)}>
                            {opt.label}
                            {opt.values.length > 1 ? ` (${opt.values.length} variants)` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-white/50 mb-1">Keyword (optional)</label>
                    <input
                      type="text"
                      value={emailKeyword}
                      onChange={(e) => setEmailKeyword(e.target.value)}
                      placeholder="Search within name, macro body, or description…"
                      className="w-full px-3 py-2 bg-white/10 rounded-md text-white placeholder-white/40 border border-white/10"
                    />
                  </div>
                  {emailFacetsLoading && (
                    <p className="text-xs text-white/50">Loading filter options…</p>
                  )}
                  {emailLoading && emailItems.length === 0 ? (
                    <div className="text-center py-8 text-white/60">Loading…</div>
                  ) : emailItems.length === 0 ? (
                    <div className="text-center py-8 text-white/60">No macros match these filters.</div>
                  ) : (
                    <div className="space-y-3">
                      {emailItems.map((macro) => (
                        <div key={macro.id} className="p-4 bg-white/5 rounded-lg border border-white/10">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
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
                          <div className="flex justify-between gap-2">
                            <p className="text-sm text-white/80 whitespace-pre-wrap flex-1">{macro.macro}</p>
                            <CopyButton text={macro.macro} id={`em-${macro.id}`} label="Macro" />
                          </div>
                        </div>
                      ))}
                      {emailHasMore && (
                        <button
                          type="button"
                          onClick={() => void loadMoreEmail()}
                          disabled={emailLoading}
                          className="w-full py-2 text-sm bg-white/10 hover:bg-white/15 text-white rounded-md border border-white/10 disabled:opacity-50"
                        >
                          {emailLoading ? "Loading…" : "Load more"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "text" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-white/50 mb-1">Keyword (optional)</label>
                    <input
                      type="text"
                      value={textKeyword}
                      onChange={(e) => setTextKeyword(e.target.value)}
                      placeholder="Search macro name or details…"
                      className="w-full px-3 py-2 bg-white/10 rounded-md text-white placeholder-white/40 border border-white/10"
                    />
                  </div>
                  {textLoading && textItems.length === 0 ? (
                    <div className="text-center py-8 text-white/60">Loading…</div>
                  ) : textItems.length === 0 ? (
                    <div className="text-center py-8 text-white/60">No text club macros found.</div>
                  ) : (
                    <div className="space-y-3">
                      {textItems.map((macro) => (
                        <div key={macro.id} className="p-4 bg-white/5 rounded-lg border border-white/10">
                          <p className="text-sm font-semibold text-white mb-1">{macro.macroName}</p>
                          <div className="flex justify-between gap-2">
                            <p className="text-sm text-white/80 whitespace-pre-wrap flex-1">{macro.macroDetails}</p>
                            <CopyButton text={macro.macroDetails} id={`tx-${macro.id}`} label="Details" />
                          </div>
                        </div>
                      ))}
                      {textHasMore && (
                        <button
                          type="button"
                          onClick={() => void loadMoreText()}
                          disabled={textLoading}
                          className="w-full py-2 text-sm bg-white/10 hover:bg-white/15 text-white rounded-md border border-white/10 disabled:opacity-50"
                        >
                          {textLoading ? "Loading…" : "Load more"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "qa" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-white/50 mb-1">Brand</label>
                      <select
                        value={qaBrandValues === null ? "" : stableFacetValue(qaBrandValues)}
                        onChange={(e) => {
                          const v = e.target.value;
                          setQaProductValues(null);
                          if (!v) setQaBrandValues(null);
                          else {
                            try {
                              const parsed = JSON.parse(v) as unknown;
                              setQaBrandValues(
                                Array.isArray(parsed) && parsed.every((x) => typeof x === "string")
                                  ? (parsed as string[])
                                  : null
                              );
                            } catch {
                              setQaBrandValues(null);
                            }
                          }
                        }}
                        className="w-full px-3 py-2 bg-white/10 rounded-md text-white border border-white/10"
                        disabled={qaFacetsLoading}
                      >
                        <option value="">Any brand</option>
                        {qaBrandOptions.map((opt, i) => (
                          <option key={`${stableFacetValue(opt.values)}-${i}`} value={stableFacetValue(opt.values)}>
                            {opt.label}
                            {opt.values.length > 1 ? ` (${opt.values.length} variants)` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-white/50 mb-1">Product</label>
                      <select
                        value={qaProductValues === null ? "" : stableFacetValue(qaProductValues)}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) setQaProductValues(null);
                          else {
                            try {
                              const parsed = JSON.parse(v) as unknown;
                              setQaProductValues(
                                Array.isArray(parsed) && parsed.every((x) => typeof x === "string")
                                  ? (parsed as string[])
                                  : null
                              );
                            } catch {
                              setQaProductValues(null);
                            }
                          }
                        }}
                        className="w-full px-3 py-2 bg-white/10 rounded-md text-white border border-white/10"
                        disabled={qaFacetsLoading || !qaBrandValues?.length}
                      >
                        <option value="">
                          {qaBrandValues?.length ? "Any product (this brand)" : "Select a brand first"}
                        </option>
                        {qaProductOptions.map((opt, i) => (
                          <option key={`${stableFacetValue(opt.values)}-${i}`} value={stableFacetValue(opt.values)}>
                            {opt.label}
                            {opt.values.length > 1 ? ` (${opt.values.length} variants)` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-white/50 mb-1">Keyword (optional)</label>
                    <input
                      type="text"
                      value={qaKeyword}
                      onChange={(e) => setQaKeyword(e.target.value)}
                      placeholder="Search question, answer, brand, or product…"
                      className="w-full px-3 py-2 bg-white/10 rounded-md text-white placeholder-white/40 border border-white/10"
                    />
                  </div>
                  {qaLoading && qaItems.length === 0 ? (
                    <div className="text-center py-8 text-white/60">Loading…</div>
                  ) : qaItems.length === 0 ? (
                    <div className="text-center py-8 text-white/60">No Q&A rows match these filters.</div>
                  ) : (
                    <div className="space-y-3">
                      {qaItems.map((qa) => (
                        <div key={qa.id} className="p-4 bg-white/5 rounded-lg border border-white/10">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="px-2 py-0.5 bg-green-500/20 text-green-300 rounded text-xs">
                              {qa.brand}
                            </span>
                            <span className="font-semibold text-white">{qa.product}</span>
                          </div>
                          <p className="text-sm text-white/70 mb-1 whitespace-pre-wrap">{qa.question}</p>
                          <div className="flex justify-between gap-2">
                            <p className="text-sm text-white/80 whitespace-pre-wrap flex-1">{qa.answer}</p>
                            <CopyButton text={qa.answer} id={`qa-${qa.id}`} label="Answer" />
                          </div>
                        </div>
                      ))}
                      {qaHasMore && (
                        <button
                          type="button"
                          onClick={() => void loadMoreQa()}
                          disabled={qaLoading}
                          className="w-full py-2 text-sm bg-white/10 hover:bg-white/15 text-white rounded-md border border-white/10 disabled:opacity-50"
                        >
                          {qaLoading ? "Loading…" : "Load more"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/10 text-xs text-white/60 shrink-0">
              {activeTab === "search" && results && results.total > 0 && (
                <p>Found {results.total} result{results.total !== 1 ? "s" : ""}</p>
              )}
              {activeTab === "email" && emailItems.length > 0 && (
                <p>
                  Showing {emailItems.length} macro{emailItems.length !== 1 ? "s" : ""}
                  {emailHasMore ? " · more available" : ""}
                </p>
              )}
              {activeTab === "text" && textItems.length > 0 && (
                <p>
                  Showing {textItems.length} macro{textItems.length !== 1 ? "s" : ""}
                  {textHasMore ? " · more available" : ""}
                </p>
              )}
              {activeTab === "qa" && qaItems.length > 0 && (
                <p>
                  Showing {qaItems.length} entr{qaItems.length !== 1 ? "ies" : "y"}
                  {qaHasMore ? " · more available" : ""}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
