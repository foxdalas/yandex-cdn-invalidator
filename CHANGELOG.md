# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-10-20

### Added

- Initial release of Yandex CDN Invalidator
- Support for cache purge via CDN Resource ID
- Dual authentication: IAM Token or Service Account Key
- Automatic retry logic with exponential backoff
- Configurable wait for operation completion
- Path auto-formatting (ensures `/` prefix)
- Full and selective cache purge support
- Comprehensive error handling and logging
- Detailed documentation with examples
- CI/CD workflows for testing and releasing
- Jest-based testing framework

### Features

- Direct resource targeting by ID
- Flexible authentication methods
- Automatic IAM token generation from Service Account Key
- Operation status polling with progress updates
- Custom API endpoint support
- Configurable timeout (default: 15 minutes)
- GitHub Actions integration
- TypeScript-friendly JSDoc annotations

### Documentation

- Comprehensive README with usage examples
- Authentication setup guide
- Troubleshooting section
- Comparison with CloudFront Invalidator
- Migration guide for CloudFront users

[1.0.0]: https://github.com/foxdalas/yandex-cdn-invalidator/releases/tag/v1.0.0
