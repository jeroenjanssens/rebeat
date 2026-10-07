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
    pnpm tsc -p electron/tsconfig.json --noEmit
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
    rm -rf dist node_modules test-results playwright-report release electron/dist

# Run the desktop app against the dev server (Electron)
desktop: install
    pnpm tsc -p electron/tsconfig.json
    pnpm concurrently -k -n vite,electron "pnpm vite" "pnpm wait-on http://localhost:5173 && REBEAT_DEV_URL=http://localhost:5173 pnpm electron ."

# Package the desktop app for this OS into release/ (unsigned unless CSC_* / APPLE_* are set)
desktop-build: build
    pnpm tsc -p electron/tsconfig.json
    pnpm electron-builder --publish never

# Run the desktop app tests (builds the web app and the Electron shell first)
e2e-desktop: build
    pnpm tsc -p electron/tsconfig.json
    pnpm playwright test -c playwright.desktop.config.ts
