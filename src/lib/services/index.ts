export { findDemand } from "./demand";
export type { FindDemandInput, FindDemandResult, DemandCandidate } from "./demand";
export { getRequirements } from "./requirements";
export type { GetRequirementsResult, RequirementField } from "./requirements";
export { checkOpportunity } from "./opportunity-preflight";
export type { PreflightInput, PreflightResult } from "./opportunity-preflight";
export { getPerformance } from "./performance";
export type { PerformanceQuery, PerformanceResult, PerformanceMetrics } from "./performance";

// Phase 1: Routing Foundation
export { checkCampaignEligibility } from "./eligibility";
export type { EligibilityCheckInput, EligibilityCheckResult } from "./eligibility";
export { runAuction, RoutingStrategy } from "./routing";
export type { RoutingInput, RoutingCandidate, RoutingDecision } from "./routing";
export { recordAuctionDecision, getAuctionDecision } from "./auction-log";
export type { RecordAuctionInput, AuctionLogRecord } from "./auction-log";

// Phase 2: Native Ping/Post
export { ping, post } from "./ping-post";
export type { PingInput, PingResult, PostInput, PostResult } from "./ping-post";
