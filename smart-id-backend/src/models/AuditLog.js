import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    actorRole: {
      type: String,
      required: true
    },

    action: {
      type: String,
      required: true
    },

    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient'
    },

    resource: {
      type: String
    },

    outcome: {
      type: String,
      enum: ['SUCCESS', 'DENIED', 'FAILED'],
      default: 'SUCCESS'
    },

    reason: {
      type: String,
      default: null
    },

    targetType: {
      type: String,
      default: null
    },

    targetId: {
      type: String,
      default: null
    },

    targetName: {
      type: String,
      default: null
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },

    ipAddress: {
      type: String
    }
  },
  {
    timestamps: true
  }
);

auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ patient: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ actorRole: 1, createdAt: -1 });
auditLogSchema.index({ resource: 1, createdAt: -1 });
auditLogSchema.index({ outcome: 1, createdAt: -1 });

export default mongoose.model('AuditLog', auditLogSchema);
