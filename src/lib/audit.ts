export type AuditEventInput = { actorUserId: string; actorOrgId: string; action: string; resourceType: string; resourceId: string; reason?: string; requestId: string; beforeRedacted?: unknown; afterRedacted?: unknown };
export interface AuditSink { append(event: AuditEventInput): Promise<void> }
export async function recordAudit(sink: AuditSink, event: AuditEventInput): Promise<void> {
  if (!event.requestId || !event.action) throw new Error("Audit events require requestId and action");
  await sink.append(Object.freeze({ ...event }));
}
