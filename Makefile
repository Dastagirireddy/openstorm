.PHONY: dev build preview tauri dev-full build-full clean install

# Development
dev-web: ## Run Vite dev server
	pnpm dev

dev: ## Run Tauri app in development mode
	pnpm tauri dev

# Build
build: ## Build web assets
	pnpm build

build-full: ## Build Tauri app for production
	pnpm tauri build

# Preview
preview: ## Preview production build
	pnpm preview

# Tauri
tauri: ## Run Tauri CLI commands (pass CMD=command)
	pnpm tauri $(CMD)

# Dependencies
install: ## Install dependencies
	pnpm install

# Clean
clean: ## Remove build artifacts
	rm -rf dist
	rm -rf target

# Help
help: ## Display this help message
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'
