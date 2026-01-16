/**
 * Yandex CDN Client for cache purge operations
 * @module cdn-client
 */

const axios = require('axios');
const core = require('@actions/core');
const { retryWithBackoff } = require('./retry');

/**
 * Yandex CDN Client
 */
class YandexCDNClient {
  /**
   * Create a new Yandex CDN Client
   * @param {string} iamToken - Yandex Cloud IAM token
   * @param {string} [endpoint='https://cdn.api.cloud.yandex.net'] - API endpoint
   */
  constructor(iamToken, endpoint = 'https://cdn.api.cloud.yandex.net') {
    if (!iamToken || typeof iamToken !== 'string') {
      throw new Error('IAM token is required and must be a string');
    }

    this.iamToken = iamToken;
    this.endpoint = endpoint;
    this.cdnClient = axios.create({
      baseURL: endpoint,
      headers: {
        Authorization: `Bearer ${iamToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Separate client for Operations API
    this.operationClient = axios.create({
      baseURL: 'https://operation.api.cloud.yandex.net',
      headers: {
        Authorization: `Bearer ${iamToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  /**
   * Find CDN resource by its CNAME using the List API with pagination
   * @param {string} resourceCname - CNAME of the resource to search for
   * @param {string} folderId - Yandex Cloud Folder ID to list resources in
   * @returns {Promise<Object|null>} Matching resource object or null if not found
   * @throws {Error} If the list request fails
   */
  async getResourceByCname(resourceCname, folderId) {
    if (!resourceCname || typeof resourceCname !== 'string') {
      throw new Error('resourceCname is required and must be a string');
    }
    if (!folderId || typeof folderId !== 'string') {
      throw new Error('folderId is required and must be a string');
    }

    const url = '/cdn/v1/resources';
    const pageSize = 1000;
    let pageToken = undefined;

    while (true) {
      try {
        const response = await this.cdnClient.get(url, {
          params: {
            folderId,
            pageSize,
            pageToken,
          },
        });

        const resources = response.data?.resources || [];
        for (const resource of resources) {
          if (resource?.cname === resourceCname) {
            return resource;
          }
        }

        const nextPageToken = response.data?.nextPageToken;
        if (
          !nextPageToken ||
          typeof nextPageToken !== 'string' ||
          nextPageToken.length === 0
        ) {
          return null;
        }
        pageToken = nextPageToken;
      } catch (error) {
        if (error.response) {
          const status = error.response.status;
          const message =
            error.response.data?.message ||
            error.response.statusText ||
            'Unknown error';
          throw new Error(
            `Failed to list CDN resources: ${status} - ${message}. Folder: ${folderId}`
          );
        }
        throw new Error(`Failed to list CDN resources: ${error.message}`);
      }
    }
  }

  /**
   * Purge CDN cache for specific paths or all cache
   * @param {string} resourceId - CDN Resource ID
   * @param {string[]} [paths=[]] - Array of paths to purge (empty = full purge)
   * @returns {Promise<Object>} Operation object with id
   * @throws {Error} If purge request fails
   */
  async purgeCache(resourceId, paths = []) {
    if (!resourceId || typeof resourceId !== 'string') {
      throw new Error('Resource ID is required and must be a string');
    }

    const url = `/cdn/v1/cache/${resourceId}:purge`;

    // Build request body
    // If paths array is empty, send empty object for full purge
    const requestBody = paths.length > 0 ? { paths } : {};

    core.info(`Purging CDN cache for resource: ${resourceId}`);
    if (paths.length > 0) {
      core.info(`Paths to purge (${paths.length}): ${JSON.stringify(paths)}`);
    } else {
      core.info('Purging ALL cache (full purge - no specific paths)');
    }

    try {
      const response = await retryWithBackoff(
        async () => {
          return await this.cdnClient.post(url, requestBody);
        },
        {
          maxAttempts: 12,
          initialDelay: 10000,
          maxDelay: 120000,
          factor: 1.5,
          onRetry: ({ attempt, maxAttempts, delay, error }) => {
            const statusCode = error.response?.status || 'N/A';
            const errorMsg =
              error.response?.data?.message || error.message || 'Unknown error';
            core.warning(
              `Retry attempt ${attempt}/${maxAttempts} after ${delay / 1000}s. ` +
                `Error: ${errorMsg} (HTTP ${statusCode})`
            );
          },
        }
      );

      if (!response.data || !response.data.id) {
        throw new Error(
          'Invalid response from CDN purge API: missing operation ID'
        );
      }

      core.info(`Cache purge initiated. Operation ID: ${response.data.id}`);
      return response.data;
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const message =
          error.response.data?.message || error.response.statusText;

        if (status === 404) {
          throw new Error(
            `CDN Resource not found: ${resourceId}. ` +
              'Please verify the resource ID is correct.'
          );
        } else if (status === 403) {
          throw new Error(
            `Permission denied for resource: ${resourceId}. ` +
              'Ensure the service account has "cdn.editor" role or higher.'
          );
        } else if (status === 401) {
          throw new Error(
            'Authentication failed. IAM token may be expired or invalid.'
          );
        } else {
          throw new Error(
            `CDN purge failed: ${status} - ${message}. Resource: ${resourceId}`
          );
        }
      }
      throw error;
    }
  }

  /**
   * Get operation status
   * @param {string} operationId - Operation ID
   * @returns {Promise<Object>} Operation status object
   * @throws {Error} If status check fails
   */
  async getOperationStatus(operationId) {
    if (!operationId || typeof operationId !== 'string') {
      throw new Error('Operation ID is required and must be a string');
    }

    const url = `/operations/${operationId}`;

    try {
      const response = await this.operationClient.get(url);

      if (!response.data) {
        throw new Error('Invalid response from Operations API');
      }

      return response.data;
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const message =
          error.response.data?.message || error.response.statusText;

        if (status === 404) {
          throw new Error(`Operation not found: ${operationId}`);
        } else if (status === 401) {
          throw new Error(
            'Authentication failed when checking operation status'
          );
        } else {
          throw new Error(
            `Failed to get operation status: ${status} - ${message}`
          );
        }
      }
      throw new Error(`Failed to get operation status: ${error.message}`);
    }
  }

  /**
   * Wait for operation to complete
   * @param {string} operationId - Operation ID
   * @param {number} [timeoutSeconds=900] - Maximum wait time in seconds (default: 15 minutes)
   * @returns {Promise<Object>} Final operation object
   * @throws {Error} If operation fails or times out
   */
  async waitForOperation(operationId, timeoutSeconds = 900) {
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;
    const pollInterval = 5000; // 5 seconds between checks

    core.info(`Waiting for operation ${operationId} to complete...`);
    core.info(
      `Timeout: ${timeoutSeconds} seconds (${timeoutSeconds / 60} minutes)`
    );

    let lastProgress = null;

    while (true) {
      const elapsed = Date.now() - startTime;

      if (elapsed >= timeoutMs) {
        throw new Error(
          `Operation timeout after ${timeoutSeconds} seconds. ` +
            `Operation ID: ${operationId}. ` +
            'Cache purge may still complete in the background.'
        );
      }

      const operation = await this.getOperationStatus(operationId);

      // Check if operation is done
      if (operation.done === true) {
        if (operation.error) {
          const errorCode = operation.error.code || 'UNKNOWN';
          const errorMessage = operation.error.message || 'No error message';
          throw new Error(
            `Operation failed: ${errorMessage} (code: ${errorCode}). ` +
              `Operation ID: ${operationId}`
          );
        }

        core.info('Operation completed successfully!');
        return operation;
      }

      // Log progress
      const progress = operation.metadata?.progress;
      const elapsedSeconds = Math.floor(elapsed / 1000);

      if (progress && progress !== lastProgress) {
        core.info(
          `Operation in progress: ${progress}% (${elapsedSeconds}s elapsed)`
        );
        lastProgress = progress;
      } else {
        core.info(`Operation in progress... (${elapsedSeconds}s elapsed)`);
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }
}

module.exports = YandexCDNClient;
