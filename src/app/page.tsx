"use client";

import { useState, useCallback, useEffect } from "react";

// ============ TYPES ============

type InvoiceItem = {
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
};

type ExtractedData = {
  invoice_number: string;
  restaurant: string;
  supplier: string;
  invoice_date: string;
  currency: string;
  total_amount: number;
  items_count: number;
  items: InvoiceItem[];
  drive_file_link: string;
  drive_file_id: string;
};

type PreviewResponse = {
  success: boolean;
  is_duplicate: boolean;
  duplicate_id: string | null;
  extracted_data: ExtractedData;
};

type POSResponse = {
  success: boolean;
  report_id: string;
  summary: {
    restaurant: string;
    total_revenue: number;
    total_items_sold: number;
    products_imported: number;
    top_seller: string;
  };
};

type Ingredient = {
  id: string;
  name: string;
  unitCost: number;
  perUnit: string;
  category: string;
};

type RecentInvoice = {
  id: string;
  invoiceNumber: string;
  supplier: string;
  location: string;
  totalAmount: number;
  currency: string;
  itemsCount: number;
  status: string;
  createdAt: string;
  notionUrl: string;
};

type RecipeLine = {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  lineCost: number;
};

// ============ CONSTANTS ============

const WEBHOOK_EXTRACT = "https://hanumet.app.n8n.cloud/webhook/invoice-extract-v2";
const WEBHOOK_CONFIRM = "https://hanumet.app.n8n.cloud/webhook/invoice-confirm-v2";
const WEBHOOK_POS_UPLOAD = "https://hanumet.app.n8n.cloud/webhook/demo-pos-upload";
const NOTION_INVOICES_URL = "https://www.notion.so/2ece4eb3a20581239734ed7e5a7546dc";
const NOTION_POS_URL = "https://www.notion.so/2ece4eb3a205817f8b2fe08ef333d2df";

const MARKUP_PERCENTAGE = 0.5;

const UNIT_CONVERSIONS: Record<string, Record<string, number>> = {
  kg: { kg: 1, g: 0.001 },
  g: { g: 1, kg: 1000 },
  L: { L: 1, mL: 0.001, "fl. oz": 0.0295735 },
  mL: { mL: 1, L: 1000, "fl. oz": 29.5735 },
  "fl. oz": { "fl. oz": 1, L: 33.814, mL: 0.033814 },
  "whole unit": { "whole unit": 1 },
};

function convertUnits(quantity: number, fromUnit: string, toUnit: string): number {
  if (fromUnit === toUnit) return quantity;
  const conversions = UNIT_CONVERSIONS[toUnit];
  if (conversions && conversions[fromUnit]) {
    return quantity * conversions[fromUnit];
  }
  return quantity;
}

// ============ MAIN COMPONENT ============

export default function Home() {
  const [activeTab, setActiveTab] = useState<"invoices" | "pos" | "recipe" | "costs" | "matching" | "alerts">("invoices");

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-orange-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Food Cost Sentinel
          </h1>
          <p className="text-gray-600">
            AI-powered food cost tracking for restaurants
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="mb-8 overflow-x-auto pb-2">
          <div className="flex justify-center min-w-max">
            <div className="inline-flex bg-white rounded-xl p-1.5 shadow-sm border border-gray-200">
              <button
                onClick={() => setActiveTab("invoices")}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === "invoices"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                Invoices
              </button>
              <button
                onClick={() => setActiveTab("pos")}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === "pos"
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                POS Sales
              </button>
              <button
                onClick={() => setActiveTab("recipe")}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === "recipe"
                    ? "bg-orange-500 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                Recipes
              </button>
              <button
                onClick={() => setActiveTab("costs")}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === "costs"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                Cost Calculator
              </button>
              <button
                onClick={() => setActiveTab("matching")}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === "matching"
                    ? "bg-amber-500 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                Matching
              </button>
              <button
                onClick={() => setActiveTab("alerts")}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === "alerts"
                    ? "bg-red-600 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                Alerts
              </button>
            </div>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === "invoices" && <InvoiceCapture />}
        {activeTab === "pos" && <POSSales />}
        {activeTab === "recipe" && <RecipeCalculator />}
        {activeTab === "costs" && <CostCalculator />}
        {activeTab === "matching" && <IngredientMatching />}
        {activeTab === "alerts" && <AlertsAnalysis />}

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          Powered by{" "}
          <a href="https://instagram.com/AIrestohub" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:text-orange-700 font-medium">
            WwithAI
          </a>
          {" • "}
          <a href="https://instagram.com/AIrestohub" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:text-orange-700">
            @AIrestohub
          </a>
        </div>
      </div>
    </main>
  );
}

// ============ INVOICE CAPTURE TAB ============

function InvoiceCapture() {
  const [step, setStep] = useState<"upload" | "processing" | "preview" | "saving" | "success">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedInvoiceId, setSavedInvoiceId] = useState<string | null>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type.startsWith("image/")) {
      setFile(droppedFile);
      setPreview(URL.createObjectURL(droppedFile));
      setError(null);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setError(null);
    }
  };

  const processInvoice = async () => {
    if (!file) return;

    setStep("processing");
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(WEBHOOK_EXTRACT, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to process invoice");
      }

      const data: PreviewResponse = await response.json();

      if (data.success) {
        setExtractedData(data.extracted_data);
        setIsDuplicate(data.is_duplicate);
        setStep("preview");
      } else {
        throw new Error("Failed to extract invoice data");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setStep("upload");
    }
  };

  const confirmInvoice = async () => {
    if (!extractedData) return;

    setStep("saving");
    setError(null);

    try {
      const response = await fetch(WEBHOOK_CONFIRM, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(extractedData),
      });

      if (!response.ok) {
        throw new Error("Failed to save invoice");
      }

      const data = await response.json();

      if (data.success) {
        setSavedInvoiceId(data.invoice_id);
        setStep("success");
      } else {
        throw new Error("Failed to save invoice");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setStep("preview");
    }
  };

  const reset = () => {
    setStep("upload");
    setFile(null);
    setPreview(null);
    setExtractedData(null);
    setIsDuplicate(false);
    setError(null);
    setSavedInvoiceId(null);
  };

  return (
    <>
      {/* Progress Steps */}
      <div className="flex justify-center mb-8">
        <div className="flex items-center space-x-4">
          <StepIndicator number={1} label="Upload" active={step === "upload" || step === "processing"} completed={step !== "upload" && step !== "processing"} color="blue" />
          <div className="w-12 h-0.5 bg-gray-300" />
          <StepIndicator number={2} label="Review" active={step === "preview"} completed={step === "saving" || step === "success"} color="blue" />
          <div className="w-12 h-0.5 bg-gray-300" />
          <StepIndicator number={3} label="Save" active={step === "saving" || step === "success"} completed={step === "success"} color="blue" />
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Upload Step */}
      {step === "upload" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
              file ? "border-green-400 bg-green-50" : "border-gray-300 hover:border-blue-400"
            }`}
          >
            {preview ? (
              <div>
                <img
                  src={preview}
                  alt="Invoice preview"
                  className="max-h-64 mx-auto mb-4 rounded-lg shadow"
                />
                <p className="text-sm text-gray-600 mb-4">{file?.name}</p>
                <button
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                  }}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Remove and select another
                </button>
              </div>
            ) : (
              <div>
                <svg
                  className="mx-auto h-16 w-16 text-gray-400 mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <p className="text-lg font-medium text-gray-700 mb-2">
                  Drop your invoice image here
                </p>
                <p className="text-sm text-gray-500 mb-4">or click to browse</p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="invoice-file-input"
                />
                <label
                  htmlFor="invoice-file-input"
                  className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition-colors"
                >
                  Select File
                </label>
              </div>
            )}
          </div>

          {file && (
            <button
              onClick={processInvoice}
              className="w-full mt-6 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Extract Invoice Data
            </button>
          )}
        </div>
      )}

      {/* Show Activity Feed on Upload Step */}
      {step === "upload" && (
        <div className="mt-6">
          <RecentActivityFeed highlightId={null} />
        </div>
      )}

      {/* Processing Step */}
      {step === "processing" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent mx-auto mb-6" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Processing Invoice...
          </h2>
          <p className="text-gray-600">
            AI is extracting data from your invoice
          </p>
        </div>
      )}

      {/* Preview Step */}
      {step === "preview" && extractedData && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          {isDuplicate && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800">
              This invoice may already exist in the database.
            </div>
          )}

          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            Extracted Invoice Data
          </h2>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <InfoField label="Invoice #" value={extractedData.invoice_number} />
            <InfoField label="Supplier" value={extractedData.supplier} />
            <InfoField label="Date" value={extractedData.invoice_date} />
            <InfoField label="Location" value={extractedData.restaurant} />
            <InfoField
              label="Total"
              value={`${extractedData.currency} $${extractedData.total_amount.toFixed(2)}`}
            />
            <InfoField label="Items" value={`${extractedData.items_count} line items`} />
          </div>

          {extractedData.items.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Line Items</h3>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">Product</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">Qty</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">Unit Price</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {extractedData.items.slice(0, 5).map((item, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2 text-gray-900">{item.product_name}</td>
                        <td className="px-4 py-2 text-right text-gray-600">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-600">
                          ${item.unit_price.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-900">
                          ${item.line_total.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {extractedData.items.length > 5 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-2 text-center text-gray-500 text-sm">
                          + {extractedData.items.length - 5} more items
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-4">
            <button
              onClick={reset}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmInvoice}
              className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
            >
              Save to Database
            </button>
          </div>
        </div>
      )}

      {/* Saving Step */}
      {step === "saving" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-green-600 border-t-transparent mx-auto mb-6" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Saving Invoice...
          </h2>
          <p className="text-gray-600">
            Storing data in your Notion database
          </p>
        </div>
      )}

      {/* Success Step */}
      {step === "success" && extractedData && (
        <div className="space-y-6">
          {/* Success Card */}
          <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold mb-1">Invoice Captured!</h2>
                <p className="text-green-100 text-sm mb-3">
                  Successfully saved to your Notion database
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-white/10 rounded-lg px-3 py-2">
                    <p className="text-green-200 text-xs">Invoice #</p>
                    <p className="font-semibold">{extractedData.invoice_number}</p>
                  </div>
                  <div className="bg-white/10 rounded-lg px-3 py-2">
                    <p className="text-green-200 text-xs">Supplier</p>
                    <p className="font-semibold">{extractedData.supplier}</p>
                  </div>
                  <div className="bg-white/10 rounded-lg px-3 py-2">
                    <p className="text-green-200 text-xs">Total Amount</p>
                    <p className="font-semibold">{extractedData.currency} ${extractedData.total_amount.toFixed(2)}</p>
                  </div>
                  <div className="bg-white/10 rounded-lg px-3 py-2">
                    <p className="text-green-200 text-xs">Line Items</p>
                    <p className="font-semibold">{extractedData.items_count} products</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              {savedInvoiceId && (
                <a
                  href={`https://www.notion.so/${savedInvoiceId.replace(/-/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  View in Notion
                </a>
              )}
              <button
                onClick={reset}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Capture Another
              </button>
            </div>
          </div>

          {/* Recent Activity Feed */}
          <RecentActivityFeed highlightId={savedInvoiceId} />
        </div>
      )}
    </>
  );
}

