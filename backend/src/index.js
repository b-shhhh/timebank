require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const hpp = require('hpp');

const { authRateLimiter, globalApiLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const mfaRoutes = require('./routes/mfa.routes');
const profileRoutes = require('./routes/profile.routes');
const transactionRoutes = require('./routes/transaction.routes');
const disputeRoutes = require('./routes/dispute.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'], // data: needed for the MFA QR code
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'same-site' },
}));
app.use(hpp()); // strips duplicate query-string params (HTTP parameter pollution)

app.use(cors({
  origin: process.env.CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
}));

app.use(express.json({ limit: '100kb' })); // bound request body size
app.use(cookieParser());

app.use(globalApiLimiter);

app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.use('/api/auth', authRateLimiter, authRoutes);
app.use('/api/mfa', mfaRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/bookings', transactionRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`TimeBank API listening on port ${PORT}`);
});

module.exports = app;
