# List available recipes
default:
    @just --list

# Install dependencies
install:
    pnpm install

# Start the dev server and open the browser (http://localhost:5173)
dev: install
    pnpm vite --open

# Type-check, lint, and run unit tests
check:
    pnpm tsc --noEmit
    pnpm eslint .
    pnpm vitest run

# Run unit tests in watch mode
test:
    pnpm vitest

# Run the end-to-end tests (Playwright, Chromium)
e2e *args:
    pnpm playwright test {{args}}

# Build the production version into dist/
build: install
    pnpm tsc --noEmit
    pnpm vite build

# Serve the production build locally
preview: build
    pnpm vite preview --open

# Format all files
fmt:
    pnpm prettier --write .

# Remove build output and dependencies
clean:
    rm -rf dist node_modules test-results playwright-report
