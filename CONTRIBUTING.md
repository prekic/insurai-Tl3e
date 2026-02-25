# Contributing to insurai

First off, thank you for considering contributing to insurai! It's people like you that make this tool such a great platform for the Turkish insurance market.

## Commit Message Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/) to automatically generate our `CHANGELOG.md`, bump versions in `package.json`, and create GitHub Releases via the `release-please` action in our CI/CD pipeline. 

### Format

Each commit message consists of a **type**, an optional **scope**, and a **subject**:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

The most important prefix types to know are:

- **`feat:`** A new feature (correlates with a `MINOR` release).
- **`fix:`** A bug fix (correlates with a `PATCH` release).
- **`chore:`** Routine tasks, dependency updates, or changes that do not affect the source code (e.g., updating `.gitignore`).
- **`docs:`** Documentation only changes.
- **`style:`** Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc).
- **`refactor:`** A code change that neither fixes a bug nor adds a feature.
- **`perf:`** A code change that improves performance.
- **`test:`** Adding missing tests or correcting existing tests.
- **`build:`** Changes that affect the build system or external dependencies (example scopes: vite, npm).
- **`ci:`** Changes to our CI configuration files and scripts (example scopes: github actions).

### Breaking Changes

If your commit introduces a breaking change, append a `!` after the type/scope, or include `BREAKING CHANGE:` in the footer. This correlates with a `MAJOR` release version bump.

**Example:**
```
feat(auth)!: completely overhaul the authentication flow

BREAKING CHANGE: The `login()` method now requires an object parameter instead of two strings.
```

## Pull Requests

1. **Title:** Ensure your PR title also follows the Conventional Commits format (e.g., `feat(ui): add visual diff viewer`). When your PR is squashed and merged into `main`, this title will become the official commit message that the `release-please` bot reads.
2. **Review:** Make sure all tests (`npm run test`), linting (`npm run lint`), and E2E checks (`npm run test:e2e`) pass locally before opening your PR.

## Development Workflow

Refer to our **[Local Setup Guide](docs/development/local-setup.md)** for a zero-to-hero walkthrough of standing up the insurai frontend, backend Express wrapper, and Supabase local edge network.
