# Release Process

This document describes how to release new versions of `grok-terminal-mcp`.

## Versioning

We follow [Semantic Versioning](https://semver.org/):

- `MAJOR` — Breaking changes
- `MINOR` — New features (backward compatible)
- `PATCH` — Bug fixes and small improvements

## Steps to Release

1. **Update the version**
   ```bash
   npm version patch   # or minor / major
   ```

2. **Update CHANGELOG.md**
   - Add a new section for the version with date
   - Summarize the most important changes

3. **Commit and push**
   ```bash
   git add .
   git commit -m "chore: release vX.Y.Z"
   git push
   ```

4. **Create a Git tag** (if not done via `npm version`)
   ```bash
   git tag vX.Y.Z
   git push --tags
   ```

5. **Publish to npm** (once the package is ready to be published)
   ```bash
   npm publish
   ```

## Pre-release Checklist

- [ ] All tests pass (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] README and documentation are up to date
- [ ] CHANGELOG is updated
- [ ] Version bumped correctly

## Notes

- The `prepare` script ensures the package is always built before publishing.
- Releases are now managed in its own standalone repository (https://github.com/McMarius11/grok-terminal-mcp).
- Once extracted, we will set up automated publishing via GitHub Actions + npm trusted publishing.