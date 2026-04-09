import Patient from '../models/Patient.js';
import { fetchUnifiedAuditEvents } from '../utils/auditEventFormatter.js';
import { logAudit } from '../utils/auditLogger.js';

export const getMyAuditLogs = async (req, res) => {
  try {
    if (req.user.role === 'patient') {
      const patient = await Patient.findOne({ user: req.user.id }).select('_id phone');

      if (!patient) {
        return res.status(404).json({
          message: 'Patient profile not found'
        });
      }

      await logAudit({
        actor: req.user.id,
        actorRole: req.user.role,
        action: 'PATIENT_AUDIT_VIEW',
        patient: patient._id,
        resource: 'AUDIT_LOG',
        ipAddress: req.ip,
        targetType: 'patient',
        targetId: `${patient._id}`,
        targetName: 'Patient audit log'
      });

      const mergedLogs = await fetchUnifiedAuditEvents({
        auditFilter: { patient: patient._id },
        loginFilter: { phone: patient.phone },
        auditLimit: 200,
        loginLimit: 50
      });

      return res.json(mergedLogs);
    }

    const logs = await fetchUnifiedAuditEvents({
      auditFilter: { actor: req.user.id },
      auditLimit: 200
    });

    return res.json(logs);
  } catch (error) {
    return res.status(500).json({
      message: 'Error fetching audit logs'
    });
  }
};
