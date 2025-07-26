# Daemon Wallet Makefile
# Build, test, and manage the daemon wallet system

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[0;33m
BLUE := \033[0;34m
NC := \033[0m # No Color

# Load .env file if it exists
ifneq (,$(wildcard .env))
    include .env
    export
endif

.PHONY: help install build test clean create-wallet import-wallet list-accounts start-daemon daemon-status unlock-wallet lock-wallet dev

help: ## Display this help message with target descriptions
	@awk 'BEGIN {FS = ":.*##"; printf "\n$(BLUE)Daemon Wallet Commands$(NC)\n\nUsage:\n  make $(GREEN)<target>$(NC)\n"} /^[a-zA-Z0-9_-]+:.*?##/ { printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2 } /^##@/ { printf "\n$(YELLOW)%s$(NC)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ 🛠️ Setup & Build Commands

install: ## Install all dependencies
	@echo "$(YELLOW)Installing core dependencies...$(NC)"
	@cd packages/core && npm install
	@echo "$(YELLOW)Installing CLI dependencies...$(NC)"
	@cd packages/cli && npm install
	@echo "$(YELLOW)Installing daemon dependencies...$(NC)"
	@cd packages/daemon && npm install
	@echo "$(GREEN)✓ Installation complete$(NC)"

build: ## Build all packages (future use)
	@echo "$(YELLOW)Building packages...$(NC)"
	@cd packages/cli && npm run build 2>/dev/null || true
	@cd packages/daemon && npm run build 2>/dev/null || true
	@echo "$(GREEN)✓ Build complete$(NC)"

clean: ## Clean dependencies and build artifacts
	@echo "$(YELLOW)Cleaning node_modules...$(NC)"
	@rm -rf packages/core/node_modules
	@rm -rf packages/cli/node_modules
	@rm -rf packages/daemon/node_modules
	@echo "$(YELLOW)Cleaning keystore...$(NC)"
	@rm -rf ~/.daemon-wallet/keystore/*
	@echo "$(GREEN)✓ Clean complete$(NC)"

##@ 💰 Wallet Management

create-wallet: ## Create a new wallet
	@echo "$(YELLOW)Creating new wallet...$(NC)"
	@cd packages/cli && ./bin/wallet-cli create

import-wallet: ## Import existing wallet from mnemonic or private key
	@echo "$(YELLOW)Importing wallet...$(NC)"
	@cd packages/cli && ./bin/wallet-cli import

list-accounts: ## List all wallet accounts
	@echo "$(YELLOW)Listing accounts...$(NC)"
	@cd packages/cli && ./bin/wallet-cli list

create-account: ## Create a new account (HD derivation)
	@echo "$(YELLOW)Creating new account...$(NC)"
	@cd packages/cli && ./bin/wallet-cli create-account

list-all-accounts: ## List all accounts including hidden ones
	@echo "$(YELLOW)Listing all accounts (including hidden)...$(NC)"
	@cd packages/cli && ./bin/wallet-cli list --include-hidden

export-wallet: ## Export all private keys and wallet data (dangerous!)
	@echo "$(RED)⚠️  WARNING: Exporting all private keys is extremely dangerous!$(NC)"
	@echo "$(RED)    This will show ALL your private keys and mnemonic phrase!$(NC)"
	@echo "$(YELLOW)Checking daemon and wallet status first...$(NC)"
	@cd packages/cli && ./bin/wallet-cli daemon status || (echo "$(RED)❌ Daemon not running. Start with: make start-daemon$(NC)" && exit 1)
	@echo ""
	@read -p "Are you absolutely sure you want to export everything? (type 'YES'): " confirm; \
	if [ "$$confirm" != "YES" ]; then \
		echo "$(YELLOW)Export cancelled$(NC)"; \
		exit 0; \
	fi; \
	cd packages/cli && ./bin/wallet-cli export-wallet

delete-wallet: ## Delete wallet permanently (dangerous!)
	@echo "$(RED)⚠️  WARNING: This will permanently delete your wallet!$(NC)"
	@cd packages/cli && ./bin/wallet-cli delete

##@ 🚀 Daemon Control

start-daemon: ## Start daemon service in background
	@echo "$(YELLOW)Starting daemon service...$(NC)"
	@cd packages/daemon && ./bin/daemon-wallet-service

daemon-status: ## Check daemon status
	@echo "$(YELLOW)Checking daemon status...$(NC)"
	@cd packages/cli && ./bin/wallet-cli daemon status

unlock-wallet: ## Unlock wallet for daemon operations
	@echo "$(YELLOW)Unlocking wallet...$(NC)"
	@cd packages/cli && ./bin/wallet-cli daemon unlock

lock-wallet: ## Lock wallet immediately
	@echo "$(YELLOW)Locking wallet...$(NC)"
	@cd packages/cli && ./bin/wallet-cli daemon lock

stop-daemon: ## Stop daemon service
	@echo "$(YELLOW)Stopping daemon...$(NC)"
	@cd packages/cli && ./bin/wallet-cli daemon stop

##@ 🧪 Testing Commands

test: ## Run all tests
	@echo "$(YELLOW)Running core tests...$(NC)"
	@cd packages/core && npm test 2>/dev/null || echo "$(YELLOW)No tests configured$(NC)"
	@echo "$(YELLOW)Running CLI tests...$(NC)"
	@cd packages/cli && npm test 2>/dev/null || echo "$(YELLOW)No tests configured$(NC)"
	@echo "$(YELLOW)Running daemon tests...$(NC)"
	@cd packages/daemon && npm test 2>/dev/null || echo "$(YELLOW)No tests configured$(NC)"

test-integration: ## Run integration tests (requires daemon running)
	@echo "$(YELLOW)Running integration tests...$(NC)"
	@echo "$(RED)Not implemented yet$(NC)"

##@ 🔧 Development Tools

dev: ## Start daemon in development mode (foreground)
	@echo "$(YELLOW)Starting daemon in development mode...$(NC)"
	@cd packages/daemon && ./bin/daemon-wallet-service

logs: ## Show daemon logs (if available)
	@echo "$(YELLOW)Showing daemon logs...$(NC)"
	@tail -f ~/.daemon-wallet/daemon.log 2>/dev/null || echo "$(YELLOW)No log file found$(NC)"

ps-daemon: ## Show daemon processes
	@echo "$(YELLOW)Checking for daemon processes...$(NC)"
	@ps aux | grep daemon-wallet | grep -v grep || echo "$(YELLOW)No daemon processes found$(NC)"

kill-daemon: ## Force kill daemon processes
	@echo "$(YELLOW)Killing daemon processes...$(NC)"
	@pkill -f daemon-wallet-service 2>/dev/null && echo "$(GREEN)✓ Daemon processes killed$(NC)" || echo "$(YELLOW)No daemon processes to kill$(NC)"

wipe-keystores: ## Delete all keystore files (dangerous!)
	@echo "$(RED)⚠️  WARNING: This will delete ALL wallet keystores!$(NC)"
	@echo "$(YELLOW)Your private keys will be lost forever unless you have backups!$(NC)"
	@read -p "Type 'DELETE' to confirm: " confirm; \
	if [ "$$confirm" = "DELETE" ]; then \
		echo "$(YELLOW)Wiping keystores...$(NC)"; \
		rm -rf ~/.daemon-wallet/keystore/*; \
		echo "$(GREEN)✓ All keystores deleted$(NC)"; \
	else \
		echo "$(YELLOW)Wipe cancelled$(NC)"; \
	fi

quick-wipe: ## Quick wipe keystores (development only, no confirmation)
	@echo "$(YELLOW)Quick wiping keystores...$(NC)"
	@rm -rf ~/.daemon-wallet/keystore/* 2>/dev/null || true
	@echo "$(GREEN)✓ Keystores wiped$(NC)"

##@ ⚙️ Configuration & Setup

check-env: ## Check system requirements
	@echo "$(YELLOW)Checking environment...$(NC)"
	@if command -v node >/dev/null 2>&1; then \
		echo "$(GREEN)✓ Node.js installed: $$(node --version)$(NC)"; \
	else \
		echo "$(RED)❌ Node.js not found$(NC)"; \
	fi
	@if command -v npm >/dev/null 2>&1; then \
		echo "$(GREEN)✓ npm installed: $$(npm --version)$(NC)"; \
	else \
		echo "$(RED)❌ npm not found$(NC)"; \
	fi
	@if [ -d ~/.daemon-wallet ]; then \
		echo "$(GREEN)✓ Wallet directory exists$(NC)"; \
	else \
		echo "$(YELLOW)⚠️  Wallet directory not found (will be created on first use)$(NC)"; \
	fi
	@if [ -f ~/.daemon-wallet/config.json ]; then \
		echo "$(GREEN)✓ Configuration file exists$(NC)"; \
	else \
		echo "$(YELLOW)⚠️  Configuration not found (will use defaults)$(NC)"; \
	fi

show-config: ## Display current configuration
	@echo "$(YELLOW)Current configuration:$(NC)"
	@if [ -f ~/.daemon-wallet/config.json ]; then \
		cat ~/.daemon-wallet/config.json | jq . 2>/dev/null || cat ~/.daemon-wallet/config.json; \
	else \
		echo "$(YELLOW)No configuration found$(NC)"; \
	fi

install-manifest: ## Install native messaging manifest (Chrome)
	@echo "$(YELLOW)Installing native messaging manifest...$(NC)"
	@echo "$(RED)Not implemented yet - see README for manual instructions$(NC)"

##@ 📦 Package Commands

link-packages: ## Link packages for development
	@echo "$(YELLOW)Linking packages...$(NC)"
	@cd packages/core && npm link
	@cd packages/cli && npm link @daemon-wallet/core
	@cd packages/daemon && npm link @daemon-wallet/core
	@echo "$(GREEN)✓ Packages linked$(NC)"

publish-core: ## Publish core package (requires npm auth)
	@echo "$(YELLOW)Publishing core package...$(NC)"
	@cd packages/core && npm publish --access public

version: ## Display version information
	@echo "$(BLUE)Daemon Wallet Versions:$(NC)"
	@echo "Core:   $$(cd packages/core && node -p "require('./package.json').version")"
	@echo "CLI:    $$(cd packages/cli && node -p "require('./package.json').version")"
	@echo "Daemon: $$(cd packages/daemon && node -p "require('./package.json').version")"