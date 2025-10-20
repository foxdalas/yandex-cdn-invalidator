/**
 * Authentication module for Yandex Cloud
 * @module auth
 */

const jwt = require('jsonwebtoken');
const axios = require('axios');

/**
 * Exchange JWT for IAM token
 * @param {string} jwtToken - Signed JWT token
 * @returns {Promise<string>} IAM token
 * @throws {Error} If token exchange fails
 */
async function exchangeJwtForIamToken(jwtToken) {
  try {
    const response = await axios.post(
      'https://iam.api.cloud.yandex.net/iam/v1/tokens',
      { jwt: jwtToken },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      }
    );

    if (!response.data || !response.data.iamToken) {
      throw new Error('Invalid response from IAM token endpoint');
    }

    return response.data.iamToken;
  } catch (error) {
    if (error.response) {
      throw new Error(
        `Failed to exchange JWT for IAM token: ${error.response.status} - ${
          error.response.data?.message || error.message
        }`
      );
    }
    throw new Error(`Failed to exchange JWT for IAM token: ${error.message}`);
  }
}

/**
 * Create JWT from Service Account Key
 * @param {Object} serviceAccountKey - Service Account authorized key
 * @param {string} serviceAccountKey.id - Key ID
 * @param {string} serviceAccountKey.service_account_id - Service Account ID
 * @param {string} serviceAccountKey.private_key - Private key in PEM format
 * @returns {string} Signed JWT token
 * @throws {Error} If JWT creation fails
 */
function createJwt(serviceAccountKey) {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    aud: 'https://iam.api.cloud.yandex.net/iam/v1/tokens',
    iss: serviceAccountKey.service_account_id,
    iat: now,
    exp: now + 3600, // 1 hour
  };

  try {
    const token = jwt.sign(payload, serviceAccountKey.private_key, {
      algorithm: 'PS256',
      keyid: serviceAccountKey.id,
    });

    return token;
  } catch (error) {
    throw new Error(`Failed to create JWT: ${error.message}`);
  }
}

/**
 * Get IAM token from Service Account Key
 * @param {Object} serviceAccountKey - Service Account authorized key
 * @returns {Promise<string>} IAM token
 * @throws {Error} If authentication fails
 */
async function getIAMToken(serviceAccountKey) {
  // Validate service account key structure
  if (!serviceAccountKey.id) {
    throw new Error('Service account key missing "id" field');
  }
  if (!serviceAccountKey.service_account_id) {
    throw new Error('Service account key missing "service_account_id" field');
  }
  if (!serviceAccountKey.private_key) {
    throw new Error('Service account key missing "private_key" field');
  }

  // Validate private key format
  if (!serviceAccountKey.private_key.includes('BEGIN PRIVATE KEY')) {
    throw new Error(
      'Invalid private key format. Expected PEM format with "BEGIN PRIVATE KEY"'
    );
  }

  const jwtToken = createJwt(serviceAccountKey);
  return await exchangeJwtForIamToken(jwtToken);
}

/**
 * Get authentication token from either service account key or IAM token
 * @param {string|null} serviceAccountKeyJson - Service account key as JSON string
 * @param {string|null} iamToken - Pre-generated IAM token
 * @returns {Promise<string>} IAM token
 * @throws {Error} If authentication fails or no credentials provided
 */
async function getAuthToken(serviceAccountKeyJson, iamToken) {
  // If IAM token is provided directly, use it
  if (iamToken) {
    if (typeof iamToken !== 'string' || iamToken.trim() === '') {
      throw new Error('IAM token must be a non-empty string');
    }
    return iamToken.trim();
  }

  // Otherwise, we need service account key
  if (!serviceAccountKeyJson) {
    throw new Error(
      'Either service-account-key or iam-token must be provided. ' +
        'See action documentation for authentication setup.'
    );
  }

  // Parse and validate service account key
  let serviceAccountKey;
  try {
    serviceAccountKey = JSON.parse(serviceAccountKeyJson);
  } catch (error) {
    throw new Error(
      `Invalid service account key JSON format: ${error.message}. ` +
        'Ensure the key is properly formatted JSON.'
    );
  }

  if (typeof serviceAccountKey !== 'object' || serviceAccountKey === null) {
    throw new Error('Service account key must be a JSON object');
  }

  return await getIAMToken(serviceAccountKey);
}

module.exports = {
  getAuthToken,
  getIAMToken,
  createJwt,
  exchangeJwtForIamToken,
};
