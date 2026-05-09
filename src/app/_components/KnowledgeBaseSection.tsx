"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";

type ResourceType = "email-macros" | "text-club-macros" | "product-inquiry-qa";

interface EmailMacro {
  id: string;
  macroName: string;
  macro: string;
  caseType: string | null;
  brand: string | null;
  description: string | null;
  createdAt: string;
}

interface TextClubMacro {
  id: string;
  macroName: string;
  macroDetails: string;
  createdAt: string;
}

interface ProductInquiryQA {
  id: string;
  brand: string;
  product: string;
  question: string;
  answer: string;
  createdAt: string;
}

const BROWSE_LIMIT = 50;

type FacetOption = { label: string; values: string[] };

function stableFacetValue(values: string[]): string {
  return JSON.stringify([...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })));
}

function normalizeEmailRows(rows: unknown[]): EmailMacro[] {
  return (rows as EmailMacro[]).map((r) => ({
    ...r,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date(r.createdAt as unknown as Date).toISOString(),
  }));
}

function normalizeTextRows(rows: unknown[]): TextClubMacro[] {
  return (rows as TextClubMacro[]).map((r) => ({
    ...r,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date(r.createdAt as unknown as Date).toISOString(),
  }));
}

function normalizeQaRows(rows: unknown[]): ProductInquiryQA[] {
  return (rows as ProductInquiryQA[]).map((r) => ({
    ...r,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date(r.createdAt as unknown as Date).toISOString(),
  }));
}

