import Patient from '../models/Patient.js';
import PDFDocument from 'pdfkit';
import { logAudit } from '../utils/auditLogger.js';

const getActorId = (req) => req.user?.id || req.user?._id || null;
const getSourceLabel = (entry) => {
  if (entry?.source === 'doctor_portal') return 'Doctor';
  if (entry?.source === 'hospital_portal') return 'Hospital';
  if (entry?.recordedByRole === 'doctor') return 'Doctor';
  if (entry?.recordedByRole === 'hospital') return 'Hospital';
  return 'Care team';
};

const getPatientPrescriptions = (patient) => {
  const history = patient.medicalHistory || [];

  if (history.length === 0) {
    return [
      {
        id: `${patient._id}-default`,
        name: 'General medication plan',
        notes: 'No structured prescription has been recorded yet.',
        issuedAt: patient.updatedAt
      }
    ];
  }

  return history.map((entry, index) => ({
    id: `${patient._id}-${index + 1}`,
    name: entry.condition || `Prescription ${index + 1}`,
    notes: entry.notes || 'No additional notes',
    issuedAt: entry.diagnosedDate || patient.updatedAt,
    doctor: entry.doctorName || 'Care team',
    hospital: entry.hospitalName || (entry.source === 'doctor_portal' ? 'Doctor Portal' : 'Hospital not recorded'),
    source: entry.source || null,
    sourceLabel: getSourceLabel(entry),
    recordedByRole: entry.recordedByRole || null
  }));
};

const buildPdfBuffer = ({ patient, prescription }) => new Promise((resolve, reject) => {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const buffers = [];

  doc.on('data', (chunk) => buffers.push(chunk));
  doc.on('end', () => resolve(Buffer.concat(buffers)));
  doc.on('error', reject);

  const labelStyle = () => doc.font('Helvetica-Bold').fontSize(11).fillColor('#64748b');
  const valueStyle = () => doc.font('Helvetica').fontSize(14).fillColor('#0f172a');

  doc.font('Helvetica-Bold')
    .fontSize(22)
    .fillColor('#0f172a')
    .text('Smart ID Prescription Summary', { align: 'left' });

  doc.moveDown(1);

  labelStyle();
  doc.text('Patient');
  valueStyle();
  doc.text(patient.fullName || 'Unknown Patient');

  doc.moveDown(0.6);
  labelStyle();
  doc.text('NFC ID');
  valueStyle();
  doc.text(patient.nfcUuid || 'Not linked');

  doc.moveDown(0.6);
  labelStyle();
  doc.text('Phone');
  valueStyle();
  doc.text(patient.phone || 'N/A');

  doc.moveDown(0.6);
  labelStyle();
  doc.text('Prescription');
  valueStyle();
  doc.text(prescription.name || 'Clinical note');

  doc.moveDown(0.6);
  labelStyle();
  doc.text('Issued');
  valueStyle();
  doc.text(new Date(prescription.issuedAt).toLocaleString());

  doc.moveDown(0.6);
  labelStyle();
  doc.text('Source');
  valueStyle();
  doc.text(prescription.sourceLabel || 'Care team');

  doc.moveDown(0.6);
  labelStyle();
  doc.text('Recorded By');
  valueStyle();
  doc.text(prescription.doctor || 'Care team');

  doc.moveDown(0.6);
  labelStyle();
  doc.text('Facility');
  valueStyle();
  doc.text(prescription.hospital || 'Hospital not recorded');

  doc.moveDown(1);
  labelStyle();
  doc.text('Notes');
  valueStyle();
  doc.text(prescription.notes || 'No additional notes recorded.', {
    width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    align: 'left',
    lineGap: 4
  });

  doc.end();
});

