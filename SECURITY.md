# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

1. **Do NOT** open a public GitHub issue for security vulnerabilities
2. Email details to: **security@aspensplayground.com**
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes (optional)

### What to Expect

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 7 days
- **Resolution Timeline**: Depends on severity
  - Critical: 24-48 hours
  - High: 7 days
  - Medium: 30 days
  - Low: 90 days

### Scope

The following are in scope for security reports:

- **Game Server** (server.js)
  - WebSocket vulnerabilities
  - Authentication/session issues
  - Denial of service vectors
  - Data validation failures

- **Game Client** (game.js, index.html)
  - XSS vulnerabilities
  - Client-side injection
  - Sensitive data exposure

- **Infrastructure**
  - API endpoint security
  - Rate limiting bypasses
  - CORS misconfigurations

### Out of Scope

- Game exploits/cheats (e.g., aimbots, speed hacks) - report these as regular issues
- Social engineering attacks
- Physical security
- Third-party dependencies (report to upstream maintainers)

## Security Measures

### Current Protections

- **Rate Limiting**: API and WebSocket connections are rate-limited
- **Input Validation**: Player names and messages are sanitized
- **Content Security Policy**: Strict CSP headers on all pages
- **HTTPS**: All traffic encrypted via TLS
- **Helmet.js**: Security headers configured
- **CORS**: Restricted to allowed origins

### Automated Scanning

- **Dependabot**: Weekly dependency vulnerability checks
- **CodeQL**: Static analysis on every push
- **npm audit**: Security audit in CI pipeline

## Bug Bounty

We currently do not offer a paid bug bounty program. However, we will:

- Credit reporters in our release notes (with permission)
- Add you to our security hall of fame
- Provide early access to new features

## Security Updates

Security patches are released as soon as possible after verification. Subscribe to releases to get notified:

1. Go to the [repository](https://github.com/silencelen/aspensplayground-core)
2. Click "Watch" > "Custom" > Check "Releases"

## Contact

- Security issues: security@aspensplayground.com
- General inquiries: contact@aspensplayground.com