export default function KnowledgeBaseSection() {
  const [activeResource, setActiveResource] = useState<ResourceType>("email-macros");
  const [emailMacros, setEmailMacros] = useState<EmailMacro[]>([]);
  const [textClubMacros, setTextClubMacros] = useState<TextClubMacro[]>([]);
  const [productInquiryQAs, setProductInquiryQAs] = useState<ProductInquiryQA[]>([]);

  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editForms, setEditForms] = useState<Record<string, unknown>>({});

  // Email browse / facets
  const [emailBrandOptions, setEmailBrandOptions] = useState<FacetOption[]>([]);
  const [emailCaseTypeOptions, setEmailCaseTypeOptions] = useState<FacetOption[]>([]);
  const [emailBrandValues, setEmailBrandValues] = useState<string[] | null>(null);
  const [emailCaseValues, setEmailCaseValues] = useState<string[] | null>(null);
  const [emailKeyword, setEmailKeyword] = useState("");
  const [emailNextCursor, setEmailNextCursor] = useState<string | null>(null);
  const [emailHasMore, setEmailHasMore] = useState(false);
  const [emailFacetsLoading, setEmailFacetsLoading] = useState(false);

  // QA browse / facets
  const [qaBrandOptions, setQaBrandOptions] = useState<FacetOption[]>([]);
  const [qaProductOptions, setQaProductOptions] = useState<FacetOption[]>([]);
  const [qaBrandValues, setQaBrandValues] = useState<string[] | null>(null);
  const [qaProductValues, setQaProductValues] = useState<string[] | null>(null);
  const [qaKeyword, setQaKeyword] = useState("");
  const [qaNextCursor, setQaNextCursor] = useState<string | null>(null);
  const [qaHasMore, setQaHasMore] = useState(false);
  const [qaFacetsLoading, setQaFacetsLoading] = useState(false);

  // Text browse
  const [textKeyword, setTextKeyword] = useState("");
  const [textNextCursor, setTextNextCursor] = useState<string | null>(null);
  const [textHasMore, setTextHasMore] = useState(false);

  const [emailMacroForm, setEmailMacroForm] = useState({
    macroName: "",
    macro: "",
    caseType: "",
    brand: "",
    description: "",
  });

  const [textClubMacroForm, setTextClubMacroForm] = useState({
    macroName: "",
    macroDetails: "",
  });

  const [productQAForm, setProductQAForm] = useState({
    brand: "",
    product: "",
    question: "",
    answer: "",
  });

  const buildBrowseUrl = useCallback((type: string, params: Record<string, string>, cursor: string | null) => {
    const sp = new URLSearchParams({ type, limit: String(BROWSE_LIMIT) });
    Object.entries(params).forEach(([k, v]) => {
      if (v) sp.set(k, v);
    });
    if (cursor) sp.set("cursor", cursor);
    return `/api/knowledge/browse?${sp.toString()}`;
  }, []);

  /** Refetch first page with latest filter state (after mutations). */
  const refreshListFirstPage = useCallback(async () => {
    if (activeResource === "email-macros") {
      setListLoading(true);
      try {
        const browseParams: Record<string, string> = {};
        if (emailKeyword.trim()) browseParams.q = emailKeyword.trim();
        if (emailBrandValues?.length) browseParams.brandIn = JSON.stringify(emailBrandValues);
        if (emailCaseValues?.length) browseParams.caseTypeIn = JSON.stringify(emailCaseValues);
        const res = await fetch(buildBrowseUrl("email-macros", browseParams, null));
        const data = await res.json();
        if (data.success) {
          setEmailMacros(normalizeEmailRows(data.data.items));
          setEmailNextCursor(data.data.nextCursor);
          setEmailHasMore(data.data.hasMore);
        }
      } finally {
        setListLoading(false);
      }
    } else if (activeResource === "text-club-macros") {
      setListLoading(true);
      try {
        const res = await fetch(buildBrowseUrl("text-club-macros", { q: textKeyword.trim() }, null));
        const data = await res.json();
        if (data.success) {
          setTextClubMacros(normalizeTextRows(data.data.items));
          setTextNextCursor(data.data.nextCursor);
          setTextHasMore(data.data.hasMore);
        }
      } finally {
        setListLoading(false);
      }
    } else if (activeResource === "product-inquiry-qa") {
      setListLoading(true);
      try {
        const browseParams: Record<string, string> = {};
        if (qaKeyword.trim()) browseParams.q = qaKeyword.trim();
        if (qaBrandValues?.length) browseParams.brandIn = JSON.stringify(qaBrandValues);
        if (qaProductValues?.length) browseParams.productIn = JSON.stringify(qaProductValues);
        const res = await fetch(buildBrowseUrl("product-inquiry-qa", browseParams, null));
        const data = await res.json();
        if (data.success) {
          setProductInquiryQAs(normalizeQaRows(data.data.items));
          setQaNextCursor(data.data.nextCursor);
          setQaHasMore(data.data.hasMore);
        }
      } finally {
        setListLoading(false);
      }
    }
  }, [
    activeResource,
    buildBrowseUrl,
    emailBrandValues,
    emailCaseValues,
    emailKeyword,
    qaBrandValues,
    qaProductValues,
    qaKeyword,
    textKeyword,
  ]);

  // Tab / filter reset: clear selection and editing; reset filters when switching resource tab.
  useEffect(() => {
    setSelectedIds(new Set());
    setEditingId(null);
    setEditForms({});
    setEmailBrandValues(null);
    setEmailCaseValues(null);
    setEmailKeyword("");
    setEmailMacros([]);
    setEmailNextCursor(null);
    setEmailHasMore(false);
    setQaBrandValues(null);
    setQaProductValues(null);
    setQaKeyword("");
    setProductInquiryQAs([]);
    setQaNextCursor(null);
    setQaHasMore(false);
    setTextKeyword("");
    setTextClubMacros([]);
    setTextNextCursor(null);
    setTextHasMore(false);
  }, [activeResource]);

  // Email facets
  useEffect(() => {
    if (activeResource !== "email-macros") return;
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
          setEmailBrandOptions(data.data.brandOptions ?? []);
          setEmailCaseTypeOptions(data.data.caseTypeOptions ?? []);
          setEmailCaseValues((prev) => {
            if (prev === null) return null;
            const valid = new Set((data.data.caseTypeOptions as FacetOption[]).map((o) => stableFacetValue(o.values)));
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
  }, [activeResource, emailBrandValues]);

  // Clear selection when email / QA / text filters change (not on tab — already cleared on tab).
  const prevEmailFilterKey = useRef<string>("");
  const prevQaFilterKey = useRef<string>("");
  const prevTextKeyword = useRef<string>("");

  useEffect(() => {
    const key = `${stableFacetValue(emailBrandValues ?? [])}|${stableFacetValue(emailCaseValues ?? [])}|${emailKeyword}`;
    if (prevEmailFilterKey.current !== "" && prevEmailFilterKey.current !== key) {
      setSelectedIds(new Set());
      setEditingId(null);
      setEditForms({});
    }
    prevEmailFilterKey.current = key;
  }, [emailBrandValues, emailCaseValues, emailKeyword]);

  useEffect(() => {
    const key = `${stableFacetValue(qaBrandValues ?? [])}|${stableFacetValue(qaProductValues ?? [])}|${qaKeyword}`;
    if (prevQaFilterKey.current !== "" && prevQaFilterKey.current !== key) {
      setSelectedIds(new Set());
      setEditingId(null);
      setEditForms({});
    }
    prevQaFilterKey.current = key;
  }, [qaBrandValues, qaProductValues, qaKeyword]);

  useEffect(() => {
    if (prevTextKeyword.current !== "" && prevTextKeyword.current !== textKeyword) {
      setSelectedIds(new Set());
      setEditingId(null);
      setEditForms({});
    }
    prevTextKeyword.current = textKeyword;
  }, [textKeyword]);

  // Debounced email list
  useEffect(() => {
    if (activeResource !== "email-macros") return;
    const t = setTimeout(() => {
      void (async () => {
        setListLoading(true);
        try {
          const browseParams: Record<string, string> = {};
          if (emailKeyword.trim()) browseParams.q = emailKeyword.trim();
          if (emailBrandValues?.length) browseParams.brandIn = JSON.stringify(emailBrandValues);
          if (emailCaseValues?.length) browseParams.caseTypeIn = JSON.stringify(emailCaseValues);
          const res = await fetch(buildBrowseUrl("email-macros", browseParams, null));
          const data = await res.json();
          if (data.success) {
            setEmailMacros(normalizeEmailRows(data.data.items));
            setEmailNextCursor(data.data.nextCursor);
            setEmailHasMore(data.data.hasMore);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setListLoading(false);
        }
      })();
    }, 400);
    return () => clearTimeout(t);
  }, [activeResource, emailBrandValues, emailCaseValues, emailKeyword, buildBrowseUrl]);

  // QA facets
  useEffect(() => {
    if (activeResource !== "product-inquiry-qa") return;
    let cancelled = false;
    (async () => {
      setQaFacetsLoading(true);
      try {
        const brandRes = await fetch("/api/knowledge/facets?type=product-inquiry-qa");
        const brandData = await brandRes.json();
        if (!cancelled && brandData.success) {
          setQaBrandOptions(brandData.data.brandOptions ?? []);
        }
        if (qaBrandValues && qaBrandValues.length > 0) {
          const bv = encodeURIComponent(JSON.stringify(qaBrandValues));
          const pRes = await fetch(`/api/knowledge/facets?type=product-inquiry-qa&brandValues=${bv}`);
          const pData = await pRes.json();
          if (!cancelled && pData.success) {
            setQaProductOptions(pData.data.productOptions ?? []);
            setQaProductValues((prev) => {
              if (prev === null) return null;
              const valid = new Set((pData.data.productOptions as FacetOption[]).map((o) => stableFacetValue(o.values)));
              return valid.has(stableFacetValue(prev)) ? prev : null;
            });
          }
        } else if (!cancelled) {
          setQaProductOptions([]);
          setQaProductValues(null);
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
  }, [activeResource, qaBrandValues]);

  // Debounced QA list
  useEffect(() => {
    if (activeResource !== "product-inquiry-qa") return;
    const t = setTimeout(() => {
      void (async () => {
        setListLoading(true);
        try {
          const browseParams: Record<string, string> = {};
          if (qaKeyword.trim()) browseParams.q = qaKeyword.trim();
          if (qaBrandValues?.length) browseParams.brandIn = JSON.stringify(qaBrandValues);
          if (qaProductValues?.length) browseParams.productIn = JSON.stringify(qaProductValues);
          const res = await fetch(buildBrowseUrl("product-inquiry-qa", browseParams, null));
          const data = await res.json();
          if (data.success) {
            setProductInquiryQAs(normalizeQaRows(data.data.items));
            setQaNextCursor(data.data.nextCursor);
            setQaHasMore(data.data.hasMore);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setListLoading(false);
        }
      })();
    }, 400);
    return () => clearTimeout(t);
  }, [activeResource, qaBrandValues, qaProductValues, qaKeyword, buildBrowseUrl]);

  // Debounced text list
  useEffect(() => {
    if (activeResource !== "text-club-macros") return;
    const t = setTimeout(() => {
      void (async () => {
        setListLoading(true);
        try {
          const res = await fetch(buildBrowseUrl("text-club-macros", { q: textKeyword.trim() }, null));
          const data = await res.json();
          if (data.success) {
            setTextClubMacros(normalizeTextRows(data.data.items));
            setTextNextCursor(data.data.nextCursor);
            setTextHasMore(data.data.hasMore);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setListLoading(false);
        }
      })();
    }, 400);
    return () => clearTimeout(t);
  }, [activeResource, textKeyword, buildBrowseUrl]);

  const loadMoreEmail = async () => {
    if (!emailNextCursor || listLoading) return;
    setListLoading(true);
    try {
      const browseParams: Record<string, string> = {};
      if (emailKeyword.trim()) browseParams.q = emailKeyword.trim();
      if (emailBrandValues?.length) browseParams.brandIn = JSON.stringify(emailBrandValues);
      if (emailCaseValues?.length) browseParams.caseTypeIn = JSON.stringify(emailCaseValues);
      const res = await fetch(buildBrowseUrl("email-macros", browseParams, emailNextCursor));
      const data = await res.json();
      if (data.success) {
        const incoming = normalizeEmailRows(data.data.items);
        setEmailMacros((prev) => [...prev, ...incoming]);
        setEmailNextCursor(data.data.nextCursor);
        setEmailHasMore(data.data.hasMore);
      }
    } finally {
      setListLoading(false);
    }
  };

  const loadMoreQa = async () => {
    if (!qaNextCursor || listLoading) return;
    setListLoading(true);
    try {
      const browseParams: Record<string, string> = {};
      if (qaKeyword.trim()) browseParams.q = qaKeyword.trim();
      if (qaBrandValues?.length) browseParams.brandIn = JSON.stringify(qaBrandValues);
      if (qaProductValues?.length) browseParams.productIn = JSON.stringify(qaProductValues);
      const res = await fetch(buildBrowseUrl("product-inquiry-qa", browseParams, qaNextCursor));
      const data = await res.json();
      if (data.success) {
        const incoming = normalizeQaRows(data.data.items);
        setProductInquiryQAs((prev) => [...prev, ...incoming]);
        setQaNextCursor(data.data.nextCursor);
        setQaHasMore(data.data.hasMore);
      }
    } finally {
      setListLoading(false);
    }
  };

  const loadMoreText = async () => {
    if (!textNextCursor || listLoading) return;
    setListLoading(true);
    try {
      const res = await fetch(buildBrowseUrl("text-club-macros", { q: textKeyword.trim() }, textNextCursor));
      const data = await res.json();
      if (data.success) {
        const incoming = normalizeTextRows(data.data.items);
        setTextClubMacros((prev) => [...prev, ...incoming]);
        setTextNextCursor(data.data.nextCursor);
        setTextHasMore(data.data.hasMore);
      }
    } finally {
      setListLoading(false);
    }
  };

  const handleCSVImport = async (file: File) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      let endpoint = "";
      if (activeResource === "email-macros") {
        endpoint = "/api/knowledge/email-macros";
      } else if (activeResource === "text-club-macros") {
        endpoint = "/api/knowledge/text-club-macros";
      } else if (activeResource === "product-inquiry-qa") {
        endpoint = "/api/knowledge/product-inquiry-qa";
      }

      const res = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        let errorMessage = `HTTP error! Status: ${res.status}`;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Expected JSON response, but received ${contentType || "no content type"}. Response: ${text.substring(0, 200)}`);
      }

      const data = await res.json();
      if (data.success) {
        let message = `✅ Imported ${data.imported} items`;
        if (data.errors > 0) {
          message += `\n\n⚠️ ${data.errors} errors occurred`;
          if (data.errorDetails && data.errorDetails.length > 0) {
            message += `\n\nError details:\n${data.errorDetails.slice(0, 5).join("\n")}`;
            if (data.errorDetails.length > 5) {
              message += `\n... and ${data.errorDetails.length - 5} more`;
            }
          }
        }
        alert(message);
        await refreshListFirstPage();
      } else {
        alert(`❌ Import failed: ${data.error || "Unknown error"}`);
      }
    } catch (error: unknown) {
      console.error("Import error:", error);
      alert(`❌ Import failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    setLoading(true);
    try {
      let endpoint = "";
      let body: Record<string, string> = {};

      if (activeResource === "email-macros") {
        endpoint = "/api/knowledge/email-macros";
        body = emailMacroForm;
        if (!body.macroName || !body.macro) {
          alert("❌ Macro Name and Macro are required");
          setLoading(false);
          return;
        }
      } else if (activeResource === "text-club-macros") {
        endpoint = "/api/knowledge/text-club-macros";
        body = textClubMacroForm;
        if (!body.macroName || !body.macroDetails) {
          alert("❌ Macro Name and Macro Details are required");
          setLoading(false);
          return;
        }
      } else if (activeResource === "product-inquiry-qa") {
        endpoint = "/api/knowledge/product-inquiry-qa";
        body = productQAForm;
        if (!body.brand || !body.product || !body.question || !body.answer) {
          alert("❌ Brand, Product, Question, and Answer are required");
          setLoading(false);
          return;
        }
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        alert("✅ Created successfully");
        setEmailMacroForm({ macroName: "", macro: "", caseType: "", brand: "", description: "" });
        setTextClubMacroForm({ macroName: "", macroDetails: "" });
        setProductQAForm({ brand: "", product: "", question: "", answer: "" });
        await refreshListFirstPage();
      } else {
        alert(`❌ Failed: ${data.error}`);
      }
    } catch (error) {
      console.error("Create error:", error);
      alert("❌ Failed to create");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;

    setLoading(true);
    try {
      let endpoint = "";
      if (activeResource === "email-macros") {
        endpoint = "/api/knowledge/email-macros";
      } else if (activeResource === "text-club-macros") {
        endpoint = "/api/knowledge/text-club-macros";
      } else if (activeResource === "product-inquiry-qa") {
        endpoint = "/api/knowledge/product-inquiry-qa";
      }

      const res = await fetch(`${endpoint}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        alert("✅ Deleted successfully");
        setSelectedIds((prev) => {
          const n = new Set(prev);
          n.delete(id);
          return n;
        });
        await refreshListFirstPage();
      } else {
        alert(`❌ Failed: ${data.error}`);
      }
    } catch (error) {
      console.error("Delete error:", error);
      alert("❌ Failed to delete");
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} loaded item(s)?`)) return;

    setLoading(true);
    try {
      let endpoint = "";
      if (activeResource === "email-macros") {
        endpoint = "/api/knowledge/email-macros";
      } else if (activeResource === "text-club-macros") {
        endpoint = "/api/knowledge/text-club-macros";
      } else if (activeResource === "product-inquiry-qa") {
        endpoint = "/api/knowledge/product-inquiry-qa";
      }

      const res = await fetch(`${endpoint}?ids=${Array.from(selectedIds).join(",")}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        alert(`✅ Deleted ${data.deleted} items`);
        setSelectedIds(new Set());
        await refreshListFirstPage();
      } else {
        alert(`❌ Failed: ${data.error}`);
      }
    } catch (error) {
      console.error("Bulk delete error:", error);
      alert("❌ Failed to delete");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex space-x-1 bg-white/5 rounded-lg p-1">
        <button
          type="button"
          onClick={() => setActiveResource("email-macros")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeResource === "email-macros" ? "bg-white/10 text-white" : "text-white/60 hover:text-white/80"
          }`}
        >
          📧 Email Macros
        </button>
        <button
          type="button"
          onClick={() => setActiveResource("text-club-macros")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeResource === "text-club-macros" ? "bg-white/10 text-white" : "text-white/60 hover:text-white/80"
          }`}
        >
          💬 Text Club Macros
        </button>
        <button
          type="button"
          onClick={() => setActiveResource("product-inquiry-qa")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeResource === "product-inquiry-qa" ? "bg-white/10 text-white" : "text-white/60 hover:text-white/80"
          }`}
        >
          ❓ Product Inquiry QA
        </button>
      </div>

      {activeResource === "email-macros" && (
        <Card className="p-5 space-y-4">
          <h2 className="text-xl font-semibold text-white">📧 Email Macros</h2>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/80">CSV Import</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleCSVImport(file);
              }}
              className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm"
            />
            <p className="text-xs text-white/60">
              CSV columns: Macro Name, Macro, Case Type/ Subcategory, Brand, What the macro is for
            </p>
          </div>

          <div className="space-y-3 border-t border-white/10 pt-4">
            <h3 className="text-md font-semibold text-white">Add New Email Macro</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-white/60 mb-1">Macro Name *</label>
                <input
                  type="text"
                  value={emailMacroForm.macroName}
                  onChange={(e) => setEmailMacroForm({ ...emailMacroForm, macroName: e.target.value })}
                  className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1">Brand</label>
                <input
                  type="text"
                  value={emailMacroForm.brand}
                  onChange={(e) => setEmailMacroForm({ ...emailMacroForm, brand: e.target.value })}
                  className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1">Case Type/Subcategory</label>
                <input
                  type="text"
                  value={emailMacroForm.caseType}
                  onChange={(e) => setEmailMacroForm({ ...emailMacroForm, caseType: e.target.value })}
                  className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1">What the macro is for</label>
                <input
                  type="text"
                  value={emailMacroForm.description}
                  onChange={(e) => setEmailMacroForm({ ...emailMacroForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-white/60 mb-1">Macro *</label>
                <textarea
                  value={emailMacroForm.macro}
                  onChange={(e) => setEmailMacroForm({ ...emailMacroForm, macro: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm"
                />
              </div>
            </div>
            <SmallButton onClick={() => void handleCreate()} disabled={loading}>
              Add Email Macro
            </SmallButton>
          </div>

          <div className="border-t border-white/10 pt-4 space-y-3">
            <h3 className="text-md font-semibold text-white">Browse & edit</h3>
            <p className="text-xs text-white/50">
              Lists load at most {BROWSE_LIMIT} rows per request. Use filters and Load more. Selection applies only to
              loaded rows.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-white/50 mb-1">Brand</label>
                <select
                  value={emailBrandValues === null ? "" : stableFacetValue(emailBrandValues)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEmailCaseValues(null);
                    if (!v) setEmailBrandValues(null);
                    else {
                      try {
                        const parsed = JSON.parse(v) as unknown;
                        setEmailBrandValues(
                          Array.isArray(parsed) && parsed.every((x) => typeof x === "string") ? (parsed as string[]) : null
                        );
                      } catch {
                        setEmailBrandValues(null);
                      }
                    }
                  }}
                  className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm border border-white/10"
                  disabled={emailFacetsLoading}
                >
                  <option value="">Any brand</option>
                  {emailBrandOptions.map((opt, i) => (
                    <option key={`${stableFacetValue(opt.values)}-${i}`} value={stableFacetValue(opt.values)}>
                      {opt.label}
                      {opt.values.length > 1 ? ` (${opt.values.length} variants)` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Case type</label>
                <select
                  value={emailCaseValues === null ? "" : stableFacetValue(emailCaseValues)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) setEmailCaseValues(null);
                    else {
                      try {
                        const parsed = JSON.parse(v) as unknown;
                        setEmailCaseValues(
                          Array.isArray(parsed) && parsed.every((x) => typeof x === "string") ? (parsed as string[]) : null
                        );
                      } catch {
                        setEmailCaseValues(null);
                      }
                    }
                  }}
                  className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm border border-white/10"
                  disabled={emailFacetsLoading}
                >
                  <option value="">Any case type</option>
                  {emailCaseTypeOptions.map((opt, i) => (
                    <option key={`${stableFacetValue(opt.values)}-${i}`} value={stableFacetValue(opt.values)}>
                      {opt.label}
                      {opt.values.length > 1 ? ` (${opt.values.length} variants)` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-white/50 mb-1">Keyword</label>
                <input
                  type="text"
                  value={emailKeyword}
                  onChange={(e) => setEmailKeyword(e.target.value)}
                  placeholder="Search name, macro, description, brand, case type…"
                  className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm border border-white/10"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-white/70">
                Showing {emailMacros.length} loaded
                {emailHasMore ? " · more on next page" : ""}
                {listLoading ? " · loading…" : ""}
              </div>
              <div className="flex flex-wrap gap-2">
                <SmallButton
                  type="button"
                  onClick={() => setSelectedIds(new Set(emailMacros.map((m) => m.id)))}
                  disabled={emailMacros.length === 0 || listLoading}
                  className="bg-white/10 hover:bg-white/15"
                >
                  Select all loaded ({emailMacros.length})
                </SmallButton>
                {selectedIds.size > 0 && (
                  <SmallButton onClick={() => void handleBulkDelete()} className="bg-red-600 hover:bg-red-700">
                    Delete selected ({selectedIds.size})
                  </SmallButton>
                )}
              </div>
            </div>

            {listLoading && emailMacros.length === 0 ? (
              <div className="text-center py-4 text-white/60">Loading…</div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {emailMacros.map((macro) => {
                  const isEditing = editingId === macro.id;
                  const editForm = (editForms[macro.id] as Record<string, string> | undefined) || {
                    macroName: macro.macroName,
                    macro: macro.macro,
                    caseType: macro.caseType || "",
                    brand: macro.brand || "",
                    description: macro.description || "",
                  };

                  return (
                    <div key={macro.id} className="p-3 bg-white/5 rounded-lg border border-white/10">
                      {isEditing ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={editForm.macroName}
                              onChange={(e) =>
                                setEditForms({ ...editForms, [macro.id]: { ...editForm, macroName: e.target.value } })
                              }
                              placeholder="Macro Name *"
                              className="px-2 py-1 bg-white/10 rounded text-white text-sm"
                            />
                            <input
                              type="text"
                              value={editForm.brand}
                              onChange={(e) =>
                                setEditForms({ ...editForms, [macro.id]: { ...editForm, brand: e.target.value } })
                              }
                              placeholder="Brand"
                              className="px-2 py-1 bg-white/10 rounded text-white text-sm"
                            />
                            <input
                              type="text"
                              value={editForm.caseType}
                              onChange={(e) =>
                                setEditForms({ ...editForms, [macro.id]: { ...editForm, caseType: e.target.value } })
                              }
                              placeholder="Case Type"
                              className="px-2 py-1 bg-white/10 rounded text-white text-sm"
                            />
                            <input
                              type="text"
                              value={editForm.description}
                              onChange={(e) =>
                                setEditForms({ ...editForms, [macro.id]: { ...editForm, description: e.target.value } })
                              }
                              placeholder="Description"
                              className="px-2 py-1 bg-white/10 rounded text-white text-sm"
                            />
                            <textarea
                              value={editForm.macro}
                              onChange={(e) =>
                                setEditForms({ ...editForms, [macro.id]: { ...editForm, macro: e.target.value } })
                              }
                              placeholder="Macro *"
                              rows={3}
                              className="md:col-span-2 px-2 py-1 bg-white/10 rounded text-white text-sm"
                            />
                          </div>
                          <div className="flex gap-2">
                            <SmallButton
                              onClick={() => {
                                void (async () => {
                                  setLoading(true);
                                  try {
                                    const res = await fetch("/api/knowledge/email-macros", {
                                      method: "PUT",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ id: macro.id, ...editForm }),
                                    });
                                    const data = await res.json();
                                    if (data.success) {
                                      setEditingId(null);
                                      await refreshListFirstPage();
                                    } else {
                                      alert(`❌ Failed: ${data.error}`);
                                    }
                                  } catch {
                                    alert("❌ Failed to update");
                                  } finally {
                                    setLoading(false);
                                  }
                                })();
                              }}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              Save
                            </SmallButton>
                            <SmallButton
                              onClick={() => {
                                setEditingId(null);
                                const newForms = { ...editForms };
                                delete newForms[macro.id];
                                setEditForms(newForms);
                              }}
                              className="bg-gray-600 hover:bg-gray-700"
                            >
                              Cancel
                            </SmallButton>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(macro.id)}
                                onChange={(e) => {
                                  const newSet = new Set(selectedIds);
                                  if (e.target.checked) newSet.add(macro.id);
                                  else newSet.delete(macro.id);
                                  setSelectedIds(newSet);
                                }}
                                className="w-4 h-4"
                              />
                              <span className="font-semibold text-white">{macro.macroName}</span>
                              {macro.brand && <Badge>{macro.brand}</Badge>}
                              {macro.caseType && (
                                <Badge tone="muted">{macro.caseType}</Badge>
                              )}
                            </div>
                            <p className="text-sm text-white/80 mb-1 whitespace-pre-wrap">{macro.macro}</p>
                            {macro.description && <p className="text-xs text-white/60">{macro.description}</p>}
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <SmallButton
                              onClick={() => {
                                setEditingId(macro.id);
                                setEditForms({
                                  ...editForms,
                                  [macro.id]: {
                                    macroName: macro.macroName,
                                    macro: macro.macro,
                                    caseType: macro.caseType || "",
                                    brand: macro.brand || "",
                                    description: macro.description || "",
                                  },
                                });
                              }}
                              className="bg-blue-600 hover:bg-blue-700"
                            >
                              Edit
                            </SmallButton>
                            <SmallButton
                              onClick={() => void handleDelete(macro.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Delete
                            </SmallButton>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {emailHasMore && (
              <button
                type="button"
                onClick={() => void loadMoreEmail()}
                disabled={listLoading}
                className="w-full py-2 text-sm bg-white/10 hover:bg-white/15 text-white rounded-md border border-white/10 disabled:opacity-50"
              >
                {listLoading ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        </Card>
      )}

      {activeResource === "text-club-macros" && (
        <Card className="p-5 space-y-4">
          <h2 className="text-xl font-semibold text-white">💬 Text Club Macros</h2>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/80">CSV Import</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleCSVImport(file);
              }}
              className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm"
            />
            <p className="text-xs text-white/60">CSV columns: Macro Name, Macro Details</p>
          </div>

          <div className="space-y-3 border-t border-white/10 pt-4">
            <h3 className="text-md font-semibold text-white">Add New Text Club Macro</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-white/60 mb-1">Macro Name *</label>
                <input
                  type="text"
                  value={textClubMacroForm.macroName}
                  onChange={(e) => setTextClubMacroForm({ ...textClubMacroForm, macroName: e.target.value })}
                  className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1">Macro Details *</label>
                <textarea
                  value={textClubMacroForm.macroDetails}
                  onChange={(e) => setTextClubMacroForm({ ...textClubMacroForm, macroDetails: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm"
                />
              </div>
            </div>
            <SmallButton onClick={() => void handleCreate()} disabled={loading}>
              Add Text Club Macro
            </SmallButton>
          </div>

          <div className="border-t border-white/10 pt-4 space-y-3">
            <h3 className="text-md font-semibold text-white">Browse & edit</h3>
            <div>
              <label className="block text-xs text-white/50 mb-1">Keyword</label>
              <input
                type="text"
                value={textKeyword}
                onChange={(e) => setTextKeyword(e.target.value)}
                placeholder="Search macro name or details…"
                className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm border border-white/10"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-white/70">
                Showing {textClubMacros.length} loaded
                {textHasMore ? " · more on next page" : ""}
              </div>
              <div className="flex flex-wrap gap-2">
                <SmallButton
                  type="button"
                  onClick={() => setSelectedIds(new Set(textClubMacros.map((m) => m.id)))}
                  disabled={textClubMacros.length === 0 || listLoading}
                  className="bg-white/10 hover:bg-white/15"
                >
                  Select all loaded ({textClubMacros.length})
                </SmallButton>
                {selectedIds.size > 0 && (
                  <SmallButton onClick={() => void handleBulkDelete()} className="bg-red-600 hover:bg-red-700">
                    Delete selected ({selectedIds.size})
                  </SmallButton>
                )}
              </div>
            </div>

            {listLoading && textClubMacros.length === 0 ? (
              <div className="text-center py-4 text-white/60">Loading…</div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {textClubMacros.map((macro) => (
                  <div key={macro.id} className="p-3 bg-white/5 rounded-lg border border-white/10">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(macro.id)}
                            onChange={(e) => {
                              const newSet = new Set(selectedIds);
                              if (e.target.checked) newSet.add(macro.id);
                              else newSet.delete(macro.id);
                              setSelectedIds(newSet);
                            }}
                            className="w-4 h-4"
                          />
                          <span className="font-semibold text-white">{macro.macroName}</span>
                        </div>
                        <p className="text-sm text-white/80 whitespace-pre-wrap">{macro.macroDetails}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <SmallButton
                          onClick={() => setEditingId(editingId === macro.id ? null : macro.id)}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          {editingId === macro.id ? "Cancel" : "Edit"}
                        </SmallButton>
                        <SmallButton
                          onClick={() => void handleDelete(macro.id)}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Delete
                        </SmallButton>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {textHasMore && (
              <button
                type="button"
                onClick={() => void loadMoreText()}
                disabled={listLoading}
                className="w-full py-2 text-sm bg-white/10 hover:bg-white/15 text-white rounded-md border border-white/10 disabled:opacity-50"
              >
                {listLoading ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        </Card>
      )}

      {activeResource === "product-inquiry-qa" && (
        <Card className="p-5 space-y-4">
          <h2 className="text-xl font-semibold text-white">❓ Product Inquiry QA</h2>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/80">CSV Import</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleCSVImport(file);
              }}
              className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm"
            />
            <p className="text-xs text-white/60">CSV columns: Brand, Product, Question, Answer</p>
          </div>

          <div className="space-y-3 border-t border-white/10 pt-4">
            <h3 className="text-md font-semibold text-white">Add New Product Inquiry QA</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-white/60 mb-1">Brand *</label>
                <input
                  type="text"
                  value={productQAForm.brand}
                  onChange={(e) => setProductQAForm({ ...productQAForm, brand: e.target.value })}
                  className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1">Product *</label>
                <input
                  type="text"
                  value={productQAForm.product}
                  onChange={(e) => setProductQAForm({ ...productQAForm, product: e.target.value })}
                  className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-white/60 mb-1">Question *</label>
                <textarea
                  value={productQAForm.question}
                  onChange={(e) => setProductQAForm({ ...productQAForm, question: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-white/60 mb-1">Answer *</label>
                <textarea
                  value={productQAForm.answer}
                  onChange={(e) => setProductQAForm({ ...productQAForm, answer: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm"
                />
              </div>
            </div>
            <SmallButton onClick={() => void handleCreate()} disabled={loading}>
              Add Product Inquiry QA
            </SmallButton>
          </div>

          <div className="border-t border-white/10 pt-4 space-y-3">
            <h3 className="text-md font-semibold text-white">Browse & edit</h3>
            <p className="text-xs text-white/50">
              Lists load at most {BROWSE_LIMIT} rows per request. Use filters and Load more. Selection applies only to
              loaded rows.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                          Array.isArray(parsed) && parsed.every((x) => typeof x === "string") ? (parsed as string[]) : null
                        );
                      } catch {
                        setQaBrandValues(null);
                      }
                    }
                  }}
                  className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm border border-white/10"
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
                          Array.isArray(parsed) && parsed.every((x) => typeof x === "string") ? (parsed as string[]) : null
                        );
                      } catch {
                        setQaProductValues(null);
                      }
                    }
                  }}
                  className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm border border-white/10"
                  disabled={qaFacetsLoading || !qaBrandValues?.length}
                >
                  <option value="">{qaBrandValues?.length ? "Any product (this brand)" : "Select a brand first"}</option>
                  {qaProductOptions.map((opt, i) => (
                    <option key={`${stableFacetValue(opt.values)}-${i}`} value={stableFacetValue(opt.values)}>
                      {opt.label}
                      {opt.values.length > 1 ? ` (${opt.values.length} variants)` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-white/50 mb-1">Keyword</label>
                <input
                  type="text"
                  value={qaKeyword}
                  onChange={(e) => setQaKeyword(e.target.value)}
                  placeholder="Search brand, product, question, answer…"
                  className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm border border-white/10"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-white/70">
                Showing {productInquiryQAs.length} loaded
                {qaHasMore ? " · more on next page" : ""}
              </div>
              <div className="flex flex-wrap gap-2">
                <SmallButton
                  type="button"
                  onClick={() => setSelectedIds(new Set(productInquiryQAs.map((q) => q.id)))}
                  disabled={productInquiryQAs.length === 0 || listLoading}
                  className="bg-white/10 hover:bg-white/15"
                >
                  Select all loaded ({productInquiryQAs.length})
                </SmallButton>
                {selectedIds.size > 0 && (
                  <SmallButton onClick={() => void handleBulkDelete()} className="bg-red-600 hover:bg-red-700">
                    Delete selected ({selectedIds.size})
                  </SmallButton>
                )}
              </div>
            </div>

            {listLoading && productInquiryQAs.length === 0 ? (
              <div className="text-center py-4 text-white/60">Loading…</div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {productInquiryQAs.map((qa) => (
                  <div key={qa.id} className="p-3 bg-white/5 rounded-lg border border-white/10">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(qa.id)}
                            onChange={(e) => {
                              const newSet = new Set(selectedIds);
                              if (e.target.checked) newSet.add(qa.id);
                              else newSet.delete(qa.id);
                              setSelectedIds(newSet);
                            }}
                            className="w-4 h-4"
                          />
                          <Badge>{qa.brand}</Badge>
                          <span className="font-semibold text-white">{qa.product}</span>
                        </div>
                        <p className="text-sm text-white/80 mb-1 whitespace-pre-wrap">
                          <strong>Q:</strong> {qa.question}
                        </p>
                        <p className="text-sm text-white/80 whitespace-pre-wrap">
                          <strong>A:</strong> {qa.answer}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <SmallButton
                          onClick={() => setEditingId(editingId === qa.id ? null : qa.id)}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          {editingId === qa.id ? "Cancel" : "Edit"}
                        </SmallButton>
                        <SmallButton
                          onClick={() => void handleDelete(qa.id)}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Delete
                        </SmallButton>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {qaHasMore && (
              <button
                type="button"
                onClick={() => void loadMoreQa()}
                disabled={listLoading}
                className="w-full py-2 text-sm bg-white/10 hover:bg-white/15 text-white rounded-md border border-white/10 disabled:opacity-50"
              >
                {listLoading ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

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
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${toneClasses}`}>{children}</span>
  );
}
