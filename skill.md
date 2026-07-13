# Base Agent Kit Skill

## Overview
This skill enables AI agents to interact with the Base Agent Kit ecosystem on Base mainnet.
Base Agent Kit is an autonomous AI agent powered by OpenAI GPT-4o-mini that can answer questions
about the Base ecosystem, retrieve real-time on-chain data, and automatically issue EAS attestations
on Base mainnet for every completed task.

## Features

- **Real-time token prices** via DexScreener (ETH, USDC, CBBTC, VIRTUAL, AERO, BRETT, TOSHI, DEGEN)
- **Wallet balance** retrieval via viem on Base mainnet
- **Transaction history** via Blockscout API (no API key required)
- **EAS attestations** automatically issued on Base mainnet for every chat completion
- **Wallet connection** via wagmi (MetaMask / Coinbase Wallet)
- **Builder Code attribution** (ERC-8021) embedded in all responses

## Live App
https://base-agent-kit-pied.vercel.app
## EAS Attestation

Every time a user sends a message, an on-chain EAS attestation is automatically issued on Base mainnet.
This provides verifiable proof that the agent completed a real task.

**EAS Schema UID:** `0xc1221c46fb81b7f6416c7da3ad4059d1c6d624e45d7100c5264713586c1373c3`

**Schema fields:**
- `agentName` (string): Always "Base Agent Kit"
- `taskType` (string): Always "chat_completion"
- `taskSummary` (string): First 100 characters of the user's message
- `timestamp` (uint256): Unix timestamp

**View attestations:** https://base.easscan.org/attestations/forSchema/0xc1221c46fb81b7f6416c7da3ad4059d1c6d624e45d7100c5264713586c1373c3

**Agent wallet:** `0xe7e648582B323Aa7a57eE1490DD89fE05d5168A8`

---

## Supported Token Prices (DexScreener)

| Symbol | Contract Address |
|---|---|
| ETH / WETH | `0x4200000000000000000000000000000000000006` |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| CBBTC | `0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf` |
| VIRTUAL | `0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b` |
| AERO | `0x940181a94A35A4569E4529a3CDfB74e38FD98631` |
| BRETT | `0x532f27101965dd16442E59d40670FaF5eBB142E4` |
| TOSHI | `0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4` |
| DEGEN | `0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed` |

**Example prompts:**
> "ETHの現在価格は？"
> "AEROはいくら？"
> "BRETTの24時間変動を教えて"

---

## Wallet Data

When a wallet is connected, the agent can retrieve:
- ETH balance on Base mainnet
- Recent transaction history (latest 5 transactions via Blockscout)

**Example prompts:**
> "私の残高を教えて"
> "直近の取引履歴を見せて"

---

## Apps Managed by This Agent

- **Base Tap Rush:** https://base-tap-rush-lilac.vercel.app
  - High scores recorded on-chain on Base mainnet
  - Builder Code: `bc_l3jofats`

- **Base Shooter NFT:** https://base-shooter-nft.vercel.app
  - ERC-721 NFT mint based on game score
  - x402 AI advice endpoint ($0.001 USDC per request)
  - EAS attestation issued on every NFT mint
  - Builder Code: `bc_kyew96tf`

---

## Builder Code Attribution (ERC-8021)

All responses include a Builder Code suffix for attribution:
Builder Code: bc_1yawrpdt
Encoded: 0x62635f31796177727064740b0080218021802180218021802180218021
---

## Contract & App Info

| Field | Value |
|---|---|
| Chain | Base Mainnet (Chain ID: 8453) |
| App URL | https://base-agent-kit-pied.vercel.app |
| GitHub | https://github.com/dainagon89/base-agent-kit |
| base.dev App ID | `6a48e19b95ca1d5df06c43b0` |
| Builder Code | `bc_1yawrpdt` |
| EAS Schema UID | `0xc1221c46fb81b7f6416c7da3ad4059d1c6d624e45d7100c5264713586c1373c3` |
| Agent Wallet | `0xe7e648582B323Aa7a57eE1490DD89fE05d5168A8` |

---

## Builder

- **ENS:** `dainagon.eth`
- **Address:** `0x4128F1A04767F1856db4f1588F8250F9ED948D12`
