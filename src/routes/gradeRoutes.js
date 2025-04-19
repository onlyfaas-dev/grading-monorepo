const express = require('express');
const router = express.Router();
const { authenticate } = require('../util/auth');
const { gradeSubmission } = require('../grader/grader');
const { logger } = require('../util/logger');

// Submit a lab for grading
router.post('/grade', authenticate, async (req, res, next) => {
  try {
    const { labId } = req.body;
    const { workspaceId, username } = req.user;
    
    if (!labId) {
      return res.status(400).json({
        success: false,
        error: 'Missing labId in request'
      });
    }
    
    logger.info(`Processing grading request for lab ${labId} from user ${username}`);
    
    // Grade the submission
    const results = await gradeSubmission(labId, workspaceId, username);
    
    res.status(200).json({
      success: true,
      results
    });
  } catch (error) {
    logger.error(`Grading error: ${error.message}`);
    next(error);
  }
});

// Get grading results for a specific submission
router.get('/results/:submissionId', authenticate, async (req, res, next) => {
  try {
    const { submissionId } = req.params;
    const { username } = req.user;
    
    // In a real implementation, you would fetch results from a database
    // For now, we'll just return a placeholder
    
    res.status(200).json({
      success: true,
      submission: {
        id: submissionId,
        user: username,
        status: 'completed',
        timestamp: new Date().toISOString(),
        results: {
          // Placeholder results
          score: 85,
          total: 100,
          items: [
            { name: 'Test 1', points: 40, possible: 40, message: 'Passed' },
            { name: 'Test 2', points: 45, possible: 60, message: 'Partially correct' }
          ]
        }
      }
    });
  } catch (error) {
    logger.error(`Error fetching results: ${error.message}`);
    next(error);
  }
});

module.exports = router;