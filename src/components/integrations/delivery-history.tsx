"use client";

import { useEffect, useState } from "react";

interface DeliveryRecord {
  id: string;
  transaction_id: string;
  opportunity_id: string;
  delivery_type: "native" | "external";
  attempt_number: number;
  status: "pending" | "accepted" | "failed";
  latency_ms: number;
  response_status_code?: number;
  error_message?: string;
  created_at: string;
  next_attempt_at?: string;
}

interface DeliveryHistoryProps {
  organizationId: string;
  filter?: "all" | "success" | "pending" | "failed";
}

export function DeliveryHistory({ organizationId, filter = "all" }: DeliveryHistoryProps) {
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    async function loadDeliveries() {
      try {
        const params = new URLSearchParams({
          organization_id: organizationId,
          limit: "20",
          offset: String((page - 1) * 20),
        });

        if (filter !== "all") {
          params.append("status", filter === "success" ? "accepted" : filter);
        }

        const response = await fetch(`/api/v1/deliveries?${params}`);
        const data = await response.json();

        if (!data.success) {
          setError(data.error || "Failed to load delivery history");
          return;
        }

        setDeliveries(data.deliveries || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    loadDeliveries();
  }, [organizationId, page, filter]);

  if (loading) return <div className="text-center py-8">Loading deliveries...</div>;

  if (error) return <div className="text-center py-8 text-red-600">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Delivery History</h2>
        <span className="text-sm text-gray-600">{deliveries.length} deliveries</span>
      </div>

      {deliveries.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No deliveries found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="text-left py-2 px-4">Transaction ID</th>
                <th className="text-left py-2 px-4">Type</th>
                <th className="text-left py-2 px-4">Status</th>
                <th className="text-left py-2 px-4">Attempt</th>
                <th className="text-left py-2 px-4">Latency</th>
                <th className="text-left py-2 px-4">Date</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => (
                <tr key={delivery.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-4 font-mono text-xs">
                    {delivery.transaction_id.substring(0, 12)}...
                  </td>
                  <td className="py-2 px-4">
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                      {delivery.delivery_type}
                    </span>
                  </td>
                  <td className="py-2 px-4">
                    <span
                      className={`text-xs px-2 py-1 rounded font-medium ${
                        delivery.status === "accepted"
                          ? "bg-green-100 text-green-800"
                          : delivery.status === "pending"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                      }`}
                    >
                      {delivery.status}
                    </span>
                  </td>
                  <td className="py-2 px-4">{delivery.attempt_number}</td>
                  <td className="py-2 px-4">{delivery.latency_ms}ms</td>
                  <td className="py-2 px-4 text-gray-600">
                    {new Date(delivery.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deliveries.length > 0 && (
        <div className="flex justify-between items-center mt-4">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-4 py-2 border rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">Page {page}</span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={deliveries.length < 20}
            className="px-4 py-2 border rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
