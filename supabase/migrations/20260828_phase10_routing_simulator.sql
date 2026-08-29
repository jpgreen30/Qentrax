-- Phase 10: Routing Simulator — Historical Replay and What-If Analysis

-- Simulation Configurations (scenarios for replay/what-if)
CREATE TABLE simulation_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  scenario_type text NOT NULL CHECK (scenario_type IN ('replay', 'what_if')),
  base_strategy text NOT NULL,
  date_range_start timestamptz NOT NULL,
  date_range_end timestamptz NOT NULL,
  filters jsonb DEFAULT '{}',
  what_if_parameters jsonb,
  created_by text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX idx_simulation_configs_org ON simulation_configs (organization_id);
CREATE INDEX idx_simulation_configs_scenario_type ON simulation_configs (scenario_type);
CREATE INDEX idx_simulation_configs_created_at ON simulation_configs (created_at);

-- Simulation Runs (individual execution instances)
CREATE TABLE simulation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  simulation_config_id uuid NOT NULL REFERENCES simulation_configs(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  opportunities_count integer DEFAULT 0,
  completed_count integer DEFAULT 0,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX idx_simulation_runs_org ON simulation_runs (organization_id);
CREATE INDEX idx_simulation_runs_config ON simulation_runs (simulation_config_id);
CREATE INDEX idx_simulation_runs_status ON simulation_runs (status);
CREATE INDEX idx_simulation_runs_created_at ON simulation_runs (created_at);

-- Simulation Results (comparison between original and simulated decisions)
CREATE TABLE simulation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  simulation_run_id uuid NOT NULL REFERENCES simulation_runs(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL,
  original_decision jsonb NOT NULL,
  simulated_decision jsonb NOT NULL,
  outcome_changed boolean DEFAULT false,
  original_revenue numeric(12,2) DEFAULT 0,
  simulated_revenue numeric(12,2) DEFAULT 0,
  revenue_delta numeric(12,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX idx_simulation_results_org ON simulation_results (organization_id);
CREATE INDEX idx_simulation_results_simulation_run ON simulation_results (simulation_run_id);
CREATE INDEX idx_simulation_results_opportunity ON simulation_results (opportunity_id);
CREATE INDEX idx_simulation_results_outcome_changed ON simulation_results (outcome_changed);
CREATE INDEX idx_simulation_results_created_at ON simulation_results (created_at);

-- Simulation Analysis Cache (store computed analysis to avoid recomputation)
CREATE TABLE simulation_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  simulation_id uuid NOT NULL REFERENCES simulation_configs(id) ON DELETE CASCADE,
  metrics jsonb NOT NULL,
  recommendations jsonb NOT NULL,
  risk_assessment jsonb NOT NULL,
  strategy_comparison jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX idx_simulation_analysis_org ON simulation_analysis (organization_id);
CREATE INDEX idx_simulation_analysis_simulation ON simulation_analysis (simulation_id);
CREATE INDEX idx_simulation_analysis_created_at ON simulation_analysis (created_at);

-- Enable Row Level Security
ALTER TABLE simulation_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_analysis ENABLE ROW LEVEL SECURITY;

-- RLS: simulation_configs (org-scoped read/write)
CREATE POLICY simulation_configs_select ON simulation_configs FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY simulation_configs_insert ON simulation_configs FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY simulation_configs_update ON simulation_configs FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY simulation_configs_delete ON simulation_configs FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- RLS: simulation_runs (org-scoped read/write)
CREATE POLICY simulation_runs_select ON simulation_runs FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY simulation_runs_insert ON simulation_runs FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY simulation_runs_update ON simulation_runs FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- RLS: simulation_results (org-scoped read/write)
CREATE POLICY simulation_results_select ON simulation_results FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY simulation_results_insert ON simulation_results FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- RLS: simulation_analysis (org-scoped read/write)
CREATE POLICY simulation_analysis_select ON simulation_analysis FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY simulation_analysis_insert ON simulation_analysis FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON simulation_configs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON simulation_runs TO authenticated;
GRANT SELECT, INSERT ON simulation_results TO authenticated;
GRANT SELECT, INSERT, UPDATE ON simulation_analysis TO authenticated;

-- Service role can manage everything
GRANT ALL PRIVILEGES ON simulation_configs TO service_role;
GRANT ALL PRIVILEGES ON simulation_runs TO service_role;
GRANT ALL PRIVILEGES ON simulation_results TO service_role;
GRANT ALL PRIVILEGES ON simulation_analysis TO service_role;

-- Materialized view for simulation metrics aggregation
CREATE MATERIALIZED VIEW simulation_metrics_summary AS
SELECT
  sr.organization_id,
  sr.simulation_config_id,
  COUNT(DISTINCT sr.id) as total_runs,
  COUNT(DISTINCT CASE WHEN sr.status = 'completed' THEN sr.id END) as completed_runs,
  SUM(sr.opportunities_count) as total_opportunities,
  SUM(sr.completed_count) as total_completed,
  SUM(res.revenue_delta) as total_revenue_delta,
  AVG(res.revenue_delta) as avg_revenue_delta,
  COUNT(DISTINCT CASE WHEN res.outcome_changed THEN res.opportunity_id END) as decisions_changed,
  MAX(sr.created_at) as last_run_at
FROM simulation_runs sr
LEFT JOIN simulation_results res ON sr.id = res.simulation_run_id
GROUP BY sr.organization_id, sr.simulation_config_id;

CREATE INDEX idx_simulation_metrics_summary_org ON simulation_metrics_summary (organization_id);
