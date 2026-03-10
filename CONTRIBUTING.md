# Contributing to fast-prime-search

First off, thank you for considering contributing to fast-prime-search! It's people like you that make this project a great tool.

## Code of Conduct

This project and everyone participating in it is governed by our commitment to:
- Being respectful and inclusive
- Welcoming newcomers
- Focusing on constructive feedback
- Maintaining professional discourse

## How Can I Contribute?

### Reporting Bugs

Before creating a bug report, please check if the issue has already been reported.

When submitting a bug report, please include:
- Node.js version (`node --version`)
- Package version
- Operating system
- Steps to reproduce
- Expected behavior vs actual behavior
- Any error messages

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. Please:
- Use a clear and descriptive title
- Provide a detailed description of the proposed enhancement
- Explain why this enhancement would be useful
- Provide code examples if applicable

### Pull Requests

1. Fork the repository
2. Create a new branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run the test suite (`npm test`)
5. Ensure your code follows the style guidelines (`npm run lint`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/your-username/fast-prime-search.git
cd fast-prime-search

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run linter
npm run lint

# Format code
npm run format
```

## Style Guidelines

- Use TypeScript strict mode
- Follow existing code style
- Write meaningful commit messages
- Add tests for new features
- Update documentation for API changes

## Performance Guidelines

Since this is a performance-focused library:
- Benchmark any performance-critical changes
- Consider the impact on single-threaded vs multi-threaded performance
- Document any algorithm changes with their Big O complexity

## Questions?

Feel free to open an issue for any questions about contributing!