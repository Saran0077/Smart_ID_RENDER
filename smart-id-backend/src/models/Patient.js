import mongoose from 'mongoose';

const patientSchema = new mongoose.Schema(
  {
    // 🔗 Link to User account
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },

    // 🪪 NFC Card UUID (Phase 5)
    nfcUuid: {
      type: String,
      unique: true,
      sparse: true // allows patients without NFC initially
    },

    // 👆 Fingerprint Template ID (Hardware Integration)
    fingerprintId: {
      type: String,
      unique: true,
      sparse: true
    },

    fullName: {
      type: String,
      required: true,
      trim: true
    },

    govtId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      default: null
    },

    dob: {
      type: Date,
      required: true
    },

    age: {
      type: Number,
      required: true
    },

    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
      required: true
    },

    bloodGroup: {
      type: String,
      required: true
    },

    heightCm: {
      type: Number,
      min: 0,
      default: null
    },

    weightKg: {
      type: Number,
      min: 0,
      default: null
    },

    phone: {
      type: String,
      required: true,
      unique: true
    },

    address: {
      type: String
    },

    emergencyContact: {
      name: String,
      phone: String
    },

    medicalHistory: [
      {
        condition: String,
        diagnosedDate: Date,
        notes: String,
        source: String,
        doctorName: String,
        doctorId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        hospitalName: String,
        recordedByRole: String
      }
    ],

    allergies: {
      type: [String],
      default: []
    },

    surgeries: {
      type: [String],
      default: []
    },

    dispensedPrescriptions: {
      type: [String],
      default: []
    }
  },
  {
    timestamps: true
  }
);

patientSchema.index({ fullName: 1 });
patientSchema.index({ fullName: 1, phone: 1 });
patientSchema.index({ govtId: 1 });
patientSchema.index({ dob: 1 });
patientSchema.index({ age: 1 });
patientSchema.index({ gender: 1 });
patientSchema.index({ bloodGroup: 1 });
patientSchema.index({ heightCm: 1 });
patientSchema.index({ weightKg: 1 });
patientSchema.index({ 'emergencyContact.name': 1 });
patientSchema.index({ 'emergencyContact.phone': 1 });
patientSchema.index({ allergies: 1 });

export default mongoose.model('Patient', patientSchema);
