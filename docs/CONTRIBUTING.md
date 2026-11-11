# Contributing to SmartLogi SaaS

Thank you for your interest in contributing to SmartLogi SaaS! This document provides guidelines and information about contributing to this project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

### Prerequisites

- Node.js 20.x or later
- pnpm 9.x or later
- Docker and Docker Compose
- PostgreSQL 15+ (or use Docker)

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/smartlogi-saas.git
   cd smartlogi-saas
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Start infrastructure services**
   ```bash
   docker-compose up -d postgres redis kafka minio
   ```

4. **Set up environment variables**
   ```bash
   cp .env.docker .env
   # Edit .env with your local configuration
   ```

5. **Run database migrations**
   ```bash
   pnpm --filter prisma-schemas exec prisma db push
   pnpm --filter prisma-schemas exec prisma db seed
   ```

6. **Start development servers**
   ```bash
   pnpm dev
   ```

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates.

When creating a bug report, include:
- A clear and descriptive title
- Steps to reproduce the issue
- Expected behavior
- Actual behavior
- Environment details (OS, Node.js version, etc.)

### Suggesting Enhancements

Enhancement suggestions are welcome! Please provide:
- A clear description of the proposed enhancement
- Any relevant use cases
- How this enhancement would benefit users

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Pull Request Process

1. **Update documentation** if needed
2. **Add tests** for new features or bug fixes
3. **Ensure all tests pass** before submitting
4. **Follow the coding standards** outlined below
5. **Request review** from at least one maintainer

### PR Title Format

Use conventional commits format:
- `feat: add new feature`
- `fix: bug fix`
- `docs: documentation changes`
- `style: formatting changes`
- `refactor: code refactoring`
- `test: adding tests`
- `chore: maintenance tasks`

## Coding Standards

### TypeScript/JavaScript

- Use TypeScript for all new code
- Follow ESLint and Prettier configurations
- Use meaningful variable and function names
- Add types for all function parameters and return values
- Avoid `any` type when possible

### NestJS Services

- Use dependency injection
- Follow NestJS module structure
- Add proper validation with class-validator
- Use DTOs for request/response objects
- Implement proper error handling

### React/Next.js Apps

- Use functional components with hooks
- Follow Next.js App Router conventions
- Use TypeScript for all components
- Implement proper error boundaries
- Use CSS modules or Tailwind CSS

### Database

- Use Prisma for database access
- Follow naming conventions (snake_case for columns)
- Add proper indexes for performance
- Use migrations for schema changes

## Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests for specific service
pnpm --filter <service-name> test

# Run tests in Docker
docker-compose -f docker-compose.test.yml up --build
```

### Writing Tests

- Write unit tests for business logic
- Write integration tests for API endpoints
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)
- Mock external dependencies

## Documentation

- Update README.md for significant changes
- Add JSDoc comments for public APIs
- Update API documentation (Swagger)
- Include examples for new features

## Questions?

If you have questions, feel free to:
- Open an issue
- Join our Discord community
- Contact the maintainers

Thank you for contributing to SmartLogi SaaS!
