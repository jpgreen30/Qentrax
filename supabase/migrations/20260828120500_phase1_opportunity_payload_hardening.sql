begin;

alter table public.opportunities
  alter column normalized_payload_encrypted drop not null;

commit;
