# OddX Bets Contracts

Minimal X Layer contract scaffold for the oddX Bets demo.

## What it supports

- `joinRound(...)` for crash-game participation
- `placePrediction(...)` for prediction-market entries
- `cashOut(...)` for player claims after owner finalisation
- native OKB deposits via `receive()`
- ERC-20 support for whitelisted tokens like USDC / USDT

## Setup

```bash
cd contracts
npm install
cp .env.example .env
```

Set:

- `DEPLOYER_PRIVATE_KEY`
- `SUPPORTED_TOKENS` as a comma-separated list of ERC-20 token addresses

## Deploy

```bash
npm run deploy:testnet
```

The deploy script prints the contract address and X Layer explorer link.
