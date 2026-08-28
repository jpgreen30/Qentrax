"use client";

import { useEffect, useState } from "react";
import type { ConnectorConfig, ConnectorHealthStatus } from "@/lib/connectors";

interface ConnectorWithHealth extends ConnectorConfig {
  health?: ConnectorHealthStatus;
}

export function ConnectorsDashboard({ organizationId }: { organizationId: string }) {
  const [connectors, setConnectors] = useState<ConnectorWithHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadConnectors() {
      try {
        const response = await fetch(`/api/v1/connectors`);
        const data = await response.json();

        if (!data.success) {
          setError(data.error || "Failed to load connectors");
          return;
        }

        setConnectors(data.connectors || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    loadConnectors();
  }, [organizationId]);

  if (loading) return <div className="text-center py-8">Loading connectors...</div>;

  if (error) return <div className="text-center py-8 text-red-600">{error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">External Connectors</h1>
        <button className="bg-blue-600 text-white px-4 py-2 rounded">
          Add Connector
        </button>
      </div>

      {connectors.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No connectors configured yet.
        </div>
      ) : (
        <div className="grid gap-4">
          {connectors.map((connector) => (
            <div
              key={connector.id}
              className="border rounded-lg p-4 bg-white shadow"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-semibold">{connector.name}</h2>
                  <p className="text-sm text-gray-600">
                    {connector.connector_type} • {connector.endpoint_url}
                  </p>
                </div>
                <span
                  className={`px-3 py-1 rounded text-sm font-medium ${
                    connector.status === "active"
                      ? "bg-green-100 text-green-800"
                      : connector.status === "testing"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-red-100 text-red-800"
                  }`}
                >
                  {connector.status}
                </span>
              </div>

              {connector.health && (
                <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <span className="text-gray-600">Status:</span>
                    <p className="font-medium">{connector.health.status}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Error Rate:</span>
                    <p className="font-medium">
                      {(connector.health.error_rate * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-600">Avg Latency:</span>
                    <p className="font-medium">{connector.health.avg_latency_ms}ms</p>
                  </div>
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <button className="text-blue-600 hover:underline text-sm">
                  Edit
                </button>
                <button className="text-red-600 hover:underline text-sm">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
