# Contributing to Continuous Audio Transcription

Thank you for your interest in contributing to this project! We welcome contributions from the community.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/continuous-audio-transcription.git`
3. Create a feature branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Test your changes: `npm test`
6. Commit your changes: `git commit -m "Add your feature"`
7. Push to your fork: `git push origin feature/your-feature-name`
8. Create a Pull Request

## Development Setup

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run linter
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Format code
npm run format
```

## Code Style

This project uses:
- **TypeScript** for type safety
- **ESLint** for code linting
- **Prettier** for code formatting
- **Jest** for testing

Please ensure your code:
- Passes all linters (`npm run lint`)
- Is properly formatted (`npm run format`)
- Includes appropriate tests
- Maintains or improves test coverage

## Testing

All new features and bug fixes should include tests:

```typescript
describe('YourFeature', () => {
  it('should do something', () => {
    // Arrange
    const input = ...;

    // Act
    const result = yourFunction(input);

    // Assert
    expect(result).toBe(expectedValue);
  });
});
```

## Commit Messages

We follow conventional commit format:

```
type(scope): subject

body (optional)

footer (optional)
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat(cli): add restart command
fix(buffer): resolve memory leak in buffer management
docs(readme): update installation instructions
test(services): add tests for HealthChecker
```

## Pull Request Process

1. **Update documentation** if needed
2. **Add tests** for new features
3. **Run all tests** and ensure they pass
4. **Update README.md** if adding new features or changing behavior
5. **Request review** from maintainers
6. **Address feedback** from reviewers
7. **Squash commits** if requested

## Code of Conduct

### Our Pledge

We pledge to make participation in our project a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity and expression, level of experience, education, socio-economic status, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Our Standards

**Positive behavior includes:**
- Using welcoming and inclusive language
- Being respectful of differing viewpoints
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

**Unacceptable behavior includes:**
- Trolling, insulting/derogatory comments, and personal or political attacks
- Public or private harassment
- Publishing others' private information without permission
- Other conduct which could reasonably be considered inappropriate

## Areas for Contribution

We welcome contributions in these areas:

### Features
- Additional audio input sources
- More transcription engines
- Enhanced speaker diarization
- Real-time transcription display
- Web interface for monitoring

### Improvements
- Performance optimizations
- Better error handling
- Enhanced logging
- Documentation improvements
- Test coverage improvements

### Bugs
- Check [Issues](https://github.com/your-username/continuous-audio-transcription/issues) for known bugs
- Report new bugs with detailed reproduction steps

## Questions?

- Open an [Issue](https://github.com/your-username/continuous-audio-transcription/issues)
- Start a [Discussion](https://github.com/your-username/continuous-audio-transcription/discussions)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
