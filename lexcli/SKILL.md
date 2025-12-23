---
name: lexcli
description: Lexoffice CLI for bookkeeping automation - find unassigned transactions, view bookings by account, get smart account suggestions based on patterns. Use when user asks about Lexoffice bookings, open transactions, or account assignments.
compatibility: Requires node.js (v18+) and npm
metadata:
  author: kaiserlich
  version: "1.0"
---

# Lexoffice CLI

Manage Lexoffice bookkeeping - find open transactions, analyze bookings, get account suggestions.

## Setup

```bash
cd {baseDir}
npm install
```

## Configure Account

First check if already configured:
```bash
node {baseDir}/scripts/cli.js accounts list
```

If no account, add one:
```bash
node {baseDir}/scripts/cli.js accounts add
# Prompts for API key
```

To get an API key from Lexoffice:
1. Go to Lexoffice → Einstellungen → Öffentliche API
2. Generate a new API key (requires XL plan)

## Usage

```bash
# Account management
node {baseDir}/scripts/cli.js accounts list
node {baseDir}/scripts/cli.js accounts add
node {baseDir}/scripts/cli.js accounts remove

# List available posting categories (Buchungskonten)
node {baseDir}/scripts/cli.js categories

# List all vouchers/transactions
node {baseDir}/scripts/cli.js vouchers --limit 20

# Find open/unassigned transactions
node {baseDir}/scripts/cli.js open

# Show bookings grouped by account
node {baseDir}/scripts/cli.js bookings
node {baseDir}/scripts/cli.js bookings --account 4806   # Filter by account

# Get smart account suggestions for open transactions
node {baseDir}/scripts/cli.js suggest

# Show transaction details
node {baseDir}/scripts/cli.js voucher <id>

# Assign account to transaction
node {baseDir}/scripts/cli.js assign <voucher-id> <category-id>

# Search transactions
node {baseDir}/scripts/cli.js search "IT made simple"
node {baseDir}/scripts/cli.js search --from 2024-01-01 --to 2024-12-31

# Export bookings report
node {baseDir}/scripts/cli.js export --year 2024 --format csv
```

## Options

**Filtering:**
- `--limit <n>` - Number of results (default: 50)
- `--from <date>` - Start date (YYYY-MM-DD)
- `--to <date>` - End date (YYYY-MM-DD)
- `--account <id>` - Filter by posting category
- `--status <s>` - Filter: open, paid, overdue

**Output:**
- `--json` - Raw JSON output
- `--verbose` - Detailed output

## Account Suggestion Logic

The `suggest` command analyzes:
1. **Counterparty patterns** - "Techniker Krankenkasse" → 4130 (Sozialversicherung)
2. **Historical bookings** - How was this counterparty booked before?
3. **Amount patterns** - Monthly recurring amounts → likely subscriptions
4. **Keywords** - "Software", "Lizenz" → 4964 (Lizenzen)

## Data Storage

- `~/.lexcli/config.json` - API credentials
- `~/.lexcli/patterns.json` - Learned booking patterns

## When to Use

- User asks about unbooked/open transactions in Lexoffice
- User wants to see bookings by account (Kontenzuordnung)
- User needs help categorizing transactions
- Debugging booking discrepancies
- Generating booking reports

## API Rate Limits

Lexoffice API: **2 requests per second** - the CLI handles throttling automatically.
