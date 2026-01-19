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

type RecipeLine = {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  lineCost: number;
};

// ============ CONSTANTS ============

const WEBHOOK_EXTRACT = "https://hanumet.app.n8n.cloud/webhook/demo-invoice-extract";
const WEBHOOK_CONFIRM = "https://hanumet.app.n8n.cloud/webhook/demo-invoice-confirm";
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
  const [activeTab, setActiveTab] = useState<"invoices" | "pos" | "recipe">("invoices");

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
        <div className="flex justify-center mb-8">
          <div className="inline-flex bg-white rounded-xl p-1.5 shadow-sm border border-gray-200">
            <button
              onClick={() => setActiveTab("invoices")}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === "invoices"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              Invoice Capture
            </button>
            <button
              onClick={() => setActiveTab("pos")}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === "pos"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              POS Sales
            </button>
            <button
              onClick={() => setActiveTab("recipe")}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === "recipe"
                  ? "bg-orange-500 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              Recipe Calculator
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === "invoices" && <InvoiceCapture />}
        {activeTab === "pos" && <POSSales />}
        {activeTab === "recipe" && <RecipeCalculator />}

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
      {step === "success" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Invoice Saved!
          </h2>
          <p className="text-gray-600 mb-6">
            Your invoice has been captured and stored successfully.
          </p>

          <div className="flex flex-col gap-3">
            {savedInvoiceId && (
              <a
                href={`https://www.notion.so/${savedInvoiceId.replace(/-/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-6 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
              >
                View Invoice in Notion
              </a>
            )}
            <a
              href={NOTION_INVOICES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              View All Invoices
            </a>
            <button
              onClick={reset}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Capture Another Invoice
            </button>
          </div>
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
