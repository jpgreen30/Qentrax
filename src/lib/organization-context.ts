export type OrganizationContext = { userId: string; organizationId: string; role: string; permissions: ReadonlySet<string> };
export function assertOrganizationAccess(context: OrganizationContext, resourceOrganizationId: string): void {
  if (context.organizationId !== resourceOrganizationId && !context.permissions.has("platform:cross_organization:read")) throw new Error("AUTH_FORBIDDEN");
}
