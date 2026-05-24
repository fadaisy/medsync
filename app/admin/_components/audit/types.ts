export interface AuditRow {
  id: string;
  timestampIso: string;
  action: string;
  targetKind: string;
  targetId: string;
  reason: string;
  actorId: string;
  actorEmail: string | null;
  actorFullName: string | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}
