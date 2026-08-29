-- Atomic Budget & Capacity Reservation
-- Implements a single-transaction atomic reservation primitive that prevents overselling
-- under concurrent load by using row-level locking and conditional updates.

-- 1. Reservation tracking table
CREATE TABLE IF NOT EXISTS campaign_reservations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,

  -- Request tracking for idempotency
  request_id text NOT NULL,
  idempotency_key text NOT NULL,

  -- Reserved amounts
  amount_reserved numeric(12, 2) NOT NULL DEFAULT 0,
  count_reserved integer NOT NULL DEFAULT 0,

  -- State and reason
  status text NOT NULL DEFAULT 'reserved', -- 'reserved', 'released', 'finalized'
  reason_code text, -- 'OK', 'INSUFFICIENT_BUDGET', 'CAPACITY_EXCEEDED', 'SCHEDULE_INACTIVE', etc.

  -- Tracking
  reserved_at timestamp with time zone NOT NULL DEFAULT now(),
  released_at timestamp with time zone,
  finalized_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_campaign_reservations_idempotency
  ON campaign_reservations(organization_id, campaign_id, idempotency_key)
  WHERE status IN ('reserved', 'finalized');

CREATE INDEX idx_campaign_reservations_campaign
  ON campaign_reservations(campaign_id, status);

CREATE INDEX idx_campaign_reservations_organization
  ON campaign_reservations(organization_id, campaign_id);

-- 2. Atomic reservation function
-- Single-transaction operation that:
--   a) Acquires row lock on campaign
--   b) Checks all invariants (budget, capacity, schedule, eligibility)
--   c) Verifies idempotency (no duplicate reserve for same request)
--   d) Atomically increments reserved totals
--   e) Records the reservation
-- Returns: {success: boolean, reason_code: text, reserved_amount: numeric, reserved_count: integer}
CREATE OR REPLACE FUNCTION reserve_campaign_capacity(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_amount numeric,
  p_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_record RECORD;
  v_existing_reservation RECORD;
  v_daily_budget numeric;
  v_daily_reserved numeric;
  v_daily_charged numeric;
  v_daily_capacity integer;
  v_daily_delivered integer;
  v_schedule_active boolean;
  v_result jsonb;
BEGIN
  -- Step 1: Acquire exclusive row lock on campaign (blocks concurrent reservations on same campaign)
  SELECT c.id, c.organization_id, c.daily_budget, c.daily_capacity, c.status,
         COALESCE(c.schedule_start_date, now()) as schedule_start,
         COALESCE(c.schedule_end_date, now() + interval '1 day') as schedule_end
    INTO v_campaign_record
    FROM campaigns c
    WHERE c.id = p_campaign_id
      AND c.organization_id = p_organization_id
    FOR UPDATE;

  IF v_campaign_record IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason_code', 'CAMPAIGN_NOT_FOUND',
      'request_id', p_request_id,
      'reserved_amount', 0,
      'reserved_count', 0
    );
  END IF;

  -- Step 2: Check idempotency - prevent double-reserving same request
  SELECT id, amount_reserved, count_reserved
    INTO v_existing_reservation
    FROM campaign_reservations
    WHERE organization_id = p_organization_id
      AND campaign_id = p_campaign_id
      AND idempotency_key = p_idempotency_key
      AND status IN ('reserved', 'finalized');

  IF v_existing_reservation IS NOT NULL THEN
    -- Idempotent return - same request already reserved
    RETURN jsonb_build_object(
      'success', true,
      'reason_code', 'OK_IDEMPOTENT',
      'request_id', p_request_id,
      'reserved_amount', v_existing_reservation.amount_reserved,
      'reserved_count', v_existing_reservation.count_reserved
    );
  END IF;

  -- Step 3: Check campaign status
  IF v_campaign_record.status != 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason_code', 'CAMPAIGN_INACTIVE',
      'request_id', p_request_id,
      'reserved_amount', 0,
      'reserved_count', 0
    );
  END IF;

  -- Step 4: Check schedule
  v_schedule_active := now() >= v_campaign_record.schedule_start
                   AND now() <= v_campaign_record.schedule_end;
  IF NOT v_schedule_active THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason_code', 'SCHEDULE_INACTIVE',
      'request_id', p_request_id,
      'reserved_amount', 0,
      'reserved_count', 0
    );
  END IF;

  -- Step 5: Calculate current reserved and charged totals (under lock)
  SELECT COALESCE(SUM(CASE WHEN status = 'reserved' THEN amount_reserved ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN status = 'finalized' THEN amount_reserved ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN status = 'reserved' THEN count_reserved ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN status = 'finalized' THEN count_reserved ELSE 0 END), 0)
    INTO v_daily_reserved, v_daily_charged, v_daily_delivered, v_daily_delivered
    FROM campaign_reservations
    WHERE organization_id = p_organization_id
      AND campaign_id = p_campaign_id
      AND created_at >= now()::date;

  v_daily_budget := v_campaign_record.daily_budget;
  v_daily_capacity := v_campaign_record.daily_capacity;

  -- Step 6: Check budget availability (reserved + charged + new request <= budget)
  IF (v_daily_reserved + v_daily_charged + p_amount) > v_daily_budget THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason_code', 'INSUFFICIENT_BUDGET',
      'request_id', p_request_id,
      'available_budget', v_daily_budget - (v_daily_reserved + v_daily_charged),
      'reserved_amount', 0,
      'reserved_count', 0
    );
  END IF;

  -- Step 7: Check capacity availability (reserved + delivered + new request <= capacity)
  IF (v_daily_reserved + v_daily_delivered + p_count) > v_daily_capacity THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason_code', 'CAPACITY_EXCEEDED',
      'request_id', p_request_id,
      'available_capacity', v_daily_capacity - (v_daily_reserved + v_daily_delivered),
      'reserved_amount', 0,
      'reserved_count', 0
    );
  END IF;

  -- Step 8: All checks passed - atomically create the reservation
  INSERT INTO campaign_reservations (
    organization_id, campaign_id, request_id, idempotency_key,
    amount_reserved, count_reserved, status, reason_code
  ) VALUES (
    p_organization_id, p_campaign_id, p_request_id, p_idempotency_key,
    p_amount, p_count, 'reserved', 'OK'
  );

  RETURN jsonb_build_object(
    'success', true,
    'reason_code', 'OK',
    'request_id', p_request_id,
    'reserved_amount', p_amount,
    'reserved_count', p_count,
    'total_reserved', v_daily_reserved + p_amount,
    'total_capacity', v_daily_capacity
  );
