/** PX API 2.0 (leadapi.px.com) types — see https://api.px.com/ */

export type PxEnvironment = "testing" | "production";

export type PxResourceType = "lead" | "call";

export type PxClientConfig = {
  /** Default https://leadapi.px.com */
  baseUrl?: string;
  /** Publisher/API token from PX (ApiToken) */
  apiToken: string;
  affiliateId?: string;
  timeoutMs?: number;
};

export type PxPingRequest = {
  ApiToken: string;
  Vertical: string;
  OriginalURL?: string;
  Source?: string;
  SessionLength?: string | number;
  VerifyAddress?: boolean | string;
  ZipCode?: string;
  State?: string;
  TCPAText?: string;
  JornayaLeadId?: string;
  TrustedFormURL?: string;
  UserAgent?: string;
  /** Vertical-specific attributes (flattened) */
  [key: string]: unknown;
};

export type PxPostRequest = PxPingRequest & {
  TransactionId: string;
  FirstName?: string;
  LastName?: string;
  Email?: string;
  PhoneNumber?: string;
  Address1?: string;
  City?: string;
};

export type PxLeg = {
  Name?: string | null;
  Hash?: string;
  HashLegname?: string;
  Legname?: string;
  Payout?: number | string;
  Status?: string;
};

export type PxApiResponse = {
  TransactionId?: string;
  TransactionID?: string;
  Success?: boolean;
  Payout?: number | string | null;
  Message?: string | null;
  Errors?: unknown;
  Sold?: unknown;
  RedirectUrl?: string | null;
  BuyerRawResponse?: unknown;
  Environment?: string | null;
  Legs?: PxLeg[] | null;
  Result?: string;
};

export type PxNormalizedResult = {
  ok: boolean;
  transactionId: string | null;
  payoutCents: number | null;
  message: string | null;
  environment: string | null;
  legs: PxLeg[];
  raw: PxApiResponse;
};

export type QentraxOpportunityPayload = {
  verticalCode: string;
  productCode?: string | null;
  zip?: string;
  state?: string;
  originalUrl?: string;
  source?: string;
  sessionLengthSec?: number;
  tcpaText?: string;
  jornayaLeadId?: string;
  trustedFormUrl?: string;
  userAgent?: string;
  /** Contact — only on post */
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address1?: string;
  city?: string;
  attributes?: Record<string, unknown>;
};
