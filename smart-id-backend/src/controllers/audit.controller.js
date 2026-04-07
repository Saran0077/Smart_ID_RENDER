import AuditLog from '../models/AuditLog.js';
import LoginAudit from '../models/LoginAudit.js';
import Patient from '../models/Patient.js';

const mapAuditLog = (log) => ({
  id: log._id,
  createdAt: log.createdAt,
  timestamp: log.createdAt,
  actorName: log.actor?.name || log.actor?.username || log.actorRole || 'System',
  actorRole: log.actorRole,
  action: log.action,
  resource: log.resource,
  method: log.resource || 'AUDIT_LOG',
  emergency: /EMERGENCY/i.test(log.action),
  patientName: log.patient?.fullName || null
});

const mapLoginAudit = (log) => ({
  id: log._id,
  createdAt: log.createdAt,
  timestamp: log.createdAt,
  actorName: log.isNominee ? (log.nomineeName || 'Nominee') : 'Patient login',
  actorRole: log.isNominee ? 'nominee' : 'patient',
  action: log.status,
  resource: 'OTP_LOGIN',
  method: 'OTP',
  emergency: false,
  patientName: log.patientName || null
});

export const getMyAuditLogs = async (req, res) => {
  try {
    if (req.user.role === 'patient') {
      const patient = await Patient.findOne({ user: req.user.id }).select('_id phone');

      if (!patient) {
        return res.status(404).json({
          message: 'Patient profile not found'
        });
      }

      const [patientLogs, loginLogs] = await Promise.all([
        AuditLog.find({ patient: patient._id })
          .populate('actor', 'name username role')
          .populate('patient', 'fullName')
          .sort({ createdAt: -1 }),
        LoginAudit.find({ phone: patient.phone })
          .sort({ createdAt: -1 })
          .limit(20)
      ]);

      const mergedLogs = [
        ...patientLogs.map(mapAuditLog),
        ...loginLogs.map(mapLoginAudit)
      ].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));

      return res.json(mergedLogs);
    }

    const logs = await AuditLog.find({ actor: req.user.id })
      .populate('actor', 'name username role')
      .populate('patient', 'fullName')
      .sort({ createdAt: -1 });

    return res.json(logs.map(mapAuditLog));
  } catch (error) {
    return res.status(500).json({
      message: 'Error fetching audit logs'
    });
  }
};
