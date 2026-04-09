import AuditLog from '../models/AuditLog.js';
import LoginAudit from '../models/LoginAudit.js';

const EMERGENCY_ACTION_PATTERN = /EMERGENCY/i;

export const mapAuditLogEvent = (log) => ({
  id: `audit-${log._id}`,
  source: 'audit',
  timestamp: log.createdAt,
  createdAt: log.createdAt,
  actorName: log.actor?.name || log.actor?.username || log.actorRole || 'System',
  actorRole: log.actorRole || 'system',
  action: log.action,
  resource: log.resource || 'AUDIT',
  outcome: log.outcome || 'SUCCESS',
  patientName: log.patient?.fullName || null,
  targetName: log.targetName || log.patient?.fullName || log.resource || null,
  targetType: log.targetType || (log.patient ? 'patient' : 'system'),
  reason: log.reason || null,
  metadata: log.metadata || null,
  isEmergency: EMERGENCY_ACTION_PATTERN.test(log.action || '')
});

const mapLoginOutcome = (status) => {
  switch (status) {
    case 'OTP_FAILED':
    case 'LOGIN_FAILED':
    case 'NOMINEE_VERIFY_FAILED':
      return 'FAILED';
    default:
      return 'SUCCESS';
  }
};

export const mapLoginAuditEvent = (log) => ({
  id: `login-${log._id}`,
  source: 'login',
  timestamp: log.createdAt,
  createdAt: log.createdAt,
  actorName: log.isNominee ? (log.nomineeName || 'Nominee') : 'Patient login',
  actorRole: log.isNominee ? 'nominee' : 'patient',
  action: log.status,
  resource: 'OTP_LOGIN',
  outcome: mapLoginOutcome(log.status),
  patientName: log.patientName || null,
  targetName: log.patientName || log.phone || null,
  targetType: log.isNominee ? 'nominee' : 'patient',
  reason: null,
  metadata: {
    phone: log.phone,
    patientId: log.patientId || null,
    userAgent: log.userAgent || null,
    ip: log.ip || null,
    isNominee: Boolean(log.isNominee)
  },
  isEmergency: false
});

export const sortAuditEvents = (events) =>
  [...events].sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp));

export const fetchUnifiedAuditEvents = async ({
  auditFilter = {},
  loginFilter = null,
  auditLimit = 100,
  loginLimit = 100
}) => {
  const tasks = [
    AuditLog.find(auditFilter)
      .populate('actor', 'name username role')
      .populate('patient', 'fullName')
      .sort({ createdAt: -1 })
      .limit(auditLimit)
  ];

  if (loginFilter) {
    tasks.push(
      LoginAudit.find(loginFilter)
        .sort({ createdAt: -1 })
        .limit(loginLimit)
    );
  }

  const [auditLogs, loginLogs = []] = await Promise.all(tasks);

  return sortAuditEvents([
    ...auditLogs.map(mapAuditLogEvent),
    ...loginLogs.map(mapLoginAuditEvent)
  ]);
};
