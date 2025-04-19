const k8s = require('@kubernetes/client-node');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const { logger } = require('../util/logger');

// Initialize Kubernetes client
const kc = new k8s.KubeConfig();
kc.loadFromDefault(); // Loads from in-cluster configuration when running in a pod

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const batchV1Api = kc.makeApiClient(k8s.BatchV1Api);

/**
 * Creates a grading job to evaluate a student's submission
 */
async function createGradingJob(labId, workspaceId, username) {
  const jobName = `grade-${labId}-${workspaceId}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  
  const job = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: jobName,
      namespace: process.env.NAMESPACE || 'grading-system'
    },
    spec: {
      ttlSecondsAfterFinished: 300, // Auto-delete job after 5 minutes
      template: {
        spec: {
          containers: [
            {
              name: 'grader',
              image: process.env.GRADER_IMAGE || 'grading-worker:latest',
              env: [
                {
                  name: 'LAB_ID',
                  value: labId
                },
                {
                  name: 'WORKSPACE_ID',
                  value: workspaceId
                },
                {
                  name: 'USERNAME',
                  value: username
                }
              ],
              volumeMounts: [
                {
                  name: 'labs-volume',
                  mountPath: '/labs',
                  readOnly: true
                }
              ]
            }
          ],
          volumes: [
            {
              name: 'labs-volume',
              configMap: {
                name: 'lab-content'
              }
            }
          ],
          restartPolicy: 'Never'
        }
      },
      backoffLimit: 0
    }
  };

  try {
    const response = await batchV1Api.createNamespacedJob(
      process.env.NAMESPACE || 'grading-system',
      job
    );
    
    logger.info(`Created grading job ${jobName}`);
    return jobName;
  } catch (error) {
    logger.error(`Error creating grading job: ${error.message}`);
    throw new Error(`Failed to create grading job: ${error.message}`);
  }
}

/**
 * Waits for a job to complete and returns the result
 */
async function waitForJobCompletion(jobName) {
  const namespace = process.env.NAMESPACE || 'grading-system';
  const maxAttempts = 30; // 30 * 2 seconds = 1 minute max wait time
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await batchV1Api.readNamespacedJob(jobName, namespace);
      const job = response.body;
      
      if (job.status.succeeded) {
        logger.info(`Job ${jobName} completed successfully`);
        
        // Find the pod created by this job
        const podList = await k8sApi.listNamespacedPod(
          namespace,
          undefined,
          undefined,
          undefined,
          undefined,
          `job-name=${jobName}`
        );
        
        if (podList.body.items.length > 0) {
          const podName = podList.body.items[0].metadata.name;
          const logs = await k8sApi.readNamespacedPodLog(podName, namespace);
          
          // Parse the results from the pod logs
          try {
            return JSON.parse(logs.body);
          } catch (error) {
            logger.error(`Error parsing job results: ${error.message}`);
            throw new Error('Invalid grading results format');
          }
        }
        
        throw new Error('No pod found for grading job');
      } else if (job.status.failed) {
        logger.error(`Job ${jobName} failed`);
        throw new Error('Grading job failed');
      }
      
      // Job still running, wait and check again
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      logger.error(`Error checking job status: ${error.message}`);
      throw error;
    }
  }
  
  logger.error(`Job ${jobName} timed out`);
  throw new Error('Grading job timed out');
}

/**
 * Grades a lab submission by spinning up a Kubernetes job
 */
async function gradeSubmission(labId, workspaceId, username) {
  try {
    // Create a Kubernetes job to perform the grading
    const jobName = await createGradingJob(labId, workspaceId, username);
    
    // Wait for the job to complete and get results
    const results = await waitForJobCompletion(jobName);
    
    // Process and return the results
    return {
      lab: results.lab,
      items: results.items,
      score: results.score,
      total: results.total,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`Error during grading: ${error.message}`);
    throw error;
  }
}

module.exports = {
  gradeSubmission
};