begin;

-- Intentionally no-op.
--
-- Qentrax OAuth is already defined by:
--   20260821195000_oauth_durable_state.sql
--   20260821200000_oauth_state_rpc.sql
--
-- The superseded Phase 9 draft duplicated oauth_clients with a conflicting
-- schema, exposed client records through permissive RLS, and compared auth.uid()
-- directly with application user IDs. It was never safe to apply.
--
-- MCP controlled-write audit/proposal tables must be introduced in a separate
-- reviewed migration after their domain services and confirmation model exist.

commit;
