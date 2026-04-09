import Patient from '../models/Patient.js';
import PDFDocument from 'pdfkit';

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
    issuedAt: entry.diagnosedDate || patient.updatedAt
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

    if (!uid) {
      return res.status(400).json({ message: 'NFC UID is required' });
    }

    const patient = await Patient.findOne({ nfcUuid: uid }).populate('user', 'name username role');

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found for this NFC card' });
    }

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
    const { patientId } = req.params;

    const patient = await Patient.findById(patientId).populate('user', 'name username role');

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

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
