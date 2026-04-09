import AuditLog from '../models/AuditLog.js';

export const logAudit = async ({
  actor,
  actorRole,
  action,
  patient,
  resource,
  ipAddress,
  outcome = 'SUCCESS',
  reason = null,
  targetType = null,
  targetId = null,
  targetName = null,
  metadata = null
}) => {
  try {
    await AuditLog.create({
      actor,
      actorRole,
      action,
      patient,
      resource,
      ipAddress,
      outcome,
      reason,
      targetType,
      targetId,
      targetName,
      metadata
    });
  } catch (error) {
    console.error('Audit log error:', error.message);
  }
};
