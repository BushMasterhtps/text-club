"use client";

import React, { useState, useEffect } from "react";
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

export default function KnowledgeBaseSection() {
  const [activeResource, setActiveResource] = useState<ResourceType>("email-macros");
  const [emailMacros, setEmailMacros] = useState<EmailMacro[]>([]);
  const [textClubMacros, setTextClubMacros] = useState<TextClubMacro[]>([]);
  const [productInquiryQAs, setProductInquiryQAs] = useState<ProductInquiryQA[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editForms, setEditForms] = useState<Record<string, any>>({});

  // Email Macro form state
  const [emailMacroForm, setEmailMacroForm] = useState({
    macroName: "",
    macro: "",
    caseType: "",
    brand: "",
    description: ""
  });

  // Text Club Macro form state
  const [textClubMacroForm, setTextClubMacroForm] = useState({
    macroName: "",
    macroDetails: ""
  });

  // Product Inquiry QA form state
  const [productQAForm, setProductQAForm] = useState({
    brand: "",
    product: "",
    question: "",
    answer: ""
  });

  useEffect(() => {
    loadData();
  }, [activeResource]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeResource === "email-macros") {
        const res = await fetch("/api/knowledge/email-macros");
        const data = await res.json();
        if (data.success) setEmailMacros(data.data);
      } else if (activeResource === "text-club-macros") {
        const res = await fetch("/api/knowledge/text-club-macros");
        const data = await res.json();
        if (data.success) setTextClubMacros(data.data);
      } else if (activeResource === "product-inquiry-qa") {
        const res = await fetch("/api/knowledge/product-inquiry-qa");
        const data = await res.json();
        if (data.success) setProductInquiryQAs(data.data);
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
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
        body: formData
      });

      // Check if response is ok
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

      // Check content type before parsing JSON
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Expected JSON response, but received ${contentType || "no content type"}. Response: ${text.substring(0, 200)}`);
      }

      const data = await res.json();
      if (data.success) {
        alert(`✅ Imported ${data.imported} items${data.errors > 0 ? `, ${data.errors} errors` : ""}`);
        loadData();
      } else {
        alert(`❌ Import failed: ${data.error || "Unknown error"}`);
      }
    } catch (error: any) {
      console.error("Import error:", error);
      alert(`❌ Import failed: ${error.message || error || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    setLoading(true);
    try {
      let endpoint = "";
      let body: any = {};

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
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (data.success) {
        alert("✅ Created successfully");
        // Reset forms
        setEmailMacroForm({ macroName: "", macro: "", caseType: "", brand: "", description: "" });
        setTextClubMacroForm({ macroName: "", macroDetails: "" });
        setProductQAForm({ brand: "", product: "", question: "", answer: "" });
        loadData();
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

  const handleUpdate = async (id: string) => {
    setLoading(true);
    try {
      let endpoint = "";
      let body: any = { id };

      if (activeResource === "email-macros") {
        endpoint = "/api/knowledge/email-macros";
        const item = emailMacros.find((m) => m.id === id);
        if (!item) return;
        body = {
          id,
          macroName: item.macroName,
          macro: item.macro,
          caseType: item.caseType,
          brand: item.brand,
          description: item.description
        };
      } else if (activeResource === "text-club-macros") {
        endpoint = "/api/knowledge/text-club-macros";
        const item = textClubMacros.find((m) => m.id === id);
        if (!item) return;
        body = { id, macroName: item.macroName, macroDetails: item.macroDetails };
      } else if (activeResource === "product-inquiry-qa") {
        endpoint = "/api/knowledge/product-inquiry-qa";
        const item = productInquiryQAs.find((q) => q.id === id);
        if (!item) return;
        body = { id, brand: item.brand, product: item.product, question: item.question, answer: item.answer };
      }

      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (data.success) {
        alert("✅ Updated successfully");
        setEditingId(null);
        loadData();
      } else {
        alert(`❌ Failed: ${data.error}`);
      }
    } catch (error) {
      console.error("Update error:", error);
      alert("❌ Failed to update");
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

      const res = await fetch(`${endpoint}?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        alert("✅ Deleted successfully");
        loadData();
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
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} items?`)) return;

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
        loadData();
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
      {/* Resource Type Tabs */}
      <div className="flex space-x-1 bg-white/5 rounded-lg p-1">
        <button
          onClick={() => setActiveResource("email-macros")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeResource === "email-macros"
              ? "bg-white/10 text-white"
              : "text-white/60 hover:text-white/80"
          }`}
        >
          📧 Email Macros
        </button>
        <button
          onClick={() => setActiveResource("text-club-macros")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeResource === "text-club-macros"
              ? "bg-white/10 text-white"
              : "text-white/60 hover:text-white/80"
          }`}
        >
          💬 Text Club Macros
        </button>
        <button
          onClick={() => setActiveResource("product-inquiry-qa")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeResource === "product-inquiry-qa"
              ? "bg-white/10 text-white"
              : "text-white/60 hover:text-white/80"
          }`}
        >
          ❓ Product Inquiry QA
        </button>
      </div>

      {/* Email Macros Section */}
      {activeResource === "email-macros" && (
        <Card className="p-5 space-y-4">
          <h2 className="text-xl font-semibold text-white">📧 Email Macros</h2>

          {/* CSV Import */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/80">CSV Import</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCSVImport(file);
              }}
              className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm"
            />
            <p className="text-xs text-white/60">
              CSV columns: Macro Name, Macro, Case Type/ Subcategory, Brand, What the macro is for
            </p>
          </div>

          {/* Manual Add Form */}
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
            <SmallButton onClick={handleCreate} disabled={loading}>
              Add Email Macro
            </SmallButton>
          </div>

          {/* List/Edit */}
          <div className="border-t border-white/10 pt-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-md font-semibold text-white">
                Email Macros ({emailMacros.length})
              </h3>
              {selectedIds.size > 0 && (
                <SmallButton onClick={handleBulkDelete} className="bg-red-600 hover:bg-red-700">
                  Delete Selected ({selectedIds.size})
                </SmallButton>
              )}
            </div>
            {loading ? (
              <div className="text-center py-4 text-white/60">Loading...</div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {emailMacros.map((macro) => {
                  const isEditing = editingId === macro.id;
                  const editForm = editForms[macro.id] || {
                    macroName: macro.macroName,
                    macro: macro.macro,
                    caseType: macro.caseType || "",
                    brand: macro.brand || "",
                    description: macro.description || ""
                  };

                  return (
                    <div key={macro.id} className="p-3 bg-white/5 rounded-lg border border-white/10">
                      {isEditing ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={editForm.macroName}
                              onChange={(e) => setEditForms({ ...editForms, [macro.id]: { ...editForm, macroName: e.target.value } })}
                              placeholder="Macro Name *"
                              className="px-2 py-1 bg-white/10 rounded text-white text-sm"
                            />
                            <input
                              type="text"
                              value={editForm.brand}
                              onChange={(e) => setEditForms({ ...editForms, [macro.id]: { ...editForm, brand: e.target.value } })}
                              placeholder="Brand"
                              className="px-2 py-1 bg-white/10 rounded text-white text-sm"
                            />
                            <input
                              type="text"
                              value={editForm.caseType}
                              onChange={(e) => setEditForms({ ...editForms, [macro.id]: { ...editForm, caseType: e.target.value } })}
                              placeholder="Case Type"
                              className="px-2 py-1 bg-white/10 rounded text-white text-sm"
                            />
                            <input
                              type="text"
                              value={editForm.description}
                              onChange={(e) => setEditForms({ ...editForms, [macro.id]: { ...editForm, description: e.target.value } })}
                              placeholder="Description"
                              className="px-2 py-1 bg-white/10 rounded text-white text-sm"
                            />
                            <textarea
                              value={editForm.macro}
                              onChange={(e) => setEditForms({ ...editForms, [macro.id]: { ...editForm, macro: e.target.value } })}
                              placeholder="Macro *"
                              rows={3}
                              className="md:col-span-2 px-2 py-1 bg-white/10 rounded text-white text-sm"
                            />
                          </div>
                          <div className="flex gap-2">
                            <SmallButton
                              onClick={async () => {
                                setLoading(true);
                                try {
                                  const res = await fetch("/api/knowledge/email-macros", {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ id: macro.id, ...editForm })
                                  });
                                  const data = await res.json();
                                  if (data.success) {
                                    setEditingId(null);
                                    loadData();
                                  } else {
                                    alert(`❌ Failed: ${data.error}`);
                                  }
                                } catch (error) {
                                  alert("❌ Failed to update");
                                } finally {
                                  setLoading(false);
                                }
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
                              {macro.caseType && <Badge tone="muted">{macro.caseType}</Badge>}
                            </div>
                            <p className="text-sm text-white/80 mb-1">{macro.macro}</p>
                            {macro.description && (
                              <p className="text-xs text-white/60">{macro.description}</p>
                            )}
                          </div>
                          <div className="flex gap-2">
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
                                    description: macro.description || ""
                                  }
                                });
                              }}
                              className="bg-blue-600 hover:bg-blue-700"
                            >
                              Edit
                            </SmallButton>
                            <SmallButton
                              onClick={() => handleDelete(macro.id)}
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
          </div>
        </Card>
      )}

      {/* Text Club Macros Section */}
      {activeResource === "text-club-macros" && (
        <Card className="p-5 space-y-4">
          <h2 className="text-xl font-semibold text-white">💬 Text Club Macros</h2>

          {/* CSV Import */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/80">CSV Import</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCSVImport(file);
              }}
              className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm"
            />
            <p className="text-xs text-white/60">CSV columns: Macro Name, Macro Details</p>
          </div>

          {/* Manual Add Form */}
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
            <SmallButton onClick={handleCreate} disabled={loading}>
              Add Text Club Macro
            </SmallButton>
          </div>

          {/* List/Edit */}
          <div className="border-t border-white/10 pt-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-md font-semibold text-white">
                Text Club Macros ({textClubMacros.length})
              </h3>
              {selectedIds.size > 0 && (
                <SmallButton onClick={handleBulkDelete} className="bg-red-600 hover:bg-red-700">
                  Delete Selected ({selectedIds.size})
                </SmallButton>
              )}
            </div>
            {loading ? (
              <div className="text-center py-4 text-white/60">Loading...</div>
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
                        <p className="text-sm text-white/80">{macro.macroDetails}</p>
                      </div>
                      <div className="flex gap-2">
                        <SmallButton
                          onClick={() => setEditingId(editingId === macro.id ? null : macro.id)}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          {editingId === macro.id ? "Cancel" : "Edit"}
                        </SmallButton>
                        <SmallButton
                          onClick={() => handleDelete(macro.id)}
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
          </div>
        </Card>
      )}

      {/* Product Inquiry QA Section */}
      {activeResource === "product-inquiry-qa" && (
        <Card className="p-5 space-y-4">
          <h2 className="text-xl font-semibold text-white">❓ Product Inquiry QA</h2>

          {/* CSV Import */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/80">CSV Import</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCSVImport(file);
              }}
              className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm"
            />
            <p className="text-xs text-white/60">CSV columns: Brand, Product, Question, Answer</p>
          </div>

          {/* Manual Add Form */}
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
            <SmallButton onClick={handleCreate} disabled={loading}>
              Add Product Inquiry QA
            </SmallButton>
          </div>

          {/* List/Edit */}
          <div className="border-t border-white/10 pt-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-md font-semibold text-white">
                Product Inquiry QAs ({productInquiryQAs.length})
              </h3>
              {selectedIds.size > 0 && (
                <SmallButton onClick={handleBulkDelete} className="bg-red-600 hover:bg-red-700">
                  Delete Selected ({selectedIds.size})
                </SmallButton>
              )}
            </div>
            {loading ? (
              <div className="text-center py-4 text-white/60">Loading...</div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {productInquiryQAs.map((qa) => (
                  <div key={qa.id} className="p-3 bg-white/5 rounded-lg border border-white/10">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
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
                        <p className="text-sm text-white/80 mb-1">
                          <strong>Q:</strong> {qa.question}
                        </p>
                        <p className="text-sm text-white/80">
                          <strong>A:</strong> {qa.answer}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <SmallButton
                          onClick={() => setEditingId(editingId === qa.id ? null : qa.id)}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          {editingId === qa.id ? "Cancel" : "Edit"}
                        </SmallButton>
                        <SmallButton
                          onClick={() => handleDelete(qa.id)}
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
          </div>
        </Card>
      )}
    </div>
  );
}

// Badge component (reused from UnifiedSettings)
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
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${toneClasses}`}>
      {children}
    </span>
  );
}

