/**
 * Atomic Reservation Service
 *
 * Single canonical service for all budget and capacity reservations.
 * All production paths (ping/post/delivery, API, MCP, dashboard) must use this service.
 *
 * Delegates to PostgreSQL RPC functions that implement row-level locking and
 * atomic verify-then-reserve semantics to prevent overselling under concurrent load.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

export interface ReservationResult {
  success: boolean;
  reason_code: string;
  request_id: string;
  reserved_amount?: number;
  reserved_count?: number;
  available_budget?: number;
  available_capacity?: number;
  total_reserved?: number;
  total_capacity?: number;
}

export interface ReleaseResult {
  success: boolean;
  reason_code: string;
  released_amount?: number;
  released_count?: number;
}

export interface FinalizeResult {
  success: boolean;
  reason_code: string;
  finalized_amount?: number;
  finalized_count?: number;
}

export class AtomicReservationService {
  private supabase: SupabaseClient;

  constructor(supabaseUrl?: string, supabaseKey?: string) {
    const url = supabaseUrl || process.env.SUPABASE_URL;
    const key = supabaseKey || process.env.SUPABASE_SERVICE_KEY;

    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required");
    }

    this.supabase = createClient(url, key);
  }

  /**
   * Reserve campaign capacity atomically.
   *
   * This is the only correct way to reserve capacity. It prevents:
   * - Budget overselling (reserved + finalized + new request <= daily_budget)
   * - Capacity overselling (reserved + delivered + new request <= daily_capacity)
   * - Double-reservation of the same request (idempotency)
   *
   * @param organizationId Organization UUID
   * @param campaignId Campaign UUID
   * @param amount Amount to reserve (currency, e.g., cents)
   * @param count Delivery count to reserve
   * @param requestId Unique request identifier (for tracing)
   * @param idempotencyKey Idempotency key (must be unique per logical operation)
   * @returns ReservationResult with success flag and reason code
   */
  async reserve(
    organizationId: string,
    campaignId: string,
    amount: number,
    count: number,
    requestId: string = uuidv4(),
    idempotencyKey: string = uuidv4()
  ): Promise<ReservationResult> {
    try {
      const { data, error } = await this.supabase.rpc(
        "reserve_campaign_capacity",
        {
          p_organization_id: organizationId,
          p_campaign_id: campaignId,
          p_request_id: requestId,
          p_idempotency_key: idempotencyKey,
          p_amount: amount,
          p_count: count,
        }
      );

      if (error) {
        return {
          success: false,
          reason_code: "RPC_ERROR",
          request_id: requestId,
        };
      }

      return (data as ReservationResult) || {
        success: false,
        reason_code: "UNKNOWN_ERROR",
        request_id: requestId,
      };
    } catch (e) {
      return {
        success: false,
        reason_code: "EXCEPTION",
        request_id: requestId,
      };
    }
  }

  /**
   * Release a reservation (e.g., when delivery fails).
   * Idempotent: calling multiple times with same key is safe.
   *
   * @param organizationId Organization UUID
   * @param campaignId Campaign UUID
   * @param idempotencyKey Must match the original reservation's idempotency_key
   * @returns ReleaseResult
   */
  async release(
    organizationId: string,
    campaignId: string,
    idempotencyKey: string
  ): Promise<ReleaseResult> {
    try {
      const { data, error } = await this.supabase.rpc("release_reservation", {
        p_organization_id: organizationId,
        p_campaign_id: campaignId,
        p_idempotency_key: idempotencyKey,
      });

      if (error) {
        return {
          success: false,
          reason_code: "RPC_ERROR",
        };
      }

      return (data as ReleaseResult) || {
        success: false,
        reason_code: "UNKNOWN_ERROR",
      };
    } catch (e) {
      return {
        success: false,
        reason_code: "EXCEPTION",
      };
    }
  }

  /**
   * Finalize a reservation (convert from reserved to charged).
   * Idempotent: calling multiple times with same key is safe.
   *
   * @param organizationId Organization UUID
   * @param campaignId Campaign UUID
   * @param idempotencyKey Must match the original reservation's idempotency_key
   * @returns FinalizeResult
   */
  async finalize(
    organizationId: string,
    campaignId: string,
    idempotencyKey: string
  ): Promise<FinalizeResult> {
    try {
      const { data, error } = await this.supabase.rpc(
        "finalize_reservation",
        {
          p_organization_id: organizationId,
          p_campaign_id: campaignId,
          p_idempotency_key: idempotencyKey,
        }
      );

      if (error) {
        return {
          success: false,
          reason_code: "RPC_ERROR",
        };
      }

      return (data as FinalizeResult) || {
        success: false,
        reason_code: "UNKNOWN_ERROR",
      };
    } catch (e) {
      return {
        success: false,
        reason_code: "EXCEPTION",
      };
    }
  }

  /**
   * Wire this service into ping/post/delivery handlers.
   * Example usage in /v1/ping handler:
   *
   * const service = new AtomicReservationService();
   * const reservation = await service.reserve(
   *   orgId, campaignId, estimatedAmount, 1, pingRequestId, idempotencyKey
   * );
   * if (!reservation.success) {
   *   return { ok: false, error_code: reservation.reason_code };
   * }
   */
}

// Singleton instance for application use
let instance: AtomicReservationService | null = null;

export function getAtomicReservationService(): AtomicReservationService {
  if (!instance) {
    instance = new AtomicReservationService();
  }
  return instance;
}
