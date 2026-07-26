# Base Agent Kit Skill

## Overview

This skill enables AI agents to interact with the Base Agent Kit ecosystem on Base mainnet.
Base Agent Kit is an autonomous AI agent powered by OpenAI GPT-4o-mini (GPT-4o for premium features)
that can answer questions about the Base ecosystem, retrieve real-time on-chain data, execute
non-custodial USDC transfers and Aerodrome token swaps on behalf of a connected wallet, offer a
paid (x402) premium wallet analysis endpoint, and automatically issue EAS attestations on Base
mainnet for every completed task.

## Features

- **Real-time token prices** via DexScreener (ETH, USDC, CBBTC, VIRTUAL, AERO, BRETT, TOSHI, DEGEN)
- **Wallet balance & transaction history** via viem / Blockscout API on Base mainnet
- **Non-custodial USDC transfer**: user states an amount and recipient in chat; the connected
  wallet signs and sends the transfer directly. The server never holds or moves user funds.
- **Non-custodial Aerodrome swap**: user states an ETH amount and target token; the agent fetches
  an on-chain quote from Aerodrome's Router (`getAmountsOut`), then the connected wallet signs and
  sends the swap transaction directly (`swapExactETHForTokens`).
- **x402 premium analysis** ($0.01 USDC): a generic, address-based paid endpoint returning a
  detailed GPT-4o wallet analysis report. Self-settled (no CDP facilitator dependency).
- **EAS attestations** automatically issued on Base mainnet for chat completions, USDC transfers,
  Aerodrome swaps, and premium analyses.
- **Wallet connection** via wagmi (MetaMask / Coinbase Wallet)
- **Builder Code attribution** (ERC-8021) embedded in every on-chain transaction this agent
  facilitates.

## Live App

https://base-agent-kit-pied.vercel.app

## Non-Custodial Design

Base Agent Kit never holds, custodies, or unilaterally moves user funds. For USDC transfers and
Aerodrome swaps, the server only (a) detects intent from natural language and (b) for swaps,
fetches a price quote. All on-chain execution is signed and broadcast by the user's own connected
wallet. This is an intentional design choice to avoid custodial-service classification.

## USDC Transfer

**Trigger pattern:** a message containing a send/transfer verb (送って / 送金 / transfer / send),
the literal token "USDC", and a `0x`-prefixed 40-hex-char address.

**Example prompts:**
> "0xFc9D...728C6に0.5 USDCを送って"
> "send 0.5 USDC to 0xFc9D...728C6"

**Execution:** ERC-20 `transfer(address,uint256)` call on the USDC contract
(`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`), signed and sent by the user's wallet, with the
Builder Code suffix appended to calldata.

## Aerodrome Swap

**Trigger pattern:** a message containing a swap verb (スワップ / 交換 / swap), an amount followed
by "ETH", and a supported token symbol from the price table below (excluding ETH/WETH).

**Example prompts:**
> "0.001 ETHをAEROにスワップして"
> "0.0005 ETHをUSDCにスワップして"

**Execution:** `swapExactETHForTokens` on Aerodrome's Router (Base mainnet), with a single-hop
volatile-pool route (WETH → target token) and 3% slippage tolerance. Currently supports ETH →
token direction only (token → token requires an approval step, planned for future extension).

| Field | Value |
| --- | --- |
| Router | `0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43` |
| PoolFactory | `0x420DD381b31aEf6683db6B902084cB0FFECe40Da` |
| WETH | `0x4200000000000000000000000000000000000006` |

## x402 Premium Analysis (Paid, Generic Endpoint)

A generic paid endpoint that any agent or user can call for any Base mainnet wallet address — not
tied to any game score or app-specific state.

```
GET https://base-agent-kit-pied.vercel.app/api/premium-analysis?address={wallet_address}
```

**Payment flow (x402, self-settled):**
1. Request without `X-PAYMENT` header → `402 Payment Required` with an `accepts` array
   (scheme: `exact`, network: `eip155:8453`, asset: USDC, amount: `10000` = $0.01).
2. Client signs an EIP-3009 `TransferWithAuthorization` typed-data message
   (domain name: `"USD Coin"`, not `"USDC"` — matches the on-chain contract's actual `name()`
   return value, which differs from its BaseScan display label).
3. Client resubmits the same request with the base64-encoded payload in the `X-PAYMENT` header.
4. Server verifies the signature locally (no external facilitator), then relays the on-chain
   settlement itself via its own wallet, appending the Builder Code suffix to calldata.
5. On success, returns a GPT-4o-generated analysis report (asset overview, transaction pattern,
   risk assessment) plus the settlement `txHash`.

**Example prompt (via chat UI):**
> "0x...を詳しく分析して"

## Supported Token Prices (DexScreener)

| Symbol | Contract Address |
| --- | --- |
| ETH / WETH | `0x4200000000000000000000000000000000000006` |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| CBBTC | `0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf` |
| VIRTUAL | `0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b` |
| AERO | `0x940181a94A35A4569E4529a3CDfB74e38FD98631` |
| BRETT | `0x532f27101965dd16442E59d40670FaF5eBB142E4` |
| TOSHI | `0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4` |
| DEGEN | `0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed` |

**Example prompts:**
> "ETHの現在価格は？" / "AEROはいくら？" / "BRETTの24時間変動を教えて"

## Wallet Data

**Example prompts:**
> "私の残高を教えて" / "直近の取引履歴を見せて"

## EAS Attestation

Every completed task (chat, transfer, swap, premium analysis) issues an on-chain EAS attestation.

**EAS Schema UID:** `0xc1221c46fb81b7f6416c7da3ad4059d1c6d624e45d7100c5264713586c1373c3`

**Schema fields:**
- `agentName` (string): Always "Base Agent Kit"
- `taskType` (string): `chat_completion` | `usdc_transfer` | `aerodrome_swap` | `premium_analysis`
- `taskSummary` (string): Description of the completed task (truncated to 100 chars)
- `timestamp` (uint256): Unix timestamp

**View attestations:** https://base.easscan.org/attestations/forSchema/0xc1221c46fb81b7f6416c7da3ad4059d1c6d624e45d7100c5264713586c1373c3

**Agent wallet (EAS issuance + x402 settlement relay):** `0xe7e648582B323Aa7a57eE1490DD89fE05d5168A8`

---

## Apps Managed by This Agent

- **Base Tap Rush:** https://base-tap-rush-lilac.vercel.app
  - High scores recorded on-chain on Base mainnet
  - Builder Code: `bc_l3jofats`

- **Base Shooter NFT:** https://base-shooter-nft.vercel.app
  - ERC-721 NFT mint based on game score
  - x402 AI advice endpoint ($0.001 USDC per request, self-settled)
  - EAS attestation issued on every NFT mint
  - Builder Code: `bc_kyew96tf`

---

## Builder Code Attribution (ERC-8021)

All on-chain transactions this agent facilitates (chat, transfer, swap, premium analysis) include
a Builder Code suffix appended to calldata.

| Field | Value |
| --- | --- |
| Builder Code | `bc_1yawrpdt` |
| Encoded | `0x62635f31796177727064740b0080218021802180218021802180218021` |

## Contract & App Info

| Field | Value |
| --- | --- |
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
