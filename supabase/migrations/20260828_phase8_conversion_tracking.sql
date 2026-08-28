-- Phase 8: Closed-Loop Conversion Tracking
-- Enables advertisers to report conversion outcomes for closed-loop reporting

-- Conversion events (outcome tracking)
CREATE TABLE IF NOT EXISTS conversion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversion_status TEXT NOT NULL CHECK (conversion_status IN ('qualified', 'approved', 'rejected', 'pending', 'unknown')),
  conversion_value DECIMAL(12, 2),
  conversion_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  event_type TEXT NOT NULL DEFAULT 'lead_qualified' CHECK (event_type IN ('lead_qualified', 'appointment', 'sale', 'application', 'custom')),
  event_metadata JSONB,
  external_conversion_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_conversion_events_organization ON conversion_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_conversion_events_delivery ON conversion_events(delivery_id);
CREATE INDEX IF NOT EXISTS idx_conversion_events_transaction ON conversion_events(transaction_id);
CREATE INDEX IF NOT EXISTS idx_conversion_events_status ON conversion_events(conversion_status);
CREATE INDEX IF NOT EXISTS idx_conversion_events_created_at ON conversion_events(created_at);
CREATE INDEX IF NOT EXISTS idx_conversion_events_event_type ON conversion_events(event_type);
CREATE INDEX IF NOT EXISTS idx_conversion_events_org_status ON conversion_events(organization_id, conversion_status);

-- View for funnel analytics by vertical
CREATE OR REPLACE VIEW funnel_metrics AS
SELECT
  d.vertical_id,
  COUNT(DISTINCT d.id) as total_deliveries,
  COUNT(DISTINCT CASE WHEN ce.conversion_status = 'qualified' THEN ce.id END) as total_conversions,
  COUNT(DISTINCT CASE WHEN ce.conversion_status = 'qualified' THEN ce.id END)::FLOAT / 
    NULLIF(COUNT(DISTINCT d.id), 0) as conversion_rate,
  AVG(COALESCE(ce.conversion_value, 0)) as average_value,
  DATE_TRUNC('day', d.created_at) as date
FROM deliveries d
LEFT JOIN conversion_events ce ON d.id = ce.delivery_id
GROUP BY d.vertical_id, DATE_TRUNC('day', d.created_at);

-- View for campaign ROI metrics
CREATE OR REPLACE VIEW campaign_roi_metrics AS
SELECT
  al.winner_campaign_id,
  COUNT(DISTINCT d.id) as total_deliveries,
  COUNT(DISTINCT CASE WHEN ce.conversion_status = 'qualified' THEN ce.id END) as total_conversions,
  SUM(t.bid_amount) as total_spend,
  SUM(COALESCE(ce.conversion_value, 0)) as total_revenue,
  SUM(t.bid_amount) / NULLIF(COUNT(DISTINCT CASE WHEN ce.conversion_status = 'qualified' THEN ce.id END), 0) as cpa,
  SUM(COALESCE(ce.conversion_value, 0)) / NULLIF(SUM(t.bid_amount), 0) as roas
FROM auction_logs al
JOIN deliveries d ON al.delivery_id = d.id
JOIN transactions t ON t.id = d.transaction_id
LEFT JOIN conversion_events ce ON d.id = ce.delivery_id
WHERE ce.conversion_status = 'qualified' OR ce.id IS NULL
GROUP BY al.winner_campaign_id;

-- View for connector quality scoring
CREATE OR REPLACE VIEW connector_quality_metrics AS
SELECT
  d.connector_id,
  COUNT(DISTINCT d.id) as total_deliveries,
  COUNT(DISTINCT CASE WHEN ce.conversion_status = 'qualified' THEN ce.id END) as total_conversions,
  COUNT(DISTINCT CASE WHEN ce.conversion_status = 'qualified' THEN ce.id END)::FLOAT / 
    NULLIF(COUNT(DISTINCT d.id), 0) as conversion_rate,
  SUM(d.bid_amount) as total_spend,
  SUM(COALESCE(ce.conversion_value, 0)) as total_revenue,
  SUM(d.bid_amount) / NULLIF(COUNT(DISTINCT CASE WHEN ce.conversion_status = 'qualified' THEN ce.id END), 0) as cpa,
  (COUNT(DISTINCT CASE WHEN ce.conversion_status = 'qualified' THEN ce.id END)::FLOAT / 
    NULLIF(COUNT(DISTINCT d.id), 0) + 
   (1.0 - (SUM(d.bid_amount) / NULLIF(COUNT(DISTINCT CASE WHEN ce.conversion_status = 'qualified' THEN ce.id END), 0) / 1000.0))) / 2.0 as quality_score
FROM deliveries d
LEFT JOIN conversion_events ce ON d.id = ce.delivery_id AND ce.conversion_status = 'qualified'
GROUP BY d.connector_id;

-- RLS Policies for conversion_events
ALTER TABLE conversion_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversion_events_organization_isolation ON conversion_events
  USING (organization_id = org_id_from_auth());

CREATE POLICY conversion_events_insert ON conversion_events
  FOR INSERT WITH CHECK (organization_id = org_id_from_auth());

CREATE POLICY conversion_events_update ON conversion_events
  FOR UPDATE USING (organization_id = org_id_from_auth());

-- Trigger to update conversion_events updated_at
CREATE OR REPLACE FUNCTION update_conversion_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_conversion_events_updated_at ON conversion_events;
CREATE TRIGGER trigger_conversion_events_updated_at
  BEFORE UPDATE ON conversion_events
  FOR EACH ROW
  EXECUTE FUNCTION update_conversion_events_updated_at();
