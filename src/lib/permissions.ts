export const PERMISSIONS = [
  "org:read",
  "org:update",
  "members:manage",
  "campaigns:manage",
  "campaigns:read",
  "funding:manage",
  "funding:read",
  "sources:manage",
  "sources:read",
  "payouts:manage",
  "payouts:read",
  "integrations:manage",
  "reporting:read",
  "agreements:accept",
  "platform:admin:all",
  "platform:cross_organization:read",
  "platform:compliance:manage",
  "platform:finance:manage",
  "platform:support:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function ownerRoleForType(type: "advertiser" | "publisher"): string {
  return type === "advertiser" ? "advertiser_owner" : "publisher_owner";
}
