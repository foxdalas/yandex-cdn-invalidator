/**
 * Yandex CDN Invalidator GitHub Action
 * Main entry point
 */

const core = require('@actions/core');
const { getAuthToken } = require('./auth');
const YandexCDNClient = require('./cdn-client');

/**
 * Parse and validate paths input
 * @param {string} pathsInput - Comma-separated paths string
 * @returns {string[]} Array of formatted paths
 */
function parsePaths(pathsInput) {
  if (!pathsInput || pathsInput.trim() === '') {
    return [];
  }

  try {
    const paths = pathsInput
      .split(',')
      .map(path => path.trim())
      .filter(path => path.length > 0);

    // Format paths - ensure they start with /
    return paths.map(path => {
      return path.startsWith('/') ? path : `/${path}`;
    });
  } catch (error) {
    throw new Error(
      `Failed to parse paths input: ${error.message}. ` +
        'Ensure it is a valid comma-separated string.'
    );
  }
}

/**
 * Validate resource ID format
 * @param {string} resourceId - CDN Resource ID
 * @throws {Error} If resource ID is invalid
 */
function validateResourceId(resourceId) {
  if (!resourceId || resourceId.trim() === '') {
    throw new Error('resource-id cannot be empty');
  }

  // Basic validation - Yandex resource IDs are typically alphanumeric
  if (!/^[a-zA-Z0-9]+$/.test(resourceId)) {
    core.warning(
      `Resource ID "${resourceId}" contains non-alphanumeric characters. ` +
        'This may be invalid. Typical format: bc8abcdef123'
    );
  }
}

/**
 * Main action execution
 */
async function run() {
  try {
    core.info('=== Yandex CDN Invalidator Started ===');
    core.info('');

    // Get and validate inputs
    const resourceId = core.getInput('resource-id', { required: true });
    const pathsInput = core.getInput('paths');
    const serviceAccountKeyJson = core.getInput('service-account-key');
    const iamToken = core.getInput('iam-token');
    const wait = core.getInput('wait') === 'true';
    const timeoutInput = core.getInput('timeout');
    const endpoint = core.getInput('endpoint');

    // Validate resource ID
    validateResourceId(resourceId);

    // Parse timeout
    const timeout = parseInt(timeoutInput, 10);
    if (isNaN(timeout) || timeout <= 0) {
      throw new Error(
        `Invalid timeout value: "${timeoutInput}". Must be a positive integer.`
      );
    }

    // Parse paths
    const paths = parsePaths(pathsInput);

    // Log configuration (without sensitive data)
    core.info('Configuration:');
    core.info(`  Resource ID: ${resourceId}`);
    core.info(
      `  Paths: ${paths.length > 0 ? JSON.stringify(paths) : 'ALL (full purge)'}`
    );
    core.info(`  Wait for completion: ${wait}`);
    core.info(`  Timeout: ${timeout}s (${(timeout / 60).toFixed(1)} minutes)`);
    core.info(`  Endpoint: ${endpoint}`);
    core.info(
      `  Auth method: ${iamToken ? 'IAM Token' : 'Service Account Key'}`
    );
    core.info('');

    // Authenticate
    core.startGroup('Authentication');
    core.info('Authenticating with Yandex Cloud...');
    const token = await getAuthToken(serviceAccountKeyJson, iamToken);
    core.info('✓ Authentication successful');
    core.endGroup();
    core.info('');

    // Create CDN client
    const client = new YandexCDNClient(token, endpoint);

    // Initiate cache purge
    core.startGroup('Cache Purge');
    core.info('Initiating cache purge...');
    const operation = await client.purgeCache(resourceId, paths);

    const operationId = operation.id;
    core.info(`✓ Cache purge initiated`);
    core.info(`  Operation ID: ${operationId}`);
    core.setOutput('operation-id', operationId);
    core.endGroup();
    core.info('');

    // Wait for completion if requested
    if (wait) {
      core.startGroup('Waiting for Completion');
      const finalOperation = await client.waitForOperation(
        operationId,
        timeout
      );
      core.setOutput('status', 'DONE');
      core.info('✓ Cache purge completed successfully!');

      // Log completion details if available
      if (finalOperation.metadata) {
        core.debug(
          `Operation metadata: ${JSON.stringify(finalOperation.metadata)}`
        );
      }
      core.endGroup();
    } else {
      core.setOutput('status', 'IN_PROGRESS');
      core.info('Cache purge initiated (not waiting for completion)');
      core.info(
        `You can track the operation status using operation ID: ${operationId}`
      );
    }

    core.info('');
    core.info('=== Yandex CDN Invalidator Completed Successfully ===');
  } catch (error) {
    // Log error details
    core.error('');
    core.error('=== Action Failed ===');
    core.error(`Error: ${error.message}`);

    // Log stack trace for debugging
    if (error.stack) {
      core.debug('Stack trace:');
      core.debug(error.stack);
    }

    // Set failed status
    core.setFailed(error.message);
  }
}

// Execute if this is the main module
if (require.main === module) {
  run();
}

module.exports = { run, parsePaths, validateResourceId };
