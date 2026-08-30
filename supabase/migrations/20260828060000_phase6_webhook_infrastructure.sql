-- Phase 6: Webhook Infrastructure
-- Enables external systems to receive status updates via webhooks

-- Webhook endpoints (where to send events)
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connector_id UUID NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  auth_type TEXT DEFAULT 'none' CHECK (auth_type IN ('none', 'hmac', 'api_key', 'bearer')),
  auth_credential TEXT, -- Encrypted in app layer
  events TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], -- Array of event types to subscribe to
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  CONSTRAINT valid_url CHECK (url ~ '^https?://')
);

-- Webhook events (what happened)
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  delivery_id UUID REFERENCES deliveries(id) ON DELETE SET NULL,
  return_id UUID REFERENCES return_requests(id) ON DELETE SET NULL,
  transaction_id TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connector_id UUID NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Webhook delivery attempts (audit trail)
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES webhook_events(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'retrying')),
  attempt_number INT DEFAULT 1 CHECK (attempt_number > 0),
  response_status_code INT,
  response_body TEXT,
  error_message TEXT,
  next_attempt_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_connector ON webhook_endpoints(connector_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_organization ON webhook_endpoints(organization_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_active ON webhook_endpoints(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_webhook_events_transaction ON webhook_events(transaction_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_organization ON webhook_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint ON webhook_deliveries(webhook_endpoint_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_next_attempt ON webhook_deliveries(next_attempt_at) WHERE status IN ('pending', 'retrying');

-- View for webhook retry queue
CREATE OR REPLACE VIEW webhook_retry_queue AS
SELECT
  d.id,
  d.webhook_endpoint_id,
  d.event_id,
  d.attempt_number,
  d.next_attempt_at,
  e.event_type,
  e.transaction_id,
  ep.url,
  ep.auth_type
FROM webhook_deliveries d
JOIN webhook_events e ON d.event_id = e.id
JOIN webhook_endpoints ep ON d.webhook_endpoint_id = ep.id
WHERE d.status IN ('pending', 'retrying')
  AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= now())
ORDER BY d.next_attempt_at ASC NULLS FIRST;

-- RLS Policies for webhook_endpoints
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_endpoints_organization_isolation ON webhook_endpoints
  USING (organization_id = org_id_from_auth());

CREATE POLICY webhook_endpoints_insert ON webhook_endpoints
  FOR INSERT WITH CHECK (organization_id = org_id_from_auth());

CREATE POLICY webhook_endpoints_update ON webhook_endpoints
  FOR UPDATE USING (organization_id = org_id_from_auth());

CREATE POLICY webhook_endpoints_delete ON webhook_endpoints
  FOR DELETE USING (organization_id = org_id_from_auth());

-- RLS Policies for webhook_events
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_events_organization_isolation ON webhook_events
  USING (organization_id = org_id_from_auth());

CREATE POLICY webhook_events_insert ON webhook_events
  FOR INSERT WITH CHECK (organization_id = org_id_from_auth());

-- RLS Policies for webhook_deliveries
-- Allow system access via service role key
ALTER TABLE webhook_deliveries DISABLE ROW LEVEL SECURITY;

-- Trigger to update webhook_endpoints updated_at
CREATE OR REPLACE FUNCTION update_webhook_endpoints_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_webhook_endpoints_updated_at ON webhook_endpoints;
CREATE TRIGGER trigger_webhook_endpoints_updated_at
  BEFORE UPDATE ON webhook_endpoints
  FOR EACH ROW
  EXECUTE FUNCTION update_webhook_endpoints_updated_at();

-- Trigger to update webhook_deliveries updated_at
CREATE OR REPLACE FUNCTION update_webhook_deliveries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_webhook_deliveries_updated_at ON webhook_deliveries;
CREATE TRIGGER trigger_webhook_deliveries_updated_at
  BEFORE UPDATE ON webhook_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION update_webhook_deliveries_updated_at();
