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
  core.info('Yandex CDN Invalidator!');
  core.setFailed('test');
  return;
  try {
    core.info('=== Yandex CDN Invalidator Started ===');
    core.info('');

    // Get and validate inputs
    let resourceId = core.getInput('resource-id');
    const resourceCname = core.getInput('resource-cname');
    const folderId = core.getInput('folder-id');
    const skipNotFound = core.getInput('skip-not-found') === 'true';
    const pathsInput = core.getInput('paths');
    const serviceAccountKeyJson = core.getInput('service-account-key');
    const iamToken = core.getInput('iam-token');
    const wait = core.getInput('wait') === 'true';
    const timeoutInput = core.getInput('timeout');
    const endpoint = core.getInput('endpoint');

    if (!resourceId && !resourceCname) {
      throw new Error('Either resource-id or resource-cname must be provided');
    }

    if (resourceId && resourceCname) {
      throw new Error(
        'Only one of resource-id or resource-cname must be provided'
      );
    }

    if (resourceId) {
      // Validate resource ID
      validateResourceId(resourceId);
    }

    if (resourceCname && !folderId) {
      throw new Error(
        'folder-id must be provided when resource-cname is provided'
      );
    }

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
    core.info(`  Resource CNAME: ${resourceCname}`);
    core.info(`  Skip not found: ${skipNotFound}`);
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

    if (resourceCname) {
      const resource = await client.getResourceByCname(resourceCname, folderId);

      if (!resource) {
        if (skipNotFound) {
          core.warning('Resource not found, skipping...');
          return;
        }

        throw new Error(`Resource not found: ${resourceCname}`);
      }

      resourceId = resource.id;
    }

    // Initiate cache purge
    await client.purgeCache(resourceId, paths, {
      wait,
      timeoutSeconds: timeout,
    });

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
