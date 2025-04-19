const jwt = require('jsonwebtoken');
const axios = require('axios');
const { logger } = require('./logger');

// Verify the GitHub token by making a request to GitHub API
async function verifyGithubToken(token) {
  try {
    const response = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `token ${token}`
      }
    });
    
    return {
      valid: true,
      user: response.data.login,
      id: response.data.id
    };
  } catch (error) {
    logger.error(`GitHub token validation failed: ${error.message}`);
    return {
      valid: false,
      error: 'Invalid GitHub token'
    };
  }
}

// Verify the workspace token
function verifyWorkspaceToken(token) {
  try {
    // In a production environment, you would verify against a database of valid tokens
    // For now, we'll just verify the JWT signature
    const decoded = jwt.verify(token, process.env.TOKEN_SECRET_KEY);
    
    return {
      valid: true,
      workspaceId: decoded.workspaceId,
      userId: decoded.userId
    };
  } catch (error) {
    logger.error(`Workspace token validation failed: ${error.message}`);
    return {
      valid: false,
      error: 'Invalid workspace token'
    };
  }
}

// Middleware to authenticate requests
function authenticate(req, res, next) {
  const { githubToken, workspaceToken } = req.body;
  
  if (!githubToken || !workspaceToken) {
    return res.status(401).json({
      success: false,
      error: 'Missing authentication tokens'
    });
  }
  
  // Verify both tokens
  Promise.all([
    verifyGithubToken(githubToken),
    verifyWorkspaceToken(workspaceToken)
  ]).then(([githubResult, workspaceResult]) => {
    if (!githubResult.valid) {
      return res.status(401).json({
        success: false,
        error: githubResult.error
      });
    }
    
    if (!workspaceResult.valid) {
      return res.status(401).json({
        success: false,
        error: workspaceResult.error
      });
    }
    
    // Validate that the GitHub user matches the workspace user
    if (githubResult.id !== workspaceResult.userId) {
      return res.status(403).json({
        success: false,
        error: 'User mismatch between tokens'
      });
    }
    
    // Add user info to request
    req.user = {
      id: githubResult.id,
      username: githubResult.user,
      workspaceId: workspaceResult.workspaceId
    };
    
    next();
  }).catch(error => {
    logger.error(`Authentication error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Authentication service error'
    });
  });
}

module.exports = {
  authenticate,
  verifyGithubToken,
  verifyWorkspaceToken
};