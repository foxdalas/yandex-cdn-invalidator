/**
 * Retry utility with exponential backoff
 * @module retry
 */

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable
 * @param {Error} error - Error to check
 * @returns {boolean} True if error is retryable
 */
function isRetryableError(error) {
  // HTTP status codes that warrant a retry
  const retryableStatusCodes = [408, 429, 500, 502, 503, 504];

  if (error.response?.status) {
    return retryableStatusCodes.includes(error.response.status);
  }

  // Network errors
  if (
    error.code === 'ECONNRESET' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ENOTFOUND' ||
    error.code === 'ECONNREFUSED'
  ) {
    return true;
  }

  // Yandex-specific throttling errors
  if (
    error.message?.includes('Throttling') ||
    error.message?.includes('TooManyRequests') ||
    error.message?.includes('Rate limit')
  ) {
    return true;
  }

  return false;
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} [options.maxAttempts=12] - Maximum number of attempts
 * @param {number} [options.initialDelay=10000] - Initial delay in ms (10 seconds)
 * @param {number} [options.maxDelay=120000] - Maximum delay in ms (2 minutes)
 * @param {number} [options.factor=1.5] - Backoff factor
 * @param {Function} [options.onRetry] - Callback on retry
 * @returns {Promise<any>} Result of the function
 * @throws {Error} If all retries are exhausted
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxAttempts = 12,
    initialDelay = 10000,
    maxDelay = 120000,
    factor = 1.5,
    onRetry = null,
  } = options;

  let attempt = 0;
  let delay = initialDelay;

  while (attempt < maxAttempts) {
    try {
      attempt++;
      return await fn();
    } catch (error) {
      const isRetryable = isRetryableError(error);
      const isLastAttempt = attempt >= maxAttempts;

      if (!isRetryable || isLastAttempt) {
        throw error;
      }

      if (onRetry) {
        onRetry({
          attempt,
          maxAttempts,
          delay,
          error,
        });
      }

      await sleep(delay);
      delay = Math.min(delay * factor, maxDelay);
    }
  }

  // This should never be reached, but TypeScript likes it
  throw new Error('Unexpected retry loop exit');
}

module.exports = {
  retryWithBackoff,
  isRetryableError,
  sleep,
};
