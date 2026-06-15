.PHONY: dev build preview tauri dev-full build-full clean install release

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

# Release
release: ## Release a new version (interactive prompt for version)
	@read -p "Enter version (major.minor.patch): " version; \
	if ! echo "$$version" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$$'; then \
		echo "Error: Version must be in format major.minor.patch (e.g., 1.2.3)"; \
		exit 1; \
	fi; \
	echo "Releasing version $$version..."; \
	sed -i '' "s/^version = \".*\"/version = \"$$version\"/" src-tauri/Cargo.toml; \
	sed -i '' "s/\"version\": \".*\"/\"version\": \"$$version\"/" package.json; \
	sed -i '' "s/\"version\": \".*\"/\"version\": \"$$version\"/" src-tauri/tauri.conf.json; \
	git add src-tauri/Cargo.toml package.json src-tauri/tauri.conf.json; \
	git commit -m "release: v$$version"; \
	git tag "v$$version"; \
	git push origin main --tags; \
	echo "Released v$$version successfully!"

# Help
help: ## Display this help message
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'
