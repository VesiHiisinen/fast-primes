# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please:

1. **DO NOT** open a public issue
2. Send a private report to the repository owner via GitHub
3. Allow time for the vulnerability to be addressed before public disclosure

## Security Best Practices

When using this package:

- Do not use this package for cryptographic purposes without proper validation
- Be aware that prime search is CPU-intensive and can be used for denial of service
- Always validate input ranges to prevent resource exhaustion
- Consider rate limiting when exposing prime search functionality via APIs

## Known Limitations

- This package performs CPU-intensive operations that could impact system performance
- Input ranges should be validated to prevent excessive resource consumption
- Memory usage scales with the size of prime number arrays