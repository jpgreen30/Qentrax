-- Phase 11: Qentrax Intelligence — Anomaly Detection, Optimization, Predictive Analytics

-- Anomaly Detection Results
CREATE TABLE anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  anomaly_type text NOT NULL CHECK (anomaly_type IN ('bid_pattern', 'performance_drop', 'conversion_rate', 'revenue_spike', 'campaign_churn')),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  entity_type text NOT NULL CHECK (entity_type IN ('campaign', 'vertical', 'product', 'source', 'connector')),
  entity_id text NOT NULL,
  metric_name text NOT NULL,
  expected_value numeric(12,2),
  actual_value numeric(12,2),
  deviation_percent numeric(8,2),
  evidence text,
  detection_date timestamptz NOT NULL,
  resolution_status text DEFAULT 'open' CHECK (resolution_status IN ('open', 'acknowledged', 'investigating', 'resolved')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX idx_anomalies_org ON anomalies (organization_id);
CREATE INDEX idx_anomalies_severity ON anomalies (severity);
CREATE INDEX idx_anomalies_type ON anomalies (anomaly_type);
CREATE INDEX idx_anomalies_entity ON anomalies (entity_type, entity_id);
CREATE INDEX idx_anomalies_detection_date ON anomalies (detection_date);

-- Optimization Recommendations
CREATE TABLE optimization_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  recommendation_type text NOT NULL CHECK (recommendation_type IN ('bid_optimization', 'budget_allocation', 'strategy_change', 'pause_campaign', 'scale_campaign', 'geographic_expansion')),
  priority text NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  target_entity text NOT NULL,
  target_entity_type text NOT NULL CHECK (target_entity_type IN ('campaign', 'vertical', 'product', 'source')),
  current_value numeric(12,2),
  recommended_value numeric(12,2),
  expected_impact numeric(8,2),
  confidence_score numeric(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  reasoning text,
  implementation_steps text[],
  risks text[],
  estimated_ramp_time_days integer,
  implementation_status text DEFAULT 'pending' CHECK (implementation_status IN ('pending', 'in_progress', 'implemented', 'rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX idx_recommendations_org ON optimization_recommendations (organization_id);
CREATE INDEX idx_recommendations_priority ON optimization_recommendations (priority);
CREATE INDEX idx_recommendations_type ON optimization_recommendations (recommendation_type);
CREATE INDEX idx_recommendations_status ON optimization_recommendations (implementation_status);

-- Predictions (Lead Quality, Revenue Forecast, Churn Risk, etc.)
CREATE TABLE predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  prediction_type text NOT NULL CHECK (prediction_type IN ('lead_quality', 'conversion_probability', 'revenue_forecast', 'campaign_performance', 'advertiser_churn', 'publisher_churn')),
  entity_id text NOT NULL,
  entity_type text NOT NULL,
  prediction_value numeric(12,4),
  confidence_lower numeric(12,4),
  confidence_upper numeric(12,4),
  time_horizon_days integer,
  input_features jsonb,
  model_version text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX idx_predictions_org ON predictions (organization_id);
CREATE INDEX idx_predictions_type ON predictions (prediction_type);
CREATE INDEX idx_predictions_entity ON predictions (entity_id);
CREATE INDEX idx_predictions_created_at ON predictions (created_at);
CREATE INDEX idx_predictions_expires_at ON predictions (expires_at);

-- Intelligence Reports (cached results)
CREATE TABLE intelligence_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  report_date timestamptz NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  anomalies_count integer DEFAULT 0,
  critical_anomalies_count integer DEFAULT 0,
  recommendations_count integer DEFAULT 0,
  health_score numeric(5,2) CHECK (health_score >= 0 AND health_score <= 100),
  trend_analysis jsonb,
  top_opportunities jsonb,
  summary jsonb,
  created_at timestamptz DEFAULT now(),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX idx_intelligence_reports_org ON intelligence_reports (organization_id);
CREATE INDEX idx_intelligence_reports_date ON intelligence_reports (report_date);
CREATE INDEX idx_intelligence_reports_created_at ON intelligence_reports (created_at);

-- Anomaly Acknowledgments and Tracking
CREATE TABLE anomaly_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anomaly_id uuid NOT NULL REFERENCES anomalies(id) ON DELETE CASCADE,
  acknowledged_by uuid NOT NULL,
  acknowledged_at timestamptz DEFAULT now(),
  notes text
);

CREATE INDEX idx_anomaly_acks_anomaly ON anomaly_acknowledgments (anomaly_id);
CREATE INDEX idx_anomaly_acks_user ON anomaly_acknowledgments (acknowledged_by);

-- Recommendation Implementation Tracking
CREATE TABLE recommendation_implementations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid NOT NULL REFERENCES optimization_recommendations(id) ON DELETE CASCADE,
  implemented_by uuid NOT NULL,
  implementation_date timestamptz,
  notes text,
  outcome text,
  actual_impact numeric(8,2),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_rec_impl_recommendation ON recommendation_implementations (recommendation_id);
CREATE INDEX idx_rec_impl_user ON recommendation_implementations (implemented_by);

-- Enable Row Level Security
ALTER TABLE anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE optimization_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_acknowledgments ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_implementations ENABLE ROW LEVEL SECURITY;

-- RLS Policies: anomalies
CREATE POLICY anomalies_select ON anomalies FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      JOIN users u ON om.user_id = u.id
      WHERE u.auth_subject = auth.uid() AND om.status = 'active'
    )
  );

CREATE POLICY anomalies_insert ON anomalies FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      JOIN users u ON om.user_id = u.id
      WHERE u.auth_subject = auth.uid() AND om.status = 'active'
    )
  );

