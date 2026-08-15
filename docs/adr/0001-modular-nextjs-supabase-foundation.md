# ADR-0001: Modular Next.js and Supabase foundation

**Status:** Accepted  
**Date:** 2026-08-15  
**Deciders:** Qentrax engineering; owner review required before production provisioning

## Context

The canonical specification recommends Next.js, TypeScript, PostgreSQL/Supabase authentication and RLS. No prior repository or deployed application was present in the supplied workspace. The platform needs a fast dashboard/API surface while keeping latency-sensitive marketplace work separable.

## Decision

Start as a modular Next.js application with domain modules, versioned route handlers, Supabase/PostgreSQL migrations, RLS, and adapter interfaces for external services. Queue workers will be separately deployable before Phase 4; dashboard requests will never host unbounded provider chains.

## Options considered

| Option | Complexity | Operational cost | Fit |
|---|---:|---:|---|
| Modular Next.js + separate workers | Medium | Medium | Strongest alignment with canonical stack |
| Immediate microservices | High | High | Premature without production traffic evidence |
| Single synchronous web process | Low | Low | Conflicts with reliability and latency isolation requirements |

## Consequences

- Shared types and migrations reduce contract drift.
- RLS and application authorization provide defense in depth.
- Worker boundaries must be introduced before marketplace provider calls.
- Supabase, Vercel, Redis and observability accounts remain deployment dependencies.
