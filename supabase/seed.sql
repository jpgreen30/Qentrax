-- Phase 0 canonical seeds (idempotent)
-- Roles from canonical §4.1
insert into public.roles (code, name) values
  ('advertiser_owner', 'Advertiser owner'),
  ('advertiser_manager', 'Advertiser manager'),
  ('advertiser_analyst', 'Advertiser analyst'),
  ('publisher_owner', 'Publisher owner'),
  ('publisher_manager', 'Publisher manager'),
  ('publisher_analyst', 'Publisher analyst'),
  ('admin_superuser', 'Admin superuser'),
  ('admin_compliance', 'Admin compliance'),
  ('admin_finance', 'Admin finance'),
  ('admin_support', 'Admin support')
on conflict (code) do nothing;

-- Core reason codes (Appendix A families — stable contracts)
insert into public.reason_codes (code, family, description) values
  ('AUTH_REQUIRED', 'AUTH', 'Authentication is required.'),
  ('AUTH_FORBIDDEN', 'AUTH', 'The actor lacks permission.'),
  ('SCHEMA_INVALID', 'SCHEMA', 'The request does not match the supported schema.'),
  ('SCHEMA_MISSING_FIELD', 'SCHEMA', 'A required field is missing.'),
  ('IDENTITY_INVALID', 'IDENTITY', 'Identity or contact check failed.'),
  ('CONSENT_MISSING', 'CONSENT', 'Required consent evidence was not supplied.'),
  ('CONSENT_INVALID', 'CONSENT', 'Consent evidence is invalid or unverifiable.'),
  ('DUPLICATE_CONSUMER', 'DUPLICATE', 'Consumer was previously submitted within the configured window.'),
  ('VELOCITY_EXCEEDED', 'VELOCITY', 'Submission rate exceeded the configured threshold.'),
  ('GEO_MISMATCH', 'GEO', 'Geography does not match campaign or source rules.'),
  ('ELIGIBILITY_MISMATCH', 'ELIGIBILITY', 'Vertical, product, or buyer-rule mismatch.'),
  ('CAMPAIGN_NOT_FUNDED', 'CAMPAIGN', 'Campaign requires available funds before activation.'),
  ('CAMPAIGN_INACTIVE', 'CAMPAIGN', 'Campaign is not active or is outside schedule.'),
  ('CAMPAIGN_CAP_REACHED', 'CAMPAIGN', 'Campaign has reached a configured cap.'),
  ('DELIVERY_TIMEOUT', 'DELIVERY', 'Delivery timed out.'),
  ('DELIVERY_REJECTED', 'DELIVERY', 'Buyer rejected the delivery.'),
  ('RETURN_WINDOW_EXPIRED', 'RETURN', 'Return window has expired.'),
  ('PAYMENT_FAILED', 'PAYMENT', 'Payment processor reported failure.'),
  ('PAYOUT_BELOW_THRESHOLD', 'PAYOUT', 'Payable balance is below the configured threshold.'),
  ('CONVERSION_UNATTRIBUTED', 'CONVERSION', 'Conversion event could not be attributed to a known transaction.')
on conflict (code) do nothing;