CREATE POLICY anomalies_update ON anomalies FOR UPDATE
  USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      JOIN users u ON om.user_id = u.id
      WHERE u.auth_subject = auth.uid() AND om.status = 'active'
    )
  );

-- RLS Policies: recommendations
CREATE POLICY recommendations_select ON optimization_recommendations FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      JOIN users u ON om.user_id = u.id
      WHERE u.auth_subject = auth.uid() AND om.status = 'active'
    )
  );

CREATE POLICY recommendations_insert ON optimization_recommendations FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      JOIN users u ON om.user_id = u.id
      WHERE u.auth_subject = auth.uid() AND om.status = 'active'
    )
  );

CREATE POLICY recommendations_update ON optimization_recommendations FOR UPDATE
  USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      JOIN users u ON om.user_id = u.id
      WHERE u.auth_subject = auth.uid() AND om.status = 'active'
    )
  );

-- RLS Policies: predictions
CREATE POLICY predictions_select ON predictions FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      JOIN users u ON om.user_id = u.id
      WHERE u.auth_subject = auth.uid() AND om.status = 'active'
    )
  );

CREATE POLICY predictions_insert ON predictions FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      JOIN users u ON om.user_id = u.id
      WHERE u.auth_subject = auth.uid() AND om.status = 'active'
    )
  );

-- RLS Policies: reports
CREATE POLICY reports_select ON intelligence_reports FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      JOIN users u ON om.user_id = u.id
      WHERE u.auth_subject = auth.uid() AND om.status = 'active'
    )
  );

CREATE POLICY reports_insert ON intelligence_reports FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      JOIN users u ON om.user_id = u.id
      WHERE u.auth_subject = auth.uid() AND om.status = 'active'
    )
  );

-- Materialized Views for Dashboards

-- Anomaly Summary by Organization
CREATE MATERIALIZED VIEW anomaly_summary_by_org AS
SELECT
  organization_id,
  anomaly_type,
  severity,
  COUNT(*) as count,
  ROUND(AVG(ABS(deviation_percent))::numeric, 2) as avg_deviation_percent,
  MAX(detection_date) as latest_detection
FROM anomalies
WHERE resolution_status != 'resolved'
GROUP BY organization_id, anomaly_type, severity
ORDER BY organization_id, severity DESC, count DESC;

-- Recommendation Impact Tracking
CREATE MATERIALIZED VIEW recommendation_impact_summary AS
SELECT
  r.organization_id,
  r.recommendation_type,
  COUNT(r.id) as total_recommendations,
  COUNT(CASE WHEN r.implementation_status = 'implemented' THEN r.id END) as implemented_count,
  ROUND(AVG(r.expected_impact)::numeric, 2) as avg_expected_impact,
  ROUND(AVG(COALESCE(i.actual_impact, 0))::numeric, 2) as avg_actual_impact
FROM optimization_recommendations r
LEFT JOIN recommendation_implementations i ON r.id = i.recommendation_id
GROUP BY r.organization_id, r.recommendation_type;

-- Health Score Trend
CREATE MATERIALIZED VIEW organization_health_trend AS
SELECT
  organization_id,
  report_date,
  health_score,
  anomalies_count,
  critical_anomalies_count,
  recommendations_count,
  LAG(health_score) OVER (PARTITION BY organization_id ORDER BY report_date) as previous_health_score
FROM intelligence_reports
ORDER BY organization_id, report_date DESC;

-- Grant Permissions
GRANT SELECT, INSERT, UPDATE ON anomalies TO authenticated;
GRANT SELECT, INSERT, UPDATE ON optimization_recommendations TO authenticated;
GRANT SELECT, INSERT ON predictions TO authenticated;
GRANT SELECT, INSERT ON intelligence_reports TO authenticated;
GRANT SELECT, INSERT ON anomaly_acknowledgments TO authenticated;
GRANT SELECT, INSERT ON recommendation_implementations TO authenticated;

GRANT ALL PRIVILEGES ON anomalies TO service_role;
GRANT ALL PRIVILEGES ON optimization_recommendations TO service_role;
GRANT ALL PRIVILEGES ON predictions TO service_role;
GRANT ALL PRIVILEGES ON intelligence_reports TO service_role;
GRANT ALL PRIVILEGES ON anomaly_acknowledgments TO service_role;
GRANT ALL PRIVILEGES ON recommendation_implementations TO service_role;
