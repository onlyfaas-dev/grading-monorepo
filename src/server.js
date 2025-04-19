const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const morgan = require('morgan');
const { logger } = require('./util/logger');
const gradeRoutes = require('./routes/gradeRoutes');
const healthRoutes = require('./routes/healthRoutes');

// Load environment variables
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(bodyParser.json());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : '*'
}));
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Routes
app.use('/api', gradeRoutes);
app.use('/', healthRoutes);

// Error handler
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`);
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Grading server listening on port ${PORT}`);
});

module.exports = app;