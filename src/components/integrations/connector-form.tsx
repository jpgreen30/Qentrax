"use client";

import { FormEvent, useState } from "react";
import { ConnectorType, ConnectorStatus } from "@/lib/connectors/types";
import type { ConnectorConfig } from "@/lib/connectors/types";

interface ConnectorFormProps {
  organizationId: string;
  connector?: ConnectorConfig;
  onSubmit: (connector: Partial<ConnectorConfig>) => Promise<void>;
  onCancel: () => void;
}

const CONNECTOR_TYPES = Object.values(ConnectorType);
const AUTH_TYPES = ["none", "api_key", "bearer", "basic", "oauth"] as const;

interface FormData {
  name: string;
  connector_type: string;
  endpoint_url: string;
  method: "GET" | "POST" | "PUT";
  auth_type: string;
  auth_credential_ref: string;
  request_format: string;
  response_format: string;
  timeout_ms: number;
  status: string;
}

export function ConnectorForm({ organizationId, connector, onSubmit, onCancel }: ConnectorFormProps) {
  const [formData, setFormData] = useState<FormData>({
    name: connector?.name || "",
    connector_type: connector?.connector_type || ConnectorType.WEBHOOK,
    endpoint_url: connector?.endpoint_url || "",
    method: connector?.method || "POST",
    auth_type: connector?.auth_type || "none",
    auth_credential_ref: connector?.auth_credential_ref || "",
    request_format: connector?.request_format || "json",
    response_format: connector?.response_format || "json",
    timeout_ms: connector?.timeout_ms || 5000,
    status: connector?.status || ConnectorStatus.TESTING,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await onSubmit({
        ...formData,
        organization_id: organizationId,
        connector_type: formData.connector_type as ConnectorType,
        status: formData.status as ConnectorStatus,
        auth_type: formData.auth_type as "none" | "api_key" | "bearer" | "basic" | "oauth",
        request_format: formData.request_format as "json" | "xml" | "form",
        response_format: formData.response_format as "json" | "xml",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save connector");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Connector Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="e.g., Salesforce Lead Endpoint"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Connector Type</label>
          <select
            value={formData.connector_type}
            onChange={(e) => setFormData({ ...formData, connector_type: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm"
          >
            {CONNECTOR_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, " ").toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Method</label>
          <select
            value={formData.method}
            onChange={(e) => setFormData({ ...formData, method: e.target.value as "GET" | "POST" | "PUT" })}
            className="w-full border rounded px-3 py-2 text-sm"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Endpoint URL</label>
        <input
          type="url"
          value={formData.endpoint_url}
          onChange={(e) => setFormData({ ...formData, endpoint_url: e.target.value })}
          required
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="https://example.com/webhook"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Auth Type</label>
          <select
            value={formData.auth_type}
            onChange={(e) => setFormData({ ...formData, auth_type: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm"
          >
            {AUTH_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        {formData.auth_type !== "none" && (
          <div>
            <label className="block text-sm font-medium mb-1">Auth Credential</label>
            <input
              type="password"
              value={formData.auth_credential_ref}
              onChange={(e) => setFormData({ ...formData, auth_credential_ref: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="API key or token"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Request Format</label>
          <select
            value={formData.request_format}
            onChange={(e) => setFormData({ ...formData, request_format: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm"
          >
            <option value="json">JSON</option>
            <option value="form">Form</option>
            <option value="xml">XML</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Response Format</label>
          <select
            value={formData.response_format}
            onChange={(e) => setFormData({ ...formData, response_format: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm"
          >
            <option value="json">JSON</option>
            <option value="xml">XML</option>
            <option value="text">Text</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Timeout (ms)</label>
          <input
            type="number"
            value={formData.timeout_ms}
            onChange={(e) => setFormData({ ...formData, timeout_ms: parseInt(e.target.value) })}
            className="w-full border rounded px-3 py-2 text-sm"
            min="1000"
            max="30000"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Status</label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm"
          >
            <option value={ConnectorStatus.TESTING}>Testing</option>
            <option value={ConnectorStatus.ACTIVE}>Active</option>
            <option value={ConnectorStatus.DISABLED}>Disabled</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border rounded text-sm hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Saving..." : connector ? "Update" : "Create"}
        </button>
      </div>
    </form>
  );
}
