# Yandex CDN Invalidator

[![GitHub Release](https://img.shields.io/github/v/release/foxdalas/yandex-cdn-invalidator)](https://github.com/foxdalas/yandex-cdn-invalidator/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A GitHub Action that automatically purges Yandex Cloud CDN cache for specified paths. Perfect for CI/CD pipelines to ensure your CDN serves fresh content after deployments.

## Features

- 🎯 **Direct Resource Targeting** - Purge cache by CDN Resource ID
- 🔒 **Flexible Authentication** - Supports both IAM tokens and Service Account keys
- 🔄 **Automatic Retry Logic** - Built-in retry mechanism with exponential backoff
- ⏱️ **Configurable Wait** - Optionally wait for purge completion with custom timeout
- 🛡️ **Path Auto-formatting** - Automatically ensures paths start with `/`
- 📊 **Detailed Logging** - Comprehensive logging for monitoring and debugging
- ⚡ **Full or Selective Purge** - Purge specific paths or entire cache

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Inputs](#inputs)
- [Outputs](#outputs)
- [Usage Examples](#usage-examples)
  - [Basic Example with IAM Token](#basic-example-with-iam-token)
  - [Using Service Account Key](#using-service-account-key)
  - [Selective Path Purge](#selective-path-purge)
  - [Full Cache Purge](#full-cache-purge)
  - [Multiple Environments](#multiple-environments)
- [Authentication Setup](#authentication-setup)
- [Troubleshooting](#troubleshooting)
- [Comparison with CloudFront Invalidator](#comparison-with-cloudfront-invalidator)
- [Contributing](#contributing)
- [License](#license)

## Prerequisites

1. **Yandex Cloud Account** with CDN resources
2. **CDN Resource ID** - Find it in Yandex Cloud Console under CDN → Resources
3. **Authentication** - Choose one of:
   - **IAM Token**: Short-lived token (12 hours max)
   - **Service Account Key**: JSON key file for automatic IAM token generation
4. **Permissions** - Service account must have `cdn.editor` role or higher

## Quick Start

```yaml
name: Deploy and Purge CDN

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Deploy your application
        run: ./deploy.sh

      - name: Purge Yandex CDN Cache
        uses: foxdalas/yandex-cdn-invalidator@v1
        with:
          resource-id: 'bc8abcdef123'
          paths: '/index.html, /assets/*'
          iam-token: ${{ secrets.YC_IAM_TOKEN }}
```

## Inputs

| Input                 | Required | Default                            | Description                                                     |
| --------------------- | -------- | ---------------------------------- | --------------------------------------------------------------- |
| `resource-id`         | **Yes**  | -                                  | Yandex CDN Resource ID (e.g., `bc8abcdef123`)                   |
| `paths`               | No       | `""` (empty = full purge)          | Comma-separated paths to purge (e.g., `/index.html, /assets/*`) |
| `service-account-key` | No       | -                                  | Service Account authorized key as JSON string                   |
| `iam-token`           | No       | -                                  | Pre-generated IAM token (alternative to `service-account-key`)  |
| `wait`                | No       | `true`                             | Wait for the purge operation to complete                        |
| `timeout`             | No       | `900` (15 minutes)                 | Maximum wait time in seconds                                    |
| `endpoint`            | No       | `https://cdn.api.cloud.yandex.net` | Custom API endpoint (for testing or private clouds)             |

**Note**: Either `service-account-key` OR `iam-token` must be provided.

## Outputs

| Output         | Description                                                               |
| -------------- | ------------------------------------------------------------------------- |
| `operation-id` | Yandex Cloud operation ID for tracking                                    |
| `status`       | Final operation status (`DONE`, `ERROR`, or `IN_PROGRESS` if not waiting) |

## Usage Examples

### Basic Example with IAM Token

```yaml
name: Purge CDN Cache

on:
  workflow_dispatch:

jobs:
  purge:
    runs-on: ubuntu-latest
    steps:
      - name: Purge CDN
        uses: foxdalas/yandex-cdn-invalidator@v1
        with:
          resource-id: ${{ vars.CDN_RESOURCE_ID }}
          paths: '/index.html, /css/*, /js/*'
          iam-token: ${{ secrets.YC_IAM_TOKEN }}
```

### Using Service Account Key

More convenient for CI/CD as IAM tokens are generated automatically:

```yaml
jobs:
  purge:
    runs-on: ubuntu-latest
    steps:
      - name: Purge CDN
        uses: foxdalas/yandex-cdn-invalidator@v1
        with:
          resource-id: 'bc8abcdef123'
          paths: '/static/*'
          service-account-key: ${{ secrets.YC_SA_KEY }}
```

### Selective Path Purge

Purge only specific files or patterns:

```yaml
- name: Purge Updated Assets
  uses: foxdalas/yandex-cdn-invalidator@v1
  with:
    resource-id: ${{ vars.CDN_RESOURCE_ID }}
    paths: |
      /index.html,
      /about.html,
      /css/style.css,
      /js/app.js,
      /images/logo.png
    service-account-key: ${{ secrets.YC_SA_KEY }}
    wait: true
    timeout: 600
```

### Full Cache Purge

Purge all cached content (leave `paths` empty):

```yaml
- name: Purge All Cache
  uses: foxdalas/yandex-cdn-invalidator@v1
  with:
    resource-id: 'bc8abcdef123'
    paths: '' # Empty = full purge
    iam-token: ${{ secrets.YC_IAM_TOKEN }}
```

### Multiple Environments

Use matrix strategy to purge multiple environments:

```yaml
name: Multi-Environment Purge

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to purge'
        required: true
        type: choice
        options:
          - staging
          - production

jobs:
  purge:
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.environment }}
    steps:
      - name: Purge CDN
        uses: foxdalas/yandex-cdn-invalidator@v1
        with:
          resource-id: ${{ vars.CDN_RESOURCE_ID }}
          paths: '/*'
          service-account-key: ${{ secrets.YC_SA_KEY }}
```

### Advanced: Don't Wait for Completion

For faster CI/CD pipelines, initiate purge without waiting:

```yaml
- name: Initiate Cache Purge
  uses: foxdalas/yandex-cdn-invalidator@v1
  with:
    resource-id: 'bc8abcdef123'
    paths: '/api/*'
    iam-token: ${{ secrets.YC_IAM_TOKEN }}
    wait: false # Don't wait, continue immediately
```

## Authentication Setup

### Option 1: Using IAM Token (Simple, Short-lived)

1. **Install Yandex Cloud CLI**:

   ```bash
   curl https://storage.yandexcloud.net/yandexcloud-yc/install.sh | bash
   ```

2. **Authenticate**:

   ```bash
   yc init
   ```

3. **Get IAM Token**:

   ```bash
   yc iam create-token
   ```

4. **Add to GitHub Secrets**:
   - Go to repository → Settings → Secrets and variables → Actions
   - Create secret `YC_IAM_TOKEN` with the token value

**Note**: IAM tokens expire after 12 hours. Best for testing.

### Option 2: Using Service Account Key (Recommended for CI/CD)

1. **Create Service Account**:

   ```bash
   yc iam service-account create --name cdn-purge-sa \
     --description "Service account for CDN cache purge"
   ```

2. **Assign Role**:

   ```bash
   yc resourcemanager folder add-access-binding <folder-id> \
     --role cdn.editor \
     --subject serviceAccount:<service-account-id>
   ```

3. **Create Authorized Key**:

   ```bash
   yc iam key create \
     --service-account-name cdn-purge-sa \
     --output key.json
   ```

4. **Add to GitHub Secrets**:
   - Copy entire contents of `key.json`
   - Create secret `YC_SA_KEY` with the JSON content
   - **Important**: Store as raw JSON, not base64 encoded

### Finding Your CDN Resource ID

1. Go to [Yandex Cloud Console](https://console.cloud.yandex.com/)
2. Navigate to **CDN** → **Resources**
3. Click on your CDN resource
4. Copy the **Resource ID** from the URL or resource details

Example Resource ID format: `bc8abcdef123456`

## Troubleshooting

### Error: "CDN Resource not found"

**Solution**:

- Verify the `resource-id` is correct
- Check resource exists in Yandex Cloud Console
- Ensure you're using the Resource ID, not the CNAME

### Error: "Permission denied"

**Solution**:

- Verify service account has `cdn.editor` role
- Check IAM token hasn't expired
- Ensure service account has access to the specific CDN resource

### Error: "Authentication failed"

**Solution**:

- For IAM token: Regenerate a fresh token (they expire after 12 hours)
- For Service Account Key: Verify JSON format is correct
- Check secret is properly set in GitHub repository settings

### Error: "Operation timeout"

**Solution**:

- Increase `timeout` value (default is 900s = 15 minutes)
- Alternatively, set `wait: false` to not wait for completion
- Cache purge may take up to 15 minutes for large resources

### Purge Not Taking Effect

**Solution**:

- Wait 5-15 minutes for purge to propagate globally
- Verify correct paths were specified (check action logs)
- Test with cache-busting query params (e.g., `?v=123`)
- Check CDN resource origin is serving updated content

### Debug Mode

Enable debug logging for detailed information:

```yaml
steps:
  - name: Enable Debug Logging
    run: echo "ACTIONS_STEP_DEBUG=true" >> $GITHUB_ENV

  - name: Purge CDN
    uses: foxdalas/yandex-cdn-invalidator@v1
    # ... your config
```

## Comparison with CloudFront Invalidator

| Feature                | CloudFront Invalidator | Yandex CDN Invalidator            |
| ---------------------- | ---------------------- | --------------------------------- |
| **Resource Discovery** | Tag-based (automatic)  | Direct Resource ID (explicit)     |
| **Authentication**     | AWS Credentials/OIDC   | IAM Token / SA Key                |
| **API Style**          | AWS SDK v3             | REST API                          |
| **Wait Mechanism**     | `waitUntilCompleted`   | Operation polling                 |
| **Retry Logic**        | Built-in SDK           | Custom implementation             |
| **Multiple Resources** | Automatic (via tags)   | Manual (matrix or multiple steps) |
| **Time to Complete**   | 10-15 minutes          | Up to 15 minutes                  |

### Migration from CloudFront

```yaml
# Before (CloudFront)
- uses: foxdalas/cloudfront-invalidator@v4
  with:
    tag_key: 'Environment'
    tag_value: 'Production'
    paths: '/index.html, /assets/*'

# After (Yandex CDN)
- uses: foxdalas/yandex-cdn-invalidator@v1
  with:
    resource-id: 'bc8abcdef123' # Replace tag-based discovery
    paths: '/index.html, /assets/*'
    service-account-key: ${{ secrets.YC_SA_KEY }}
```

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `npm test`
5. Format code: `npm run format`
6. Commit: `git commit -m "Add my feature"`
7. Push: `git push origin feature/my-feature`
8. Open a Pull Request

### Development

```bash
# Install dependencies
npm install

# Run linter
npm run lint

# Format code
npm run format

# Build distribution
npm run build
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Made with ❤️ for the Yandex Cloud community**

**Questions or Issues?** Open an issue on [GitHub](https://github.com/foxdalas/yandex-cdn-invalidator/issues)
