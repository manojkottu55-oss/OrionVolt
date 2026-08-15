const express = require('express');
const cors = require('cors');
const config = require('./config');
const logger = require('./utils/logger');
const mqttService = require('./services/mqttService');
const { checkConnection } = require('./config/supabaseClient');

// Validate environment variables first
config.validateEnv();

const app = express();

// Middleware
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'https://orion-volt-userapp.vercel.app',
    'https://orion-volt-userapp.vercel.app/',
    process.env.FRONTEND_URL
  ],
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());

// Health-check homepage
app.get('/', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'OrionVolt Backend API is running' });
});

// Start the server
const server = app.listen(config.PORT, async () => {
    logger.info(`=================================================`);
    logger.info(`OrionVolt Backend Service starting...`);
    logger.info(`=================================================`);
    logger.info(`HTTP REST API listening on port ${config.PORT}`);
    
    // Connect to Supabase
    const dbConnected = await checkConnection();
    if (!dbConnected) {
        logger.error('Failed to connect to Supabase. Exiting...');
        process.exit(1);
    }

    // Initialize MQTT Connection & Subscriptions
    try {
        mqttService.init();
    } catch (err) {
        logger.error('Failed to initialize MQTT: ' + err.message);
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        logger.info('HTTP server closed.');
        process.exit(0);
    });
});

// Import and mount routes
const authRoutes = require('./routes/auth');
const guestRoutes = require('./routes/guest');
const signinRoutes = require('./routes/signin');
const adminRoutes = require('./routes/admin');
const vehicleRoutes = require('./routes/vehicle');
const paymentRoutes = require('./routes/payment');
const refundRoutes = require('./routes/refund');
const chargeRoutes = require('./routes/charge');
const feedbackRoutes = require('./routes/feedback');
const tariffConfigRoutes = require('./routes/tariffConfig');
const sessionsRoutes = require('./routes/sessions');
const bookingsRoutes = require('./routes/bookings');
const profileRoutes = require('./routes/profile');
const supportRoutes = require('./routes/support');

app.use('/api/auth', authRoutes);
app.use('/api/guest', guestRoutes);
app.use('/api/signin', signinRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/refund', refundRoutes);
app.use('/api/charge', chargeRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/tariff-config', tariffConfigRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/support', supportRoutes);


// Health check
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'orionvolt-backend', db: 'supabase' });
});

// Temporary endpoint to list all kiosk IDs
app.get('/api/kiosks/list-all', async (req, res) => {
    try {
        const db = require('./db');
        const kiosks = await db.kiosks.findAll();
        res.json({ kiosks: kiosks.map(k => k.kiosk_id) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Temporarily print all available routes
console.log("--- Available Routes ---");
app._router.stack.forEach(r => {
  if (r.route && r.route.path) {
    console.log(r.route.path);
  } else if (r.name === 'router') {
    // For router middleware, we can print the sub-routes
    r.handle.stack.forEach(handler => {
      if (handler.route && handler.route.path) {
        // We don't have the mount path here easily, but we can print the subpath
        console.log(`[Router] ${handler.route.path}`);
      }
    });
  }
});
console.log("------------------------");