// ============ POS SALES TAB ============

function POSSales() {
  const [step, setStep] = useState<"upload" | "processing" | "success">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<POSResponse | null>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.name.endsWith(".csv") || droppedFile.type === "text/csv")) {
      setFile(droppedFile);
      setError(null);
    } else {
      setError("Please upload a CSV file");
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.name.endsWith(".csv") || selectedFile.type === "text/csv") {
        setFile(selectedFile);
        setError(null);
      } else {
        setError("Please upload a CSV file");
      }
    }
  };

  const processPOS = async () => {
    if (!file) return;

    setStep("processing");
    setError(null);

    try {
      const formData = new FormData();
      formData.append("data", file);

      const response = await fetch(WEBHOOK_POS_UPLOAD, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to process POS report");
      }

      const data: POSResponse = await response.json();

      if (data.success) {
        setResult(data);
        setStep("success");
      } else {
        throw new Error("Failed to import POS data");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setStep("upload");
    }
  };

  const reset = () => {
    setStep("upload");
    setFile(null);
    setError(null);
    setResult(null);
  };

  return (
    <>
      {/* Progress Steps */}
      <div className="flex justify-center mb-8">
        <div className="flex items-center space-x-4">
          <StepIndicator number={1} label="Upload" active={step === "upload" || step === "processing"} completed={step === "success"} color="purple" />
          <div className="w-12 h-0.5 bg-gray-300" />
          <StepIndicator number={2} label="Import" active={step === "processing" || step === "success"} completed={step === "success"} color="purple" />
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Upload Step */}
      {step === "upload" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
              file ? "border-green-400 bg-green-50" : "border-gray-300 hover:border-purple-400"
            }`}
          >
            {file ? (
              <div>
                <svg
                  className="mx-auto h-16 w-16 text-green-500 mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <p className="text-sm text-gray-600 mb-4">{file.name}</p>
                <button
                  onClick={() => setFile(null)}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Remove and select another
                </button>
              </div>
            ) : (
              <div>
                <svg
                  className="mx-auto h-16 w-16 text-gray-400 mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <p className="text-lg font-medium text-gray-700 mb-2">
                  Drop your Lightspeed POS report here
                </p>
                <p className="text-sm text-gray-500 mb-4">CSV format exported from Lightspeed</p>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="pos-file-input"
                />
                <label
                  htmlFor="pos-file-input"
                  className="inline-block px-6 py-2 bg-purple-600 text-white rounded-lg cursor-pointer hover:bg-purple-700 transition-colors"
                >
                  Select CSV File
                </label>
              </div>
            )}
          </div>

          {file && (
            <button
              onClick={processPOS}
              className="w-full mt-6 px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors"
            >
              Import Sales Data
            </button>
          )}

          {/* Help Text */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-medium text-gray-700 mb-2">How to export from Lightspeed:</h3>
            <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
              <li>Go to Reports → Product Reports → Product Performance</li>
              <li>Select your date range</li>
              <li>Click Export → CSV</li>
              <li>Upload the exported file here</li>
            </ol>
          </div>
        </div>
      )}

      {/* Processing Step */}
      {step === "processing" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-600 border-t-transparent mx-auto mb-6" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Importing Sales Data...
          </h2>
          <p className="text-gray-600">
            Parsing products and storing in Notion
          </p>
        </div>
      )}

      {/* Success Step */}
      {step === "success" && result && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Sales Data Imported!
            </h2>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-purple-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-purple-700">${result.summary.total_revenue.toLocaleString()}</p>
              <p className="text-sm text-purple-600">Total Revenue</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-blue-700">{result.summary.total_items_sold.toLocaleString()}</p>
              <p className="text-sm text-blue-600">Items Sold</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-green-700">{result.summary.products_imported}</p>
              <p className="text-sm text-green-600">Products Imported</p>
            </div>
            <div className="bg-orange-50 rounded-lg p-4 text-center">
              <p className="text-lg font-bold text-orange-700 truncate">{result.summary.top_seller}</p>
              <p className="text-sm text-orange-600">Top Seller</p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <a
              href={`https://www.notion.so/${result.report_id.replace(/-/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-6 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors text-center"
            >
              View Report in Notion
            </a>
            <a
              href={NOTION_POS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors text-center"
            >
              View All POS Reports
            </a>
            <button
              onClick={reset}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Import Another Report
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ============ RECIPE CALCULATOR TAB ============

type ScannedRecipe = {
  name: string;
  description: string;
  type: string;
  category: string;
  yieldQty: number;
  yieldUnit: string;
  laborHours: number;
  ingredientCost: number;
  laborCost: number;
  grossCost: number;
  costPerYield: number;
  costWithMarkup: number;
  lines: Array<{
    ingredientId?: string;
    ingredientName: string;
    quantity: number;
    unit: string;
    lineCost: number;
  }>;
};

function RecipeCalculator() {
  const [subTab, setSubTab] = useState<"build" | "scan">("build");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  // Recipe State
  const [recipeName, setRecipeName] = useState("");
  const [recipeCategory, setRecipeCategory] = useState("Appetizers");
  const [yieldQty, setYieldQty] = useState(1);
  const [yieldUnit, setYieldUnit] = useState("serving");
  const [lines, setLines] = useState<RecipeLine[]>([]);
  const [selectedIngredient, setSelectedIngredient] = useState("");
  const [lineQty, setLineQty] = useState(1);
  const [lineUnit, setLineUnit] = useState("g");
  const [searchTerm, setSearchTerm] = useState("");

  // Scan State
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scannedRecipe, setScannedRecipe] = useState<ScannedRecipe | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    fetchIngredients();
  }, []);

  async function fetchIngredients() {
    try {
      const res = await fetch("/api/ingredients");
      const data = await res.json();
      setIngredients(data.ingredients || []);
    } catch (error) {
      console.error("Failed to fetch ingredients:", error);
    } finally {
      setLoading(false);
    }
  }

  const filteredIngredients = ingredients.filter((ing) =>
    ing.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Scan handlers
  const handleScanDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type.startsWith("image/")) {
      setScanFile(droppedFile);
      setScanPreview(URL.createObjectURL(droppedFile));
      setScanError(null);
      setScannedRecipe(null);
    }
  }, []);

  const handleScanFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setScanFile(selectedFile);
      setScanPreview(URL.createObjectURL(selectedFile));
      setScanError(null);
      setScannedRecipe(null);
    }
  };

  async function scanRecipeImage() {
    if (!scanFile) return;

    setScanning(true);
    setScanError(null);

    try {
      const formData = new FormData();
      formData.append("file", scanFile);

      const response = await fetch("/api/scan-recipe", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setScannedRecipe(data.recipe);
      } else {
        setScanError(data.error || "Failed to scan recipe");
      }
    } catch (error) {
      setScanError("Failed to process image");
    } finally {
      setScanning(false);
    }
  }

  function updateScannedLine(index: number, field: string, value: any) {
    if (!scannedRecipe) return;

    const newLines = [...scannedRecipe.lines];
    newLines[index] = { ...newLines[index], [field]: value };

    // Recalculate line cost if quantity changed
    if (field === "quantity") {
      // Simple cost recalculation based on original ratio
      const originalLine = scannedRecipe.lines[index];
      if (originalLine.quantity > 0) {
        newLines[index].lineCost = (value / originalLine.quantity) * originalLine.lineCost;
      }
    }

    // Recalculate totals
    const newIngredientCost = newLines.reduce((sum, line) => sum + line.lineCost, 0);

    setScannedRecipe({
      ...scannedRecipe,
      lines: newLines,
      ingredientCost: newIngredientCost,
      grossCost: newIngredientCost,
      costPerYield: newIngredientCost / (scannedRecipe.yieldQty || 1),
      costWithMarkup: (newIngredientCost / (scannedRecipe.yieldQty || 1)) * (1 + MARKUP_PERCENTAGE),
    });
  }

  function removeScannedLine(index: number) {
    if (!scannedRecipe) return;

    const newLines = scannedRecipe.lines.filter((_, i) => i !== index);
    const newIngredientCost = newLines.reduce((sum, line) => sum + line.lineCost, 0);

    setScannedRecipe({
      ...scannedRecipe,
      lines: newLines,
      ingredientCost: newIngredientCost,
      grossCost: newIngredientCost,
      costPerYield: newIngredientCost / (scannedRecipe.yieldQty || 1),
      costWithMarkup: (newIngredientCost / (scannedRecipe.yieldQty || 1)) * (1 + MARKUP_PERCENTAGE),
    });
  }

  async function saveScannedRecipe() {
    if (!scannedRecipe || !scannedRecipe.name) {
      setSaveMessage("Please enter a recipe name");
      return;
    }

    setSaving(true);
    setSaveMessage("");

    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: scannedRecipe.name,
          description: scannedRecipe.description || "Scanned from image",
          type: scannedRecipe.type || "Menu Item",
          category: scannedRecipe.category || "Scanned",
          yieldQty: scannedRecipe.yieldQty || 1,
          yieldUnit: scannedRecipe.yieldUnit || "serving",
          laborHours: 0,
          ingredientCost: scannedRecipe.ingredientCost,
          laborCost: 0,
          grossCost: scannedRecipe.grossCost,
          costPerYield: scannedRecipe.costPerYield,
          costWithMarkup: scannedRecipe.costWithMarkup,
          lines: scannedRecipe.lines.map(line => ({
            ingredientId: line.ingredientId || "",
            ingredientName: line.ingredientName,
            quantity: line.quantity,
            unit: line.unit,
            lineCost: line.lineCost,
          })),
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSaveMessage("Recipe saved successfully!");
        setScannedRecipe(null);
        setScanFile(null);
        setScanPreview(null);
      } else {
        setSaveMessage("Error: " + (data.error || "Failed to save"));
      }
    } catch (error) {
      setSaveMessage("Error saving recipe");
    } finally {
      setSaving(false);
    }
  }

  function resetScan() {
    setScanFile(null);
    setScanPreview(null);
    setScannedRecipe(null);
    setScanError(null);
    setSaveMessage("");
  }

  function addIngredientLine() {
    const ingredient = ingredients.find((i) => i.id === selectedIngredient);
    if (!ingredient) return;

    const convertedQty = convertUnits(lineQty, lineUnit, ingredient.perUnit);
    const lineCost = convertedQty * ingredient.unitCost;

    const newLine: RecipeLine = {
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      quantity: lineQty,
      unit: lineUnit,
      unitCost: ingredient.unitCost,
      lineCost: lineCost,
    };

    setLines((prev) => [...prev, newLine]);
    setSelectedIngredient("");
    setLineQty(1);
    setSearchTerm("");
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  const ingredientTotal = lines.reduce((sum, line) => sum + line.lineCost, 0);
  const grossCost = ingredientTotal;
  const costPerYield = yieldQty > 0 ? grossCost / yieldQty : 0;
  const priceWithMarkup = costPerYield * (1 + MARKUP_PERCENTAGE);

  async function saveRecipe() {
    if (!recipeName) {
      setSaveMessage("Please enter a recipe name");
      return;
    }

    setSaving(true);
    setSaveMessage("");

    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: recipeName,
          description: "",
          type: "Menu Item",
          category: recipeCategory,
          yieldQty: yieldQty,
          yieldUnit: yieldUnit,
          laborHours: 0,
          ingredientCost: ingredientTotal,
          laborCost: 0,
          grossCost: grossCost,
          costPerYield: costPerYield,
          costWithMarkup: priceWithMarkup,
          lines: lines,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSaveMessage("Recipe saved successfully!");
        setRecipeName("");
        setLines([]);
      } else {
        setSaveMessage("Error: " + (data.error || "Failed to save"));
      }
    } catch (error) {
      setSaveMessage("Error saving recipe");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading ingredients...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sub-Tab Navigation */}
      <div className="flex justify-center">
        <div className="inline-flex bg-white rounded-lg p-1 shadow-sm border border-gray-200">
          <button
            onClick={() => setSubTab("build")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              subTab === "build"
                ? "bg-orange-500 text-white shadow-sm"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            }`}
          >
            Build Recipe
          </button>
          <button
            onClick={() => setSubTab("scan")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              subTab === "scan"
                ? "bg-orange-500 text-white shadow-sm"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            }`}
          >
            Scan Image
          </button>
        </div>
      </div>

      {/* Scan Image Sub-Tab */}
      {subTab === "scan" && (
        <>
          {/* Upload Section */}
          {!scannedRecipe && !scanning && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <div className="text-center mb-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-2">Scan Recipe Image</h2>
                <p className="text-sm text-gray-600">Upload a photo of a handwritten or printed recipe</p>
              </div>

              <div
                onDrop={handleScanDrop}
                onDragOver={(e) => e.preventDefault()}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  scanFile ? "border-green-400 bg-green-50" : "border-gray-300 hover:border-orange-400"
                }`}
              >
                {scanPreview ? (
                  <div>
                    <img
                      src={scanPreview}
                      alt="Recipe preview"
                      className="max-h-64 mx-auto mb-4 rounded-lg shadow"
                    />
                    <p className="text-sm text-gray-600 mb-4">{scanFile?.name}</p>
                    <button
                      onClick={resetScan}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Remove and select another
                    </button>
                  </div>
                ) : (
                  <div>
                    <svg
                      className="mx-auto h-16 w-16 text-gray-400 mb-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <p className="text-lg font-medium text-gray-700 mb-2">
                      Drop your recipe image here
                    </p>
                    <p className="text-sm text-gray-500 mb-4">
                      Handwritten notes, printed recipes, ingredient lists
                    </p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleScanFileSelect}
                      className="hidden"
                      id="scan-file-input"
                    />
                    <label
                      htmlFor="scan-file-input"
                      className="inline-block px-6 py-2 bg-orange-500 text-white rounded-lg cursor-pointer hover:bg-orange-600 transition-colors"
                    >
                      Select Image
                    </label>
                  </div>
                )}
              </div>

              {scanError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {scanError}
                </div>
              )}

              {scanFile && (
                <button
                  onClick={scanRecipeImage}
                  className="w-full mt-6 px-6 py-3 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors"
                >
                  Scan with AI
                </button>
              )}

              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Tips for best results:</h3>
                <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                  <li>Ensure text is clearly visible and readable</li>
                  <li>Include quantities and units (e.g., "200g chicken")</li>
                  <li>Works with handwritten notes or printed recipes</li>
                  <li>Supported formats: JPG, PNG, HEIC</li>
                </ul>
              </div>
            </div>
          )}

          {/* Scanning Spinner */}
          {scanning && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-orange-500 border-t-transparent mx-auto mb-6" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Scanning Recipe...
              </h2>
              <p className="text-gray-600">
                AI is extracting ingredients and calculating costs
              </p>
            </div>
          )}

          {/* Scanned Recipe Preview */}
          {scannedRecipe && !scanning && (
            <>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-lg font-semibold text-gray-800">Extracted Recipe</h2>
                  <button
                    onClick={resetScan}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Scan New Image
                  </button>
                </div>

                {scannedRecipe.description?.includes("Demo") && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                    Demo mode - Add ANTHROPIC_API_KEY in Vercel for real AI scanning
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Recipe Name</label>
                    <input
                      type="text"
                      value={scannedRecipe.name}
                      onChange={(e) => setScannedRecipe({ ...scannedRecipe, name: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select
                      value={scannedRecipe.category}
                      onChange={(e) => setScannedRecipe({ ...scannedRecipe, category: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="Scanned">Scanned</option>
                      <option value="Appetizers">Appetizers</option>
                      <option value="Noodles">Noodles</option>
                      <option value="Soups">Soups</option>
                      <option value="Rice Dishes">Rice Dishes</option>
                      <option value="Salads">Salads</option>
                      <option value="Beverages">Beverages</option>
                      <option value="Desserts">Desserts</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Extracted Ingredients */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Extracted Ingredients</h2>
                <p className="text-sm text-gray-600 mb-4">Edit quantities or remove ingredients as needed</p>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b text-left text-sm text-gray-600">
                        <th className="py-2">Ingredient</th>
                        <th className="py-2 text-right w-24">Qty</th>
                        <th className="py-2 w-24">Unit</th>
                        <th className="py-2 text-right">Cost</th>
                        <th className="py-2 w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {scannedRecipe.lines.map((line, idx) => (
                        <tr key={idx} className="border-b">
                          <td className="py-3">
                            <input
                              type="text"
                              value={line.ingredientName}
                              onChange={(e) => updateScannedLine(idx, "ingredientName", e.target.value)}
                              className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="py-3">
                            <input
                              type="number"
                              value={line.quantity}
                              onChange={(e) => updateScannedLine(idx, "quantity", parseFloat(e.target.value) || 0)}
                              className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right"
                              min="0"
                              step="0.1"
                            />
                          </td>
                          <td className="py-3">
                            <select
                              value={line.unit}
                              onChange={(e) => updateScannedLine(idx, "unit", e.target.value)}
                              className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
                            >
                              <option value="g">g</option>
                              <option value="kg">kg</option>
                              <option value="mL">mL</option>
                              <option value="L">L</option>
                              <option value="fl. oz">fl. oz</option>
                              <option value="whole unit">whole unit</option>
                            </select>
                          </td>
                          <td className="py-3 text-right font-medium">
                            ${line.lineCost.toFixed(2)}
                          </td>
                          <td className="py-3 text-right">
                            <button
                              onClick={() => removeScannedLine(idx)}
                              className="text-red-500 hover:text-red-700 text-sm"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cost Summary for Scanned Recipe */}
              <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl shadow-lg p-6 text-white">
                <h2 className="text-lg font-semibold mb-4">Cost Summary</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white/20 rounded-lg p-4 text-center">
                    <p className="text-sm opacity-80">Ingredient Cost</p>
                    <p className="text-2xl font-bold">${scannedRecipe.ingredientCost.toFixed(2)}</p>
                  </div>
                  <div className="bg-white/20 rounded-lg p-4 text-center">
                    <p className="text-sm opacity-80">Cost Per Serving</p>
                    <p className="text-2xl font-bold">${scannedRecipe.costPerYield.toFixed(2)}</p>
                  </div>
                  <div className="bg-white/20 rounded-lg p-4 text-center">
                    <p className="text-sm opacity-80">With 50% Markup</p>
                    <p className="text-2xl font-bold">${scannedRecipe.costWithMarkup.toFixed(2)}</p>
                  </div>
                  <div className="bg-white/30 rounded-lg p-4 text-center">
                    <p className="text-sm opacity-80">Suggested Price</p>
                    <p className="text-3xl font-bold">${(Math.ceil(scannedRecipe.costWithMarkup) - 0.01).toFixed(2)}</p>
                  </div>
                </div>
              </div>

              {/* Save Scanned Recipe */}
              <div className="flex justify-between items-center">
                <p className={saveMessage.includes("Error") ? "text-red-600" : "text-green-600"}>
                  {saveMessage}
                </p>
                <button
                  onClick={saveScannedRecipe}
                  disabled={saving || !scannedRecipe.name || scannedRecipe.lines.length === 0}
                  className="bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition font-medium text-lg"
                >
                  {saving ? "Saving..." : "Save Recipe"}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* Build Recipe Sub-Tab */}
      {subTab === "build" && (
        <>
      {/* Recipe Info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Recipe Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Recipe Name *</label>
            <input
              type="text"
              value={recipeName}
              onChange={(e) => setRecipeName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="e.g., Chef's Special Pad Thai"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={recipeCategory}
              onChange={(e) => setRecipeCategory(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-orange-500"
            >
              <option value="Appetizers">Appetizers</option>
              <option value="Noodles">Noodles</option>
              <option value="Soups">Soups</option>
              <option value="Rice Dishes">Rice Dishes</option>
              <option value="Salads">Salads</option>
              <option value="Beverages">Beverages</option>
              <option value="Desserts">Desserts</option>
            </select>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Yields</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={yieldQty}
                onChange={(e) => setYieldQty(parseFloat(e.target.value) || 1)}
                className="w-20 border border-gray-300 rounded-lg px-3 py-2"
                min="1"
              />
              <select
                value={yieldUnit}
                onChange={(e) => setYieldUnit(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="serving">serving(s)</option>
                <option value="portion">portion(s)</option>
                <option value="whole unit">unit(s)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Add Ingredient */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Add Ingredients</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2 relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Ingredient</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-orange-500"
              placeholder="Type to search..."
            />
            {searchTerm && filteredIngredients.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredIngredients.slice(0, 10).map((ing) => (
                  <button
                    key={ing.id}
                    onClick={() => {
                      setSelectedIngredient(ing.id);
                      setSearchTerm(ing.name);
                      setLineUnit(ing.perUnit);
                    }}
                    className={`w-full text-left px-4 py-2 hover:bg-orange-50 ${
                      selectedIngredient === ing.id ? "bg-orange-100" : ""
                    }`}
                  >
                    <span className="font-medium">{ing.name}</span>
                    <span className="text-gray-500 text-sm ml-2">
                      ${ing.unitCost.toFixed(4)}/{ing.perUnit}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
            <input
              type="number"
              value={lineQty}
              onChange={(e) => setLineQty(parseFloat(e.target.value) || 0)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2"
              min="0"
              step="0.1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
            <select
              value={lineUnit}
              onChange={(e) => setLineUnit(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2"
            >
              <option value="g">g</option>
              <option value="kg">kg</option>
              <option value="mL">mL</option>
              <option value="L">L</option>
              <option value="fl. oz">fl. oz</option>
              <option value="whole unit">whole unit</option>
            </select>
          </div>
        </div>
        <button
          onClick={addIngredientLine}
          disabled={!selectedIngredient}
          className="mt-4 bg-orange-500 text-white px-6 py-2 rounded-lg hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition font-medium"
        >
          + Add Ingredient
        </button>
      </div>

      {/* Ingredient List */}
      {lines.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Recipe Ingredients</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-sm text-gray-600">
                  <th className="py-2">Ingredient</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2">Unit</th>
                  <th className="py-2 text-right">Cost</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="py-3">{line.ingredientName}</td>
                    <td className="py-3 text-right">{line.quantity}</td>
                    <td className="py-3">{line.unit}</td>
                    <td className="py-3 text-right font-medium">${line.lineCost.toFixed(2)}</td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => removeLine(idx)}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cost Summary */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl shadow-lg p-6 text-white">
        <h2 className="text-lg font-semibold mb-4">Cost Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white/20 rounded-lg p-4 text-center">
            <p className="text-sm opacity-80">Ingredient Cost</p>
            <p className="text-2xl font-bold">${ingredientTotal.toFixed(2)}</p>
          </div>
          <div className="bg-white/20 rounded-lg p-4 text-center">
            <p className="text-sm opacity-80">Cost Per {yieldUnit}</p>
            <p className="text-2xl font-bold">${costPerYield.toFixed(2)}</p>
          </div>
          <div className="bg-white/20 rounded-lg p-4 text-center">
            <p className="text-sm opacity-80">With 50% Markup</p>
            <p className="text-2xl font-bold">${priceWithMarkup.toFixed(2)}</p>
          </div>
          <div className="bg-white/30 rounded-lg p-4 text-center">
            <p className="text-sm opacity-80">Suggested Price</p>
            <p className="text-3xl font-bold">${(Math.ceil(priceWithMarkup) - 0.01).toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-between items-center">
        <p className={saveMessage.includes("Error") ? "text-red-600" : "text-green-600"}>
          {saveMessage}
        </p>
        <button
          onClick={saveRecipe}
          disabled={saving || !recipeName || lines.length === 0}
          className="bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition font-medium text-lg"
        >
          {saving ? "Saving..." : "Save Recipe"}
        </button>
      </div>

      {/* Footer info */}
      <div className="text-center text-sm text-gray-500">
        {ingredients.length} ingredients loaded from database
      </div>
        </>
      )}
    </div>
  );
}

// ============ ALERTS & ANALYSIS TAB ============

type Alert = {
  id: string;
  title: string;
  ingredient: string;
  supplier: string;
  oldPrice: number;
  newPrice: number;
  changePercent: number;
  impactLevel: 'Critical' | 'High' | 'Medium' | 'Low';
  affectedDishes: string[];
  totalCostImpact: number;
  aiRecommendation: string;
  createdAt: string;
};

type AlertsSummary = {
  totalAlerts: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  totalImpact: number;
};

function AlertsAnalysis() {
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [summary, setSummary] = useState<AlertsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'Critical' | 'High' | 'Medium' | 'Low'>('all');

  useEffect(() => {
    fetchAlerts();
  }, []);

  async function fetchAlerts() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/alerts');
      const data = await response.json();

      if (data.success) {
        setAlerts(data.alerts || []);
        setSummary(data.summary || null);
        setMessage(data.message || null);
      } else {
        setError(data.error || 'Failed to fetch alerts');
      }
    } catch (err) {
      setError('Failed to connect to alerts service');
    } finally {
      setLoading(false);
    }
  }

  const filteredAlerts = filter === 'all'
    ? alerts
    : alerts.filter(a => a.impactLevel === filter);

  const impactLevelColors = {
    Critical: 'bg-red-100 text-red-800 border-red-200',
    High: 'bg-orange-100 text-orange-800 border-orange-200',
    Medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    Low: 'bg-green-100 text-green-800 border-green-200',
  };

  const impactBadgeColors = {
    Critical: 'bg-red-600',
    High: 'bg-orange-500',
    Medium: 'bg-yellow-500',
    Low: 'bg-green-500',
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-red-600 border-t-transparent mx-auto mb-6" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Analyzing Price Changes...
        </h2>
        <p className="text-gray-600">
          Scanning invoices and generating AI recommendations
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Alerts</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchAlerts}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
            <p className="text-3xl font-bold text-gray-900">{summary.totalAlerts}</p>
            <p className="text-sm text-gray-600">Total Alerts</p>
          </div>
          <div className="bg-red-50 rounded-xl border border-red-200 p-4 text-center">
            <p className="text-3xl font-bold text-red-700">{summary.criticalCount}</p>
            <p className="text-sm text-red-600">Critical</p>
          </div>
          <div className="bg-orange-50 rounded-xl border border-orange-200 p-4 text-center">
            <p className="text-3xl font-bold text-orange-700">{summary.highCount}</p>
            <p className="text-sm text-orange-600">High</p>
          </div>
          <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4 text-center">
            <p className="text-3xl font-bold text-yellow-700">{summary.mediumCount}</p>
            <p className="text-sm text-yellow-600">Medium</p>
          </div>
          <div className="bg-green-50 rounded-xl border border-green-200 p-4 text-center">
            <p className="text-3xl font-bold text-green-700">{summary.lowCount}</p>
            <p className="text-sm text-green-600">Low</p>
          </div>
        </div>
      )}

      {/* Estimated Monthly Impact */}
      {summary && summary.totalImpact !== 0 && (
        <div className={`rounded-xl p-6 ${summary.totalImpact > 0 ? 'bg-gradient-to-r from-red-500 to-orange-500' : 'bg-gradient-to-r from-green-500 to-emerald-500'} text-white`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80">Estimated Monthly Cost Impact</p>
              <p className="text-3xl font-bold">
                {summary.totalImpact > 0 ? '+' : '-'}${Math.abs(summary.totalImpact).toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm opacity-80">Based on detected price changes</p>
              <p className="text-sm">Review recommendations below</p>
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      {alerts.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Filter by impact:</span>
              <div className="flex gap-1">
                {['all', 'Critical', 'High', 'Medium', 'Low'].map((level) => (
                  <button
                    key={level}
                    onClick={() => setFilter(level as any)}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                      filter === level
                        ? level === 'all'
                          ? 'bg-gray-900 text-white'
                          : `${impactBadgeColors[level as keyof typeof impactBadgeColors]} text-white`
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {level === 'all' ? 'All' : level}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={fetchAlerts}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* Message (no alerts) */}
      {message && alerts.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">All Clear!</h2>
          <p className="text-gray-600">{message}</p>
        </div>
      )}

      {/* Alerts List */}
      {filteredAlerts.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">
            Price Change Alerts ({filteredAlerts.length})
          </h2>

          {filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`bg-white rounded-xl shadow-sm border overflow-hidden ${impactLevelColors[alert.impactLevel]}`}
            >
              {/* Alert Header */}
              <div
                className="p-4 cursor-pointer hover:bg-gray-50 transition"
                onClick={() => setExpandedAlert(expandedAlert === alert.id ? null : alert.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold text-white ${impactBadgeColors[alert.impactLevel]}`}>
                        {alert.impactLevel}
                      </span>
                      <span className={`text-sm font-medium ${alert.changePercent > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {alert.changePercent > 0 ? '+' : ''}{alert.changePercent.toFixed(1)}%
                      </span>
                    </div>
                    <h3 className="font-semibold text-gray-900">{alert.ingredient}</h3>
                    <p className="text-sm text-gray-600">
                      ${alert.oldPrice.toFixed(2)} → ${alert.newPrice.toFixed(2)}
                      {alert.supplier && ` • ${alert.supplier}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${alert.totalCostImpact > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {alert.totalCostImpact > 0 ? '+' : '-'}${Math.abs(alert.totalCostImpact).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500">est. monthly</p>
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedAlert === alert.id && (
                <div className="px-4 pb-4 border-t border-gray-100">
                  {/* AI Recommendation */}
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-blue-900 mb-1">AI Recommendation</p>
                        <p className="text-sm text-blue-800">{alert.aiRecommendation}</p>
                      </div>
                    </div>
                  </div>

                  {/* Affected Dishes */}
                  {alert.affectedDishes.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">Affected Dishes:</p>
                      <div className="flex flex-wrap gap-2">
                        {alert.affectedDishes.map((dish, idx) => (
                          <span
                            key={idx}
                            className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                          >
                            {dish}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Info Box */}
      <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">How Price Alerts Work</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• Alerts are generated by comparing prices from your uploaded invoices</li>
          <li>• AI analyzes each price change and provides actionable recommendations</li>
          <li>• Impact levels are based on percentage change: Critical (20%+), High (10%+), Medium (5%+), Low (&lt;5%)</li>
          <li>• Monthly cost impact is estimated based on typical usage patterns</li>
        </ul>
      </div>
    </div>
  );
}

// ============ RECENT ACTIVITY FEED ============

function RecentActivityFeed({ highlightId }: { highlightId: string | null }) {
  const [invoices, setInvoices] = useState<RecentInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRecentInvoices();
  }, []);

  async function fetchRecentInvoices() {
    try {
      const response = await fetch('/api/recent-invoices');
      const data = await response.json();

      if (data.success) {
        setInvoices(data.invoices || []);
      } else {
        setError(data.error || 'Failed to load activity');
      }
    } catch {
      setError('Failed to connect');
    } finally {
      setLoading(false);
    }
  }

  function formatTimeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  const statusColors: Record<string, string> = {
    Confirmed: 'bg-green-100 text-green-700',
    Pending: 'bg-yellow-100 text-yellow-700',
    'Pending Review': 'bg-yellow-100 text-yellow-700',
    Rejected: 'bg-red-100 text-red-700',
    Error: 'bg-red-100 text-red-700',
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-5 h-5 bg-gray-200 rounded animate-pulse" />
          <div className="w-32 h-5 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg animate-pulse">
              <div className="w-10 h-10 bg-gray-200 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="w-24 h-4 bg-gray-200 rounded" />
                <div className="w-32 h-3 bg-gray-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <p className="text-gray-500 text-sm text-center">{error}</p>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-gray-600 font-medium">No invoices yet</p>
        <p className="text-gray-500 text-sm">Capture your first invoice to see it here</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="font-semibold text-gray-800">Recent Activity</h3>
        </div>
        <a
          href={NOTION_INVOICES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          View all
        </a>
      </div>

      {/* Activity List */}
      <div className="divide-y divide-gray-50">
        {invoices.slice(0, 5).map((invoice) => {
          const isHighlighted = highlightId === invoice.id;

          return (
            <a
              key={invoice.id}
              href={invoice.notionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors ${
                isHighlighted ? 'bg-green-50 border-l-4 border-green-500' : ''
              }`}
            >
              {/* Icon */}
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                isHighlighted ? 'bg-green-500' : 'bg-blue-100'
              }`}>
                <svg className={`w-5 h-5 ${isHighlighted ? 'text-white' : 'text-blue-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 truncate">
                    {invoice.invoiceNumber || 'Invoice'}
                  </p>
                  {isHighlighted && (
                    <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">
                      New
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 truncate">
                  {invoice.supplier || 'Unknown supplier'} • {invoice.itemsCount} items
                </p>
              </div>

              {/* Right side */}
              <div className="text-right flex-shrink-0">
                <p className="font-semibold text-gray-900">
                  ${invoice.totalAmount.toFixed(2)}
                </p>
                <div className="flex items-center gap-2 justify-end">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[invoice.status] || 'bg-gray-100 text-gray-600'}`}>
                    {invoice.status}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatTimeAgo(invoice.createdAt)}
                  </span>
                </div>
              </div>
            </a>
          );
        })}
      </div>

      {/* Footer */}
      {invoices.length > 5 && (
        <div className="px-4 py-3 bg-gray-50 text-center">
          <a
            href={NOTION_INVOICES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-600 hover:text-gray-800"
          >
            + {invoices.length - 5} more invoices
          </a>
        </div>
      )}
    </div>
  );
}

// ============ SHARED COMPONENTS ============

function StepIndicator({ number, label, active, completed, color }: { number: number; label: string; active: boolean; completed: boolean; color: string }) {
  const colorClasses = {
    blue: { active: "bg-blue-600", completed: "bg-green-600" },
    purple: { active: "bg-purple-600", completed: "bg-green-600" },
    orange: { active: "bg-orange-500", completed: "bg-green-600" },
  };

  const colors = colorClasses[color as keyof typeof colorClasses] || colorClasses.blue;

  return (
    <div className="flex flex-col items-center">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
          completed
            ? `${colors.completed} text-white`
            : active
            ? `${colors.active} text-white`
            : "bg-gray-200 text-gray-600"
        }`}
      >
        {completed ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          number
        )}
      </div>
      <span className={`mt-1 text-xs ${active || completed ? "text-gray-900" : "text-gray-500"}`}>
        {label}
      </span>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className="text-gray-900 font-medium">{value || "—"}</dd>
    </div>
  );
}

// ============ INGREDIENT MATCHING TAB ============

type MatchedIngredient = {
  id: string;
  name: string;
  unitCost: number;
  perUnit: string;
  latestPrice: number | null;
  priceUpdated: string | null;
};

type InvoiceItemMatch = {
  id: string;
  productName: string;
  unitPrice: number;
  unit: string;
  invoiceDate: string;
};

type MatchResult = {
  invoiceItem: InvoiceItemMatch;
  matchedIngredient: MatchedIngredient | null;
  confidence: "high" | "medium" | "low" | "none";
  needsClarification: boolean;
  possibleMatches: MatchedIngredient[];
  aiSuggestion?: string;
};

type PriceChange = {
  ingredientId: string;
  ingredientName: string;
  referencePrice: number;
  latestPrice: number;
  variance: number;
  variancePct: number;
  invoiceDate: string;
  unit: string;
};

type MatchingResponse = {
  success: boolean;
  summary: {
    totalInvoiceItems: number;
    autoMatched: number;
    needsClarification: number;
    noMatch: number;
    priceChangesDetected: number;
  };
  priceChanges: PriceChange[];
  needsClarification: MatchResult[];
  ingredients: number;
};

function IngredientMatching() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MatchingResponse | null>(null);
  const [activeSection, setActiveSection] = useState<"clarifications" | "prices">("clarifications");
  const [confirmingMatch, setConfirmingMatch] = useState<string | null>(null);

  const fetchMatchingData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/match-ingredients");
      if (!response.ok) throw new Error("Failed to fetch matching data");
      const result = await response.json();
      if (result.success) {
        setData(result);
      } else {
        throw new Error(result.error || "Unknown error");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatchingData();
  }, []);

  const confirmMatch = async (ingredientId: string, newPrice: number, invoiceDate: string, itemId: string) => {
    setConfirmingMatch(itemId);
    try {
      const response = await fetch("/api/match-ingredients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredientId, newPrice, invoiceDate, invoiceItemId: itemId }),
      });
      if (response.ok) {
        // Refresh data after confirming
        await fetchMatchingData();
      }
    } catch (err) {
      console.error("Failed to confirm match:", err);
    } finally {
      setConfirmingMatch(null);
    }
  };

  const getConfidenceBadge = (confidence: string) => {
    const styles: Record<string, string> = {
      high: "bg-green-100 text-green-800",
      medium: "bg-yellow-100 text-yellow-800",
      low: "bg-orange-100 text-orange-800",
      none: "bg-gray-100 text-gray-800",
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[confidence] || styles.none}`}>
        {confidence}
      </span>
    );
  };

  if (loading && !data) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12">
        <div className="flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mb-4" />
          <p className="text-gray-600">Analyzing invoice items and matching ingredients...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Data</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchMatchingData}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Summary */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Ingredient Matching</h2>
            <p className="text-sm text-gray-500 mt-1">Match invoice items to your ingredient database</p>
          </div>
          <button
            onClick={fetchMatchingData}
            disabled={loading}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
            Refresh
          </button>
        </div>

        {data && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{data.summary.totalInvoiceItems}</div>
              <div className="text-xs text-gray-500">Invoice Items</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{data.summary.autoMatched}</div>
              <div className="text-xs text-gray-500">Auto-Matched</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-amber-600">{data.summary.needsClarification}</div>
              <div className="text-xs text-gray-500">Need Review</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-400">{data.summary.noMatch}</div>
              <div className="text-xs text-gray-500">No Match</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{data.summary.priceChangesDetected}</div>
              <div className="text-xs text-gray-500">Price Changes</div>
            </div>
          </div>
        )}
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveSection("clarifications")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeSection === "clarifications"
              ? "bg-amber-500 text-white"
              : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
          }`}
        >
          Clarifications Needed ({data?.needsClarification.length || 0})
        </button>
        <button
          onClick={() => setActiveSection("prices")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeSection === "prices"
              ? "bg-blue-500 text-white"
              : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
          }`}
        >
          Price Variations ({data?.priceChanges.length || 0})
        </button>
      </div>

      {/* Clarifications Section */}
      {activeSection === "clarifications" && data && (
        <div className="space-y-4">
          {data.needsClarification.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
              <div className="text-green-500 text-5xl mb-4">✓</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">All Clear!</h3>
              <p className="text-gray-600">No items need clarification at this time.</p>
            </div>
          ) : (
            data.needsClarification.map((match) => (
              <div key={match.invoiceItem.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">{match.invoiceItem.productName}</h3>
                    <p className="text-sm text-gray-500">
                      ${match.invoiceItem.unitPrice.toFixed(2)} / {match.invoiceItem.unit || "unit"} • {match.invoiceItem.invoiceDate}
                    </p>
                  </div>
                  {getConfidenceBadge(match.confidence)}
                </div>

                {match.aiSuggestion && (
                  <div className="mb-4 p-3 bg-purple-50 rounded-lg border border-purple-100">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-purple-600">🤖</span>
                      <span className="text-xs font-medium text-purple-700">AI Suggestion</span>
                    </div>
                    <p className="text-sm text-purple-800">{match.aiSuggestion}</p>
                  </div>
                )}

                {match.possibleMatches.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Possible Matches</p>
                    {match.possibleMatches.map((ingredient) => (
                      <div
                        key={ingredient.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <div>
                          <span className="font-medium text-gray-900">{ingredient.name}</span>
                          <span className="text-sm text-gray-500 ml-2">
                            ${ingredient.unitCost.toFixed(2)} / {ingredient.perUnit}
                          </span>
                        </div>
                        <button
                          onClick={() =>
                            confirmMatch(
                              ingredient.id,
                              match.invoiceItem.unitPrice,
                              match.invoiceItem.invoiceDate,
                              match.invoiceItem.id
                            )
                          }
                          disabled={confirmingMatch === match.invoiceItem.id}
                          className="px-3 py-1.5 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50"
                        >
                          {confirmingMatch === match.invoiceItem.id ? "Confirming..." : "Confirm Match"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {match.possibleMatches.length === 0 && (
                  <div className="p-4 bg-gray-50 rounded-lg text-center">
                    <p className="text-gray-500 text-sm">No matching ingredients found</p>
                    <button className="mt-2 text-amber-600 text-sm font-medium hover:text-amber-700">
                      + Create New Ingredient
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Price Variations Section */}
      {activeSection === "prices" && data && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {data.priceChanges.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-blue-500 text-5xl mb-4">📊</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Price Changes</h3>
              <p className="text-gray-600">Prices are stable compared to reference costs.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Ingredient</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Reference</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Latest</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Variance</th>
                  <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.priceChanges.map((change, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <span className="font-medium text-gray-900">{change.ingredientName}</span>
                      <span className="text-gray-400 text-sm ml-2">/ {change.unit}</span>
                    </td>
                    <td className="px-6 py-4 text-right text-gray-600">${change.referencePrice.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-medium text-gray-900">${change.latestPrice.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right">
                      <span
                        className={`font-medium ${
                          change.variancePct > 0 ? "text-red-600" : "text-green-600"
                        }`}
                      >
                        {change.variancePct > 0 ? "+" : ""}
                        {change.variancePct.toFixed(1)}%
                      </span>
                      <span className="text-gray-400 text-sm ml-1">
                        ({change.variance > 0 ? "+" : ""}${change.variance.toFixed(2)})
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-500">{change.invoiceDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ============ COST CALCULATOR TAB ============

type RecipeImpactIngredient = {
  name: string;
  quantity: number;
  unit: string;
  referenceUnitCost: number;
  actualUnitCost: number;
  referenceCost: number;
  actualCost: number;
  variance: number;
  variancePct: number;
};

type RecipeImpactData = {
  recipe: {
    id: string;
    name: string;
    category: string;
    yieldQty: number;
    yieldUnit: string;
    sellingPrice: number;
  };
  ingredients: RecipeImpactIngredient[];
  referenceTotalCost: number;
  actualTotalCost: number;
  costVariancePerPortion: number;
  costVariancePct: number;
  unitsSoldInPeriod: number;
  totalFinancialImpact: number;
  sellingPrice: number;
  referenceMarginPct: number;
  actualMarginPct: number;
  marginImpactPct: number;
  recommendation: string;
};

type IngredientPriceChange = {
  ingredientId: string;
  ingredientName: string;
  referencePrice: number;
  actualPrice: number;
  priceVariance: number;
  variancePct: number;
  perUnit: string;
  invoiceDate: string | null;
};

type CostCalculatorResponse = {
  success: boolean;
  period: {
    type: string;
    startDate: string;
    endDate: string;
  };
  summary: {
    totalRecipes: number;
    recipesWithIncrease: number;
    recipesWithDecrease: number;
    criticalRecipes: number;
    totalUnitsSold: number;
    totalReferenceCostandise: number;
    totalActualCost: number;
    totalFinancialImpact: number;
    avgVariancePct: number;
    invoiceItemsAnalyzed: number;
    ingredientsWithPriceChange: number;
  };
  topImpactedRecipes: RecipeImpactData[];
  recipesWithVariance: RecipeImpactData[];
  ingredientPriceChanges: IngredientPriceChange[];
  aiSummary: string;
};

function CostCalculator() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CostCalculatorResponse | null>(null);
  const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"impact" | "recipes" | "ingredients">("impact");
  const [period, setPeriod] = useState<string>("week");

  const fetchCostData = async (selectedPeriod: string = period) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/cost-calculator?period=${selectedPeriod}`);
      if (!response.ok) throw new Error("Failed to fetch cost data");
      const result = await response.json();
      if (result.success) {
        setData(result);
      } else {
        throw new Error(result.error || "Unknown error");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCostData();
  }, []);

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod);
    fetchCostData(newPeriod);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatPercent = (value: number, showSign = true) => {
    const sign = showSign && value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  if (loading && !data) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12">
        <div className="flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mb-4" />
          <p className="text-gray-600">Calculating recipe costs and variances...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Data</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchCostData}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Period Selector */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl shadow-lg p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">Food Cost Sentinel</h2>
            <p className="text-emerald-100 mt-1">
              {data?.period ? `${data.period.startDate} to ${data.period.endDate}` : 'Analyzing cost variances and financial impact'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Period Selector */}
            <select
              value={period}
              onChange={(e) => handlePeriodChange(e.target.value)}
              className="px-3 py-2 bg-white/20 text-white rounded-lg border border-white/30 focus:outline-none focus:ring-2 focus:ring-white/50"
            >
              <option value="week" className="text-gray-900">Last 7 Days</option>
              <option value="month" className="text-gray-900">Last 30 Days</option>
              <option value="ytd" className="text-gray-900">Year to Date</option>
            </select>
            <button
              onClick={() => fetchCostData()}
              disabled={loading}
              className="px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
              Refresh
            </button>
          </div>
        </div>

        {/* AI Summary Banner */}
        {data?.aiSummary && (
          <div className="bg-white/10 rounded-lg p-4 mb-4">
            <p className="text-lg">{data.aiSummary}</p>
          </div>
        )}

        {data && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white/10 rounded-lg p-4">
              <div className="text-3xl font-bold">{data.summary.totalRecipes}</div>
              <div className="text-sm text-emerald-100">Recipes</div>
            </div>
            <div className="bg-white/10 rounded-lg p-4">
              <div className="text-3xl font-bold">{data.summary.totalUnitsSold.toLocaleString()}</div>
              <div className="text-sm text-emerald-100">Units Sold</div>
            </div>
            <div className="bg-white/10 rounded-lg p-4">
              <div className="text-3xl font-bold">{data.summary.invoiceItemsAnalyzed}</div>
              <div className="text-sm text-emerald-100">Invoice Items</div>
            </div>
            <div className={`rounded-lg p-4 ${data.summary.totalFinancialImpact > 0 ? 'bg-red-500/30' : 'bg-green-500/30'}`}>
              <div className="text-3xl font-bold">
                {data.summary.totalFinancialImpact > 0 ? '+' : ''}{formatCurrency(data.summary.totalFinancialImpact)}
              </div>
              <div className="text-sm text-emerald-100">Financial Impact</div>
            </div>
            <div className={`rounded-lg p-4 ${data.summary.criticalRecipes > 0 ? 'bg-red-500/30' : 'bg-white/10'}`}>
              <div className="text-3xl font-bold">{data.summary.criticalRecipes}</div>
              <div className="text-sm text-emerald-100">Critical Items</div>
            </div>
          </div>
        )}
      </div>

      {/* Impact Summary Cards */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">📈</span>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{data.summary.recipesWithIncrease}</div>
                <div className="text-sm text-gray-500">Cost Increases</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">📉</span>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{data.summary.recipesWithDecrease}</div>
                <div className="text-sm text-gray-500">Cost Decreases</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">🥕</span>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-600">{data.summary.ingredientsWithPriceChange}</div>
                <div className="text-sm text-gray-500">Price Changes</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">📊</span>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">{formatPercent(data.summary.avgVariancePct)}</div>
                <div className="text-sm text-gray-500">Avg Variance</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Mode Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode("impact")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            viewMode === "impact"
              ? "bg-emerald-600 text-white"
              : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
          }`}
        >
          Top Impact ({data?.topImpactedRecipes.filter(r => r.unitsSoldInPeriod > 0).length || 0})
        </button>
        <button
          onClick={() => setViewMode("recipes")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            viewMode === "recipes"
              ? "bg-emerald-600 text-white"
              : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
          }`}
        >
          All Recipes ({data?.topImpactedRecipes.length || 0})
        </button>
        <button
          onClick={() => setViewMode("ingredients")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            viewMode === "ingredients"
              ? "bg-emerald-600 text-white"
              : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
          }`}
        >
          Ingredient Prices ({data?.ingredientPriceChanges.length || 0})
        </button>
      </div>

      {/* Top Impact View - Financial Impact Focus */}
      {viewMode === "impact" && data && (
        <div className="space-y-4">
          {data.topImpactedRecipes.filter(r => r.unitsSoldInPeriod > 0 || Math.abs(r.costVariancePct) > 2).length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
              <div className="text-emerald-500 text-5xl mb-4">✓</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Significant Impact</h3>
              <p className="text-gray-600">All recipes are within normal cost variance range for this period.</p>
            </div>
          ) : (
            data.topImpactedRecipes.filter(r => r.unitsSoldInPeriod > 0 || Math.abs(r.costVariancePct) > 2).slice(0, 15).map((item) => (
              <div key={item.recipe.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div
                  className="p-5 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedRecipe(expandedRecipe === item.recipe.id ? null : item.recipe.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-3 h-16 rounded-full ${
                        item.totalFinancialImpact > 50 ? 'bg-red-500' :
                        item.totalFinancialImpact > 0 ? 'bg-orange-400' :
                        item.totalFinancialImpact < -50 ? 'bg-green-500' :
                        'bg-gray-300'
                      }`} />
                      <div>
                        <h3 className="font-semibold text-gray-900 text-lg">{item.recipe.name}</h3>
                        <p className="text-sm text-gray-500">
                          {item.recipe.category || 'Uncategorized'} • {item.unitsSoldInPeriod.toLocaleString()} sold this period
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-xs text-gray-500 uppercase">Per Unit</div>
                        <div className={`text-lg font-bold ${item.costVariancePerPortion > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {item.costVariancePerPortion > 0 ? '+' : ''}{formatCurrency(item.costVariancePerPortion)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500 uppercase">Variance</div>
                        <div className={`text-lg font-bold ${item.costVariancePct > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatPercent(item.costVariancePct)}
                        </div>
                      </div>
                      <div className="text-right min-w-[120px]">
                        <div className="text-xs text-gray-500 uppercase">Total Impact</div>
                        <div className={`text-2xl font-bold ${item.totalFinancialImpact > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {item.totalFinancialImpact > 0 ? '+' : ''}{formatCurrency(item.totalFinancialImpact)}
                        </div>
                      </div>
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform ${expandedRecipe === item.recipe.id ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Recommendation Banner */}
                  <div className={`mt-3 p-3 rounded-lg text-sm ${
                    item.recommendation.includes('CRITICAL') ? 'bg-red-50 text-red-800 border border-red-200' :
                    item.recommendation.includes('HIGH') ? 'bg-orange-50 text-orange-800 border border-orange-200' :
                    item.recommendation.includes('OPPORTUNITY') ? 'bg-green-50 text-green-800 border border-green-200' :
                    'bg-gray-50 text-gray-700 border border-gray-200'
                  }`}>
                    {item.recommendation}
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedRecipe === item.recipe.id && (
                  <div className="border-t border-gray-200 bg-gray-50 p-4">
                    <div className="grid grid-cols-4 gap-4 mb-4 text-sm">
                      <div className="bg-white rounded-lg p-3">
                        <div className="text-gray-500">Reference Cost</div>
                        <div className="font-bold text-lg">{formatCurrency(item.referenceTotalCost)}</div>
                      </div>
                      <div className="bg-white rounded-lg p-3">
                        <div className="text-gray-500">Actual Cost</div>
                        <div className="font-bold text-lg">{formatCurrency(item.actualTotalCost)}</div>
                      </div>
                      <div className="bg-white rounded-lg p-3">
                        <div className="text-gray-500">Selling Price</div>
                        <div className="font-bold text-lg">{item.sellingPrice > 0 ? formatCurrency(item.sellingPrice) : '—'}</div>
                      </div>
                      <div className="bg-white rounded-lg p-3">
                        <div className="text-gray-500">Margin Impact</div>
                        <div className={`font-bold text-lg ${item.marginImpactPct < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatPercent(item.marginImpactPct)}
                        </div>
                      </div>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-500 text-xs uppercase">
                          <th className="text-left py-2">Ingredient</th>
                          <th className="text-right py-2">Qty</th>
                          <th className="text-right py-2">Ref $/unit</th>
                          <th className="text-right py-2">Actual $/unit</th>
                          <th className="text-right py-2">Line Cost</th>
                          <th className="text-right py-2">Variance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.ingredients.map((ing, idx) => (
                          <tr key={idx} className="border-t border-gray-200">
                            <td className="py-2 font-medium text-gray-900">{ing.name}</td>
                            <td className="py-2 text-right text-gray-600">{ing.quantity} {ing.unit}</td>
                            <td className="py-2 text-right text-gray-600">{formatCurrency(ing.referenceUnitCost)}</td>
                            <td className="py-2 text-right text-gray-900">{formatCurrency(ing.actualUnitCost)}</td>
                            <td className="py-2 text-right text-gray-900">{formatCurrency(ing.actualCost)}</td>
                            <td className={`py-2 text-right font-medium ${
                              ing.variancePct > 0 ? 'text-red-600' : ing.variancePct < 0 ? 'text-green-600' : 'text-gray-400'
                            }`}>
                              {Math.abs(ing.variancePct) >= 1 ? formatPercent(ing.variancePct) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* All Recipes View */}
      {viewMode === "recipes" && data && (
        <div className="space-y-3">
          {data.topImpactedRecipes.map((item) => (
            <div key={item.recipe.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex items-center justify-between hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-10 rounded-full ${
                  item.costVariancePct > 5 ? 'bg-red-500' :
                  item.costVariancePct > 0 ? 'bg-orange-400' :
                  item.costVariancePct < -5 ? 'bg-green-500' :
                  'bg-gray-300'
                }`} />
                <div>
                  <div className="font-medium text-gray-900">{item.recipe.name}</div>
                  <div className="text-xs text-gray-500">{item.recipe.category || 'Uncategorized'}</div>
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div className="text-right">
                  <div className="text-gray-500">Reference</div>
                  <div className="font-medium">{formatCurrency(item.referenceTotalCost)}</div>
                </div>
                <div className="text-right">
                  <div className="text-gray-500">Actual</div>
                  <div className="font-medium">{formatCurrency(item.actualTotalCost)}</div>
                </div>
                <div className="text-right min-w-[70px]">
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                    item.costVariancePct > 5 ? 'bg-red-100 text-red-800' :
                    item.costVariancePct > 0 ? 'bg-orange-100 text-orange-800' :
                    item.costVariancePct < -5 ? 'bg-green-100 text-green-800' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {formatPercent(item.costVariancePct)}
                  </span>
                </div>
                <div className="text-right min-w-[60px]">
                  <div className="text-gray-400 text-xs">Sold</div>
                  <div className="font-medium">{item.unitsSoldInPeriod}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ingredients View */}
      {viewMode === "ingredients" && data && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {data.ingredientPriceChanges.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-emerald-500 text-5xl mb-4">✓</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Prices Stable</h3>
              <p className="text-gray-600">No significant ingredient price changes detected in invoices for this period.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Ingredient</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Reference</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Invoice Price</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Change</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Variance</th>
                  <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Invoice Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.ingredientPriceChanges.map((ing) => (
                  <tr key={ing.ingredientId} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <span className="font-medium text-gray-900">{ing.ingredientName}</span>
                      <span className="text-gray-400 text-sm ml-2">/ {ing.perUnit}</span>
                    </td>
                    <td className="px-6 py-4 text-right text-gray-600">{formatCurrency(ing.referencePrice)}</td>
                    <td className="px-6 py-4 text-right font-medium text-gray-900">{formatCurrency(ing.actualPrice)}</td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-medium ${ing.priceVariance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {ing.priceVariance > 0 ? '+' : ''}{formatCurrency(ing.priceVariance)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${
                        ing.variancePct > 10 ? 'bg-red-100 text-red-800' :
                        ing.variancePct > 0 ? 'bg-orange-100 text-orange-800' :
                        ing.variancePct < -10 ? 'bg-green-100 text-green-800' :
                        'bg-green-50 text-green-700'
                      }`}>
                        {formatPercent(ing.variancePct)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-500">
                      {ing.invoiceDate || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
