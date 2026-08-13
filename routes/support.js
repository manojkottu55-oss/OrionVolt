const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');
const authMiddleware = require('../middleware/auth');

// Support ticket endpoint
// Optional auth - if user is authenticated, attach user, otherwise proceed
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // Proceed without req.user
  }
  // Try authMiddleware, but if it fails, just ignore and next
  authMiddleware(req, res, (err) => {
    if (err) return next();
    next();
  });
};

router.post('/ticket', optionalAuth, supportController.createTicket);

module.exports = router;
