const { retryWithBackoff, isRetryableError, sleep } = require('../src/retry');

describe('Retry Module', () => {
  describe('sleep', () => {
    it('should wait for specified milliseconds', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(95);
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable HTTP status codes', () => {
      const retryableCodes = [408, 429, 500, 502, 503, 504];
      retryableCodes.forEach(code => {
        const error = { response: { status: code } };
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it('should not retry non-retryable status codes', () => {
      const nonRetryableCodes = [400, 401, 403, 404];
      nonRetryableCodes.forEach(code => {
        const error = { response: { status: code } };
        expect(isRetryableError(error)).toBe(false);
      });
    });

    it('should identify retryable network errors', () => {
      const networkErrors = [
        'ECONNRESET',
        'ETIMEDOUT',
        'ENOTFOUND',
        'ECONNREFUSED',
      ];
      networkErrors.forEach(code => {
        const error = { code };
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it('should identify throttling errors by message', () => {
      const throttlingMessages = [
        'Throttling detected',
        'TooManyRequests',
        'Rate limit exceeded',
      ];
      throttlingMessages.forEach(message => {
        const error = { message };
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it('should not retry unknown errors', () => {
      const error = new Error('Something went wrong');
      expect(isRetryableError(error)).toBe(false);
    });
  });

  describe('retryWithBackoff', () => {
    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await retryWithBackoff(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockResolvedValue('success');

      const result = await retryWithBackoff(fn, {
        initialDelay: 10,
        maxDelay: 20,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should call onRetry callback', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce({ response: { status: 503 } })
        .mockResolvedValue('success');

      const onRetry = jest.fn();

      await retryWithBackoff(fn, {
        initialDelay: 10,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledWith({
        attempt: 1,
        maxAttempts: 12,
        delay: expect.any(Number),
        error: expect.any(Object),
      });
    });

    it('should throw on non-retryable error', async () => {
      const error = { response: { status: 404 } };
      const fn = jest.fn().mockRejectedValue(error);

      await expect(retryWithBackoff(fn, { initialDelay: 10 })).rejects.toEqual(
        error
      );
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should throw after max attempts', async () => {
      const error = { response: { status: 429 } };
      const fn = jest.fn().mockRejectedValue(error);

      await expect(
        retryWithBackoff(fn, {
          maxAttempts: 3,
          initialDelay: 10,
        })
      ).rejects.toEqual(error);

      expect(fn).toHaveBeenCalledTimes(3);
    });
  });
});