export const scanPatientForMedicalShop = async (req, res) => {
  try {
    const { uid } = req.body;
    const actorId = getActorId(req);

    if (!uid) {
      return res.status(400).json({ message: 'NFC UID is required' });
    }

    const patient = await Patient.findOne({ nfcUuid: uid }).populate('user', 'name username role');

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found for this NFC card' });
    }

    await logAudit({
      actor: actorId,
      actorRole: req.user.role,
      action: 'MEDICAL_SHOP_SCAN',
      patient: patient._id,
      resource: 'PATIENT_PRESCRIPTIONS',
      ipAddress: req.ip,
      targetType: 'patient',
      targetId: `${patient._id}`,
      targetName: patient.fullName,
      metadata: {
        nfcId: patient.nfcUuid
      }
    });

    res.json({
      patient: {
        id: patient._id,
        fullName: patient.fullName,
        name: patient.fullName,
        age: patient.age,
        gender: patient.gender,
        phone: patient.phone,
        bloodGroup: patient.bloodGroup,
        nfcUuid: patient.nfcUuid,
        prescriptions: getPatientPrescriptions(patient)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to scan patient card' });
  }
};

export const getPrescriptionPdf = async (req, res) => {
  try {
    const actorId = getActorId(req);
    const prescriptionId = decodeURIComponent(req.params.prescriptionId);
    const lastHyphenIndex = prescriptionId.lastIndexOf('-');
    const patientId = prescriptionId.substring(0, lastHyphenIndex);
    const suffix = prescriptionId.substring(lastHyphenIndex + 1);

    const patient = await Patient.findById(patientId);

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const prescriptions = getPatientPrescriptions(patient);
    const prescription = prescriptions.find((item) => item.id === prescriptionId)
      || prescriptions[Number(suffix) - 1]
      || prescriptions[0];

    const pdfBuffer = await buildPdfBuffer({ patient, prescription });

    await logAudit({
      actor: actorId,
      actorRole: req.user.role,
      action: 'PRESCRIPTION_PDF_VIEW',
      patient: patient._id,
      resource: 'PRESCRIPTION_PDF',
      ipAddress: req.ip,
      targetType: 'patient',
      targetId: `${patient._id}`,
      targetName: patient.fullName,
      metadata: {
        prescriptionId
      }
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="prescription-${prescriptionId}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to generate prescription PDF' });
  }
};

export const markAsDispensed = async (req, res) => {
  try {
    const actorId = getActorId(req);
    const { prescriptionId, patientId } = req.body;

    if (!prescriptionId || !patientId) {
      return res.status(400).json({ message: 'Prescription ID and Patient ID are required' });
    }

    const patient = await Patient.findById(patientId);

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    if (!patient.dispensedPrescriptions) {
      patient.dispensedPrescriptions = [];
    }

    if (!patient.dispensedPrescriptions.includes(prescriptionId)) {
      patient.dispensedPrescriptions.push(prescriptionId);
      await patient.save();
    }

    await logAudit({
      actor: actorId,
      actorRole: req.user.role,
      action: 'PRESCRIPTION_DISPENSE',
      patient: patient._id,
      resource: 'PATIENT_PRESCRIPTIONS',
      ipAddress: req.ip,
      targetType: 'patient',
      targetId: `${patient._id}`,
      targetName: patient.fullName,
      metadata: {
        prescriptionId
      }
    });

    res.json({
      success: true,
      message: 'Prescription marked as dispensed',
      prescriptionId
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to mark prescription as dispensed' });
  }
};

export const getPatientById = async (req, res) => {
  try {
    const actorId = getActorId(req);
    const { patientId } = req.params;

    const patient = await Patient.findById(patientId).populate('user', 'name username role');

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    await logAudit({
      actor: actorId,
      actorRole: req.user.role,
      action: 'PATIENT_PRESCRIPTIONS_VIEW',
      patient: patient._id,
      resource: 'PATIENT_PRESCRIPTIONS',
      ipAddress: req.ip,
      targetType: 'patient',
      targetId: `${patient._id}`,
      targetName: patient.fullName
    });

    res.json({
      patient: {
        id: patient._id,
        fullName: patient.fullName,
        name: patient.fullName,
        age: patient.age,
        gender: patient.gender,
        phone: patient.phone,
        bloodGroup: patient.bloodGroup,
        nfcUuid: patient.nfcUuid,
        address: patient.address,
        emergencyContact: patient.emergencyContact,
        prescriptions: getPatientPrescriptions(patient),
        dispensedPrescriptions: patient.dispensedPrescriptions || []
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch patient details' });
  }
};
