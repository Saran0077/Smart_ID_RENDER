import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

// Routes
import authRoutes from './routes/auth.routes.js';
import patientRoutes from './routes/patient.routes.js';
import consentRoutes from './routes/consent.routes.js';
import nfcRoutes from './routes/nfc.routes.js';
import auditRoutes from './routes/audit.routes.js';
import otpRoutes from './routes/otpRoutes.js';
import adminRoutes from './routes/admin.routes.js';
import medicalShopRoutes from './routes/medicalShop.routes.js';
import hospitalRoutes from './routes/hospital.routes.js';
import doctorRoutes from './routes/doctor.routes.js';

// Rate limiters
import { authLimiter } from './middleware/rateLimit.js';

// Middleware
import { protect } from './middleware/auth.middleware.js';
import { authorizeRoles } from './middleware/role.middleware.js';

// Validate required environment variables on startup
if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET is not configured');
    process.exit(1);
}

const app = express();

// Trust Render's reverse proxy (required for rate limiting behind proxy)
app.set('trust proxy', 1);

// =====================
// SECURITY MIDDLEWARE
// =====================

// Helmet - Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            scriptSrc: ["'self'"]
        }
    }
}));

// CORS - Configure allowed origins
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').filter(Boolean) || [];

if (allowedOrigins.length === 0) {
    console.warn('⚠️ WARNING: ALLOWED_ORIGINS not set. CORS is open to all origins!');
}

app.use(cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-hardware-key']
}));

// Body size limit - Prevent memory exhaustion attacks
// Increased to 50kb to support larger clinical notes and patient histories
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

// Handle payload too large errors
app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed' || (err.status === 413) || err.code === 'LIMIT_PAYLOAD_SIZE') {
        return res.status(413).json({ 
            success: false,
            message: 'Request payload too large. Please reduce the size of clinical notes or patient data.'
        });
    }
    next(err);
});

// Rate limiters are imported from middleware/rateLimit.js

// =====================
// REQUEST LOGGING
// =====================
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (process.env.NODE_ENV !== 'test') {
            console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
        }
    });
    next();
});

// =====================
// ROUTES
// =====================

// Auth Routes (Username/Password) - Rate limited
app.use('/api/auth', authLimiter, authRoutes);

// OTP Routes (Phone/SMS) - rate limiting is applied per-route
app.use('/api/otp', otpRoutes);

// Patient Profile Routes
app.use('/api/patient', patientRoutes);

// Consent Management Routes
app.use('/api/consent', consentRoutes);

// NFC Routes
app.use('/api/nfc', nfcRoutes);

// Audit Routes
app.use('/api/audit', auditRoutes);

// Admin Routes
app.use('/api/admin', adminRoutes);

// Medical shop routes
app.use('/api/medical-shop', medicalShopRoutes);

// Hospital routes
app.use('/api/hospital', hospitalRoutes);

// Doctor routes
app.use('/api/doctor', doctorRoutes);

// =====================
// TEST & RBAC ROUTES
// =====================

app.get('/api/protected', protect, (req, res) => {
    res.json({
        message: 'JWT working',
        user: req.user
    });
});

app.get('/', (req, res) => {
    res.send('Unified Smart ID Backend is running');
});

// =====================
// CENTRALIZED ERROR HANDLING
// =====================
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
    
    // Don't expose stack traces in production
    const isProduction = process.env.NODE_ENV === 'production';
    
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        ...(isProduction ? {} : { stack: err.stack })
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

export default app;
