-- Phase 9: OAuth Infrastructure for MCP V2 Write Tools

-- OAuth Clients (RFC 7591 Dynamic Client Registration)
CREATE TABLE oauth_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text UNIQUE NOT NULL,
  client_secret text NOT NULL,
  redirect_uris text[] NOT NULL,
  client_name text NOT NULL,
  contacts text[] DEFAULT ARRAY[]::text[],
  logo_uri text,
  application_type text DEFAULT 'web' CHECK (application_type IN ('web', 'native')),
  grant_types text[] DEFAULT ARRAY['authorization_code', 'refresh_token']::text[],
  response_types text[] DEFAULT ARRAY['code']::text[],
  default_max_age integer,
  subject_type text DEFAULT 'public' CHECK (subject_type IN ('public', 'pairwise')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_oauth_clients_client_id ON oauth_clients (client_id);

-- OAuth Authorization Codes (short-lived, PKCE support)
CREATE TABLE oauth_auth_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  client_id text NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  scope text,
  code_challenge text,
  code_challenge_method text CHECK (code_challenge_method IN ('S256', 'plain')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  used boolean DEFAULT false
);

CREATE INDEX idx_oauth_auth_codes_code ON oauth_auth_codes (code);
CREATE INDEX idx_oauth_auth_codes_client_user ON oauth_auth_codes (client_id, user_id);
CREATE INDEX idx_oauth_auth_codes_expires_at ON oauth_auth_codes (expires_at);

-- OAuth Refresh Tokens (long-lived, rotatable)
CREATE TABLE oauth_refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refresh_token text UNIQUE NOT NULL,
  client_id text NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text,
  rotation_count integer DEFAULT 0,
  previous_token_hash text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  revoked boolean DEFAULT false
);

CREATE INDEX idx_oauth_refresh_tokens_token ON oauth_refresh_tokens (refresh_token);
CREATE INDEX idx_oauth_refresh_tokens_client_user ON oauth_refresh_tokens (client_id, user_id);
CREATE INDEX idx_oauth_refresh_tokens_expires_at ON oauth_refresh_tokens (expires_at);

-- MCP Tool Access Log (audit trail for sensitive operations)
CREATE TABLE mcp_tool_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  tool_name text NOT NULL,
  action text NOT NULL,
  request_data jsonb,
  result text,
  risk_level text CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
  required_confirmation boolean DEFAULT false,
  confirmation_provided boolean DEFAULT false,
  status text CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX idx_mcp_tool_access_log_user ON mcp_tool_access_log (user_id);
CREATE INDEX idx_mcp_tool_access_log_org ON mcp_tool_access_log (organization_id);
CREATE INDEX idx_mcp_tool_access_log_tool ON mcp_tool_access_log (tool_name);
CREATE INDEX idx_mcp_tool_access_log_created_at ON mcp_tool_access_log (created_at);

-- Enable Row Level Security
ALTER TABLE oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_auth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_tool_access_log ENABLE ROW LEVEL SECURITY;

-- RLS: oauth_clients (publicly readable, only owner can update/delete)
CREATE POLICY oauth_clients_select ON oauth_clients FOR SELECT
  USING (true);

CREATE POLICY oauth_clients_insert ON oauth_clients FOR INSERT
  WITH CHECK (true);

CREATE POLICY oauth_clients_update ON oauth_clients FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY oauth_clients_delete ON oauth_clients FOR DELETE
  USING (true);

-- RLS: oauth_auth_codes (user can only see their own auth codes)
CREATE POLICY oauth_auth_codes_select ON oauth_auth_codes FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY oauth_auth_codes_insert ON oauth_auth_codes FOR INSERT
  WITH CHECK (true);

CREATE POLICY oauth_auth_codes_update ON oauth_auth_codes FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS: oauth_refresh_tokens (user can only see their own tokens)
CREATE POLICY oauth_refresh_tokens_select ON oauth_refresh_tokens FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY oauth_refresh_tokens_insert ON oauth_refresh_tokens FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY oauth_refresh_tokens_update ON oauth_refresh_tokens FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS: mcp_tool_access_log (users can see logs for their organizations)
CREATE POLICY mcp_tool_access_log_select ON mcp_tool_access_log FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY mcp_tool_access_log_insert ON mcp_tool_access_log FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Cleanup job for expired auth codes (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_codes()
RETURNS void AS $$
BEGIN
  DELETE FROM oauth_auth_codes
  WHERE expires_at < now() AND NOT used;
END;
$$ LANGUAGE plpgsql;

-- Cleanup job for expired refresh tokens (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_refresh_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM oauth_refresh_tokens
  WHERE expires_at < now() AND NOT revoked;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions to authenticated users
GRANT SELECT ON oauth_clients TO authenticated;
GRANT SELECT, INSERT, UPDATE ON oauth_auth_codes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON oauth_refresh_tokens TO authenticated;
GRANT SELECT, INSERT ON mcp_tool_access_log TO authenticated;

-- Service role can manage everything
GRANT ALL PRIVILEGES ON oauth_clients TO service_role;
GRANT ALL PRIVILEGES ON oauth_auth_codes TO service_role;
GRANT ALL PRIVILEGES ON oauth_refresh_tokens TO service_role;
GRANT ALL PRIVILEGES ON mcp_tool_access_log TO service_role;
