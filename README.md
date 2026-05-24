# oddX Bets

oddX Bets is a World Cup prediction and GameFi arena built for X Layer testnet. It combines crash-style betting games, prediction markets, wallet-based identity, and on-chain participation in one mobile-friendly experience.

## Features

- Wallet-first onboarding with OKX Wallet and any injected EVM wallet fallback
- X Layer testnet support
- OKB participation flow for games and predictions
- USDC and USDT token options through ERC-20 approval flows
- KickCrash crash game
- Cup Chase crash game
- World Cup prediction markets
- My Predictions history
- Profile tab with saved wallet-linked username
- Faucet link for testnet funding
- Mobile-first responsive layout with desktop preserved

## Stack

- Vite
- React
- TypeScript
- Tailwind CSS
- Framer Motion
- viem
- Solidity
- Hardhat

## How it works

### Hero

The landing page opens with a World Cup-themed hero and wallet connection flow. After connecting, the user can choose a username. The username is stored against the connected wallet and restored on reconnect.

### Games

The games section contains two crash-style experiences:

- **KickCrash** - a football kick-and-crash multiplier game
- **Cup Chase** - a runner chasing the World Cup trophy with the same crash engine

Both games run in an autoplay demo loop for presentation, but participation actions can still trigger on-chain ticket creation when the user chooses to join a round.

### Predictions

The prediction section contains World Cup-only markets such as:

- Match Winner
- Exact Score
- Top Scorer
- Group Futures

Selecting an outcome opens a prediction modal where the user can choose a token, enter a stake, and place the prediction on-chain.

### Profiles

Wallets are tied to usernames in local storage so the same wallet reconnects to the same profile. The Profile tab shows the saved name, wallet address, ticket history, and prediction activity.

## Contract

The app is wired to the `OddXBetsArena` contract on X Layer testnet.

### Contract address

```txt
0x136bDB3f65a189CE81eFCAeb41F60111f27B06bD
```

### Supported actions

- `joinRound(paymentToken, gameId, amount)`
- `placePrediction(paymentToken, marketId, outcomeId, amount)`
- `cashOut(ticketId)`
- `finaliseTicket(ticketId, won, payout)` for owner-side settlement

### Payment model

- `address(0)` is used for native OKB payments
- ERC-20 tokens are supported when whitelisted by the contract owner
- The frontend uses approve -> contract call for token payments

### Token addresses used in the demo

```txt
Mock USDC: 0xB0BD99c306E1a4f7f0322A97CFb1fDC72Be5EE1B
Mock USDT: 0xc70460E379569efDA2137604Fa76d4BB8d8e1C4a
```

## Local setup

Install dependencies and run the frontend:

```bash
npm install
npm run dev
```

The app runs on:

```txt
http://localhost:3002
```

## Environment

The frontend reads the root `.env`.

Important variables:

```env
VITE_ODDX_BETS_CONTRACT=0x136bDB3f65a189CE81eFCAeb41F60111f27B06bD
VITE_XLAYER_TESTNET_USDC=0xB0BD99c306E1a4f7f0322A97CFb1fDC72Be5EE1B
VITE_XLAYER_TESTNET_USDT=0xc70460E379569efDA2137604Fa76d4BB8d8e1C4a
```

## Contract workspace

The Solidity project lives in `contracts/`.

```bash
cd contracts
npm install
npm run deploy:testnet
```

The contract workspace contains:

- `contracts/contracts/OddXBetsArena.sol`
- `contracts/contracts/MockERC20.sol`
- `contracts/scripts/deploy.js`
- `contracts/scripts/deploy-testnet.js`
- `contracts/hardhat.config.js`

## Build

```bash
npm run build
```

## Deployment

The project is deployed on Vercel under the lowercase production name:

```txt
https://okx-theta.vercel.app
```

## Notes

- The demo is built for X Layer testnet, not mainnet.
- OKB is the native participation asset.
- The app preserves desktop layout and only adds mobile-specific responsiveness where needed.
- README scope is the root app. The contract workspace has its own README under `contracts/`.

