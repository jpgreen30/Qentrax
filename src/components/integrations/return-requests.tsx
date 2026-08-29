"use client";

import { useEffect, useState } from "react";

interface ReturnRequest {
  id: string;
  transaction_id: string;
  delivery_id: string;
  organization_id: string;
  reason_code: string;
  reason_text?: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  resolved_at?: string;
}

interface ReturnRequestsProps {
  organizationId: string;
  onApprove?: (returnId: string) => void;
  onReject?: (returnId: string) => void;
}

export function ReturnRequests({ _organizationId, onApprove, onReject }: ReturnRequestsProps) {
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    async function loadReturns() {
      try {
        const response = await fetch(`/api/v1/returns?status=pending`);
        const data = await response.json();

        if (!data.success) {
          setError(data.error || "Failed to load return requests");
          return;
        }

        setReturns(data.returns || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    loadReturns();
  }, []);

  async function handleApprove(returnId: string) {
    setProcessingId(returnId);
    try {
      const response = await fetch(`/api/v1/returns/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ return_id: returnId, action: "approve" }),
      });

      const data = await response.json();
      if (data.success) {
        setReturns(returns.filter((r) => r.id !== returnId));
        onApprove?.(returnId);
      } else {
        setError(data.error || "Failed to approve return");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(returnId: string) {
    setProcessingId(returnId);
    try {
      const response = await fetch(`/api/v1/returns/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ return_id: returnId, action: "reject" }),
      });

      const data = await response.json();
      if (data.success) {
        setReturns(returns.filter((r) => r.id !== returnId));
        onReject?.(returnId);
      } else {
        setError(data.error || "Failed to reject return");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setProcessingId(null);
    }
  }

  if (loading) return <div className="text-center py-8">Loading return requests...</div>;

  if (error) return <div className="text-center py-8 text-red-600">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Return Requests</h2>
        <span className="text-sm text-gray-600">{returns.length} pending</span>
      </div>

      {returns.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No pending return requests.</div>
      ) : (
        <div className="space-y-3">
          {returns.map((ret) => (
            <div key={ret.id} className="border rounded-lg p-4 bg-white shadow">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-mono text-sm">
                    Transaction: {ret.transaction_id.substring(0, 12)}...
                  </p>
                  <p className="text-gray-600 text-sm mt-1">
                    <span className="font-medium">Reason:</span> {ret.reason_code}
                  </p>
                  {ret.reason_text && (
                    <p className="text-gray-600 text-sm">{ret.reason_text}</p>
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(ret.created_at).toLocaleDateString()}
                </span>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => handleApprove(ret.id)}
                  disabled={processingId === ret.id}
                  className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 disabled:opacity-50"
                >
                  {processingId === ret.id ? "Processing..." : "Approve"}
                </button>
                <button
                  onClick={() => handleReject(ret.id)}
                  disabled={processingId === ret.id}
                  className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 disabled:opacity-50"
                >
                  {processingId === ret.id ? "Processing..." : "Reject"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
