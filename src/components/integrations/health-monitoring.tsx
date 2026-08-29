"use client";

import { useEffect, useState } from "react";

interface HealthMetric {
  connector_id: string;
  connector_name: string;
  total_deliveries: number;
  successful_deliveries: number;
  failed_deliveries: number;
  pending_deliveries: number;
  avg_latency_ms: number;
  error_rate: number;
  last_delivery_at?: string;
}

interface HealthMonitoringProps {
  organizationId: string;
  refreshInterval?: number;
}

export function HealthMonitoring({ organizationId, refreshInterval = 30000 }: HealthMonitoringProps) {
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    async function loadMetrics() {
      try {
        const response = await fetch(`/api/v1/connectors/health?organization_id=${organizationId}`);
        const data = await response.json();

        if (!data.success) {
          setError(data.error || "Failed to load health metrics");
          return;
        }

        setMetrics(data.metrics || []);
        setLastUpdated(new Date());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    loadMetrics();
    const interval = setInterval(loadMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [organizationId, refreshInterval]);

  const getHealthStatus = (errorRate: number): "healthy" | "warning" | "critical" => {
    if (errorRate < 0.05) return "healthy";
    if (errorRate < 0.1) return "warning";
    return "critical";
  };

  const getStatusColor = (status: "healthy" | "warning" | "critical") => {
    switch (status) {
      case "healthy":
        return "bg-green-100 text-green-800";
      case "warning":
        return "bg-yellow-100 text-yellow-800";
      case "critical":
        return "bg-red-100 text-red-800";
    }
  };

  if (loading) return <div className="text-center py-8">Loading health metrics...</div>;

  if (error) return <div className="text-center py-8 text-red-600">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Connector Health</h2>
        {lastUpdated && (
          <span className="text-xs text-gray-600">
            Updated: {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      {metrics.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No health data available.</div>
      ) : (
        <div className="grid gap-4">
          {metrics.map((metric) => {
            const status = getHealthStatus(metric.error_rate);
            const successRate = metric.total_deliveries > 0
              ? ((metric.successful_deliveries / metric.total_deliveries) * 100).toFixed(1)
              : "N/A";

            return (
              <div key={metric.connector_id} className="border rounded-lg p-4 bg-white shadow">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold">{metric.connector_name}</h3>
                    <p className="text-xs text-gray-600">ID: {metric.connector_id.substring(0, 8)}...</p>
                  </div>
                  <span className={`px-3 py-1 rounded text-sm font-medium ${getStatusColor(status)}`}>
                    {status.toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Success Rate</span>
                    <p className="font-bold">{successRate}%</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Avg Latency</span>
                    <p className="font-bold">{metric.avg_latency_ms}ms</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Total Deliveries</span>
                    <p className="font-bold">{metric.total_deliveries}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Pending</span>
                    <p className="font-bold">{metric.pending_deliveries}</p>
                  </div>
                </div>

                <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      status === "healthy"
                        ? "bg-green-600"
                        : status === "warning"
                          ? "bg-yellow-600"
                          : "bg-red-600"
                    }`}
                    style={{ width: `${(metric.error_rate * 100).toFixed(1)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  Error rate: {(metric.error_rate * 100).toFixed(2)}%
                </p>

                {metric.last_delivery_at && (
                  <p className="text-xs text-gray-600 mt-2">
                    Last delivery: {new Date(metric.last_delivery_at).toLocaleString()}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