END;
$$;

-- 3. Atomic release function (for failed/cancelled delivery)
CREATE OR REPLACE FUNCTION release_reservation(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation RECORD;
BEGIN
  -- Find the reservation to release
  SELECT id, amount_reserved, count_reserved
    INTO v_reservation
    FROM campaign_reservations
    WHERE organization_id = p_organization_id
      AND campaign_id = p_campaign_id
      AND idempotency_key = p_idempotency_key
      AND status = 'reserved'
    FOR UPDATE;

  IF v_reservation IS NULL THEN
    -- Already released or not found - idempotent
    RETURN jsonb_build_object(
      'success', true,
      'reason_code', 'OK_ALREADY_RELEASED'
    );
  END IF;

  -- Mark as released
  UPDATE campaign_reservations
    SET status = 'released', released_at = now(), updated_at = now()
    WHERE id = v_reservation.id;

  RETURN jsonb_build_object(
    'success', true,
    'reason_code', 'OK',
    'released_amount', v_reservation.amount_reserved,
    'released_count', v_reservation.count_reserved
  );
END;
$$;

-- 4. Atomic finalization (convert reserved to charged)
CREATE OR REPLACE FUNCTION finalize_reservation(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation RECORD;
BEGIN
  SELECT id, amount_reserved, count_reserved
    INTO v_reservation
    FROM campaign_reservations
    WHERE organization_id = p_organization_id
      AND campaign_id = p_campaign_id
      AND idempotency_key = p_idempotency_key
      AND status = 'reserved'
    FOR UPDATE;

  IF v_reservation IS NULL THEN
    -- Already finalized or not found - idempotent
    RETURN jsonb_build_object(
      'success', true,
      'reason_code', 'OK_ALREADY_FINALIZED'
    );
  END IF;

  UPDATE campaign_reservations
    SET status = 'finalized', finalized_at = now(), updated_at = now()
    WHERE id = v_reservation.id;

  RETURN jsonb_build_object(
    'success', true,
    'reason_code', 'OK',
    'finalized_amount', v_reservation.amount_reserved,
    'finalized_count', v_reservation.count_reserved
  );
END;
$$;

-- 5. RLS Policies for campaign_reservations
ALTER TABLE campaign_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read reservations for their organization"
  ON campaign_reservations
  FOR SELECT
  TO authenticated
  USING (organization_id = (SELECT organization_id FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "Service role can read all reservations"
  ON campaign_reservations
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can write reservations"
  ON campaign_reservations
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update reservations"
  ON campaign_reservations
  FOR UPDATE
  TO service_role
  USING (true);
