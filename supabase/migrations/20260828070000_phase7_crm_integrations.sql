-- Phase 7: CRM Integrations
-- Enables synchronization with external CRM platforms

-- CRM integration configurations
CREATE TABLE IF NOT EXISTS crm_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('hubspot', 'zapier', 'make', 'sftp')),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error')),
  api_key TEXT, -- Encrypted in app layer
  api_url TEXT,
  credentials JSONB NOT NULL DEFAULT '{}', -- Platform-specific credentials
  mapped_fields JSONB NOT NULL DEFAULT '{}', -- Qentrax field to external field mapping
  sync_enabled BOOLEAN DEFAULT false,
  sync_frequency_minutes INT DEFAULT 60 CHECK (sync_frequency_minutes > 0),
  last_sync_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Synced contact records
CREATE TABLE IF NOT EXISTS crm_sync_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES crm_integrations(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  email TEXT NOT NULL,
  data JSONB NOT NULL, -- Full contact data from external platform
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_crm_integrations_organization ON crm_integrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_integrations_platform ON crm_integrations(platform);
CREATE INDEX IF NOT EXISTS idx_crm_integrations_sync_enabled ON crm_integrations(sync_enabled) WHERE sync_enabled = true;
CREATE INDEX IF NOT EXISTS idx_crm_integrations_last_sync ON crm_integrations(last_sync_at);
CREATE INDEX IF NOT EXISTS idx_crm_sync_records_integration ON crm_sync_records(integration_id);
CREATE INDEX IF NOT EXISTS idx_crm_sync_records_email ON crm_sync_records(email);
CREATE INDEX IF NOT EXISTS idx_crm_sync_records_external_id ON crm_sync_records(external_id);
CREATE INDEX IF NOT EXISTS idx_crm_sync_records_synced_at ON crm_sync_records(synced_at);

-- View for pending sync
CREATE OR REPLACE VIEW pending_crm_syncs AS
SELECT
  id,
  organization_id,
  platform,
  name,
  sync_frequency_minutes,
  last_sync_at,
  CASE
    WHEN last_sync_at IS NULL THEN true
    WHEN NOW() - INTERVAL '1 minute' * sync_frequency_minutes >= last_sync_at THEN true
    ELSE false
  END as should_sync
FROM crm_integrations
WHERE sync_enabled = true;

-- RLS Policies for crm_integrations
ALTER TABLE crm_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_integrations_organization_isolation ON crm_integrations
  USING (organization_id = org_id_from_auth());

CREATE POLICY crm_integrations_insert ON crm_integrations
  FOR INSERT WITH CHECK (organization_id = org_id_from_auth());

CREATE POLICY crm_integrations_update ON crm_integrations
  FOR UPDATE USING (organization_id = org_id_from_auth());

CREATE POLICY crm_integrations_delete ON crm_integrations
  FOR DELETE USING (organization_id = org_id_from_auth());

-- RLS Policies for crm_sync_records
-- Allow system access via service role key
ALTER TABLE crm_sync_records DISABLE ROW LEVEL SECURITY;

-- Trigger to update crm_integrations updated_at
CREATE OR REPLACE FUNCTION update_crm_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_crm_integrations_updated_at ON crm_integrations;
CREATE TRIGGER trigger_crm_integrations_updated_at
  BEFORE UPDATE ON crm_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_crm_integrations_updated_at();

-- Trigger to update crm_sync_records updated_at
CREATE OR REPLACE FUNCTION update_crm_sync_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_crm_sync_records_updated_at ON crm_sync_records;
CREATE TRIGGER trigger_crm_sync_records_updated_at
  BEFORE UPDATE ON crm_sync_records
  FOR EACH ROW
  EXECUTE FUNCTION update_crm_sync_records_updated_at();
