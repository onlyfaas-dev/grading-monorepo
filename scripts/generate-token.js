#!/usr/bin/env node

/**
 * Generate a JWT token for workspace authentication.
 * This script should be run in the Coder workspace init process.
 * 
 * Usage:
 *   node generate-token.js <workspaceId> <userId>
 * 
 * Environment variables:
 *   TOKEN_SECRET_KEY - Secret key for signing the token
 */

const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: node generate-token.js <workspaceId> <userId>');
  process.exit(1);
}

const [workspaceId, userId] = args;
const secretKey = process.env.TOKEN_SECRET_KEY || 'dev-secret-key';

// Generate the token
const token = jwt.sign(
  {
    workspaceId,
    userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
  },
  secretKey
);

// Save token to file
const tokenDir = path.join(os.homedir(), '.grader');
fs.mkdirSync(tokenDir, { recursive: true });
fs.writeFileSync(path.join(tokenDir, '.token'), token);

console.log('Workspace token generated successfully.');