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
app.use(cors());
app.use(express.json());

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

app.use('/api/auth', authRoutes);
app.use('/api/guest', guestRoutes);
app.use('/api/signin', signinRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/refund', refundRoutes);
app.use('/api/charge', chargeRoutes);
app.use('/api/feedback', feedbackRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'orionvolt-backend', db: 'supabase' });
});
