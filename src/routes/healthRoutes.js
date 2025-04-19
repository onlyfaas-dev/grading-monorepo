const express = require('express');
const router = express.Router();
const { logger } = require('../util/logger');

// Simple health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Readiness probe endpoint
router.get('/ready', (req, res) => {
  // Could add more sophisticated checks here (e.g., database connection)
  res.status(200).json({ status: 'ready' });
});

module.exports = router;