-- Delivery compatibility columns
--
-- The runtime now has two delivery writers:
--   - src/lib/delivery/retry.ts
--   - src/lib/services/delivery.ts
--
-- They both need the deliveries table to accept a broader compatibility
-- surface, otherwise POST/replay/reporting code paths fail when they persist
-- delivery outcomes.

alter table if exists public.deliveries
  add column if not exists delivered_at timestamptz,
  add column if not exists response_status_code integer,
  add column if not exists success boolean,
  add column if not exists error_message text,
  add column if not exists last_error text,
  add column if not exists delivery_mode text;
