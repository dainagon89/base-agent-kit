# Base Agent Kit

Baseエコシステム向けの自律型AIエージェント。オンチェーンデータの取得と、チャット完了ごとのEASアテステーション自動発行を行います。

**🤖 Live App:** https://base-agent-kit-pied.vercel.app
**📦 GitHub:** https://github.com/dainagon89/base-agent-kit

---

## 概要

Base Agent Kit は OpenAI GPT-4o-mini を活用した自律型AIエージェントです。Baseエコシステムに関する質問への回答、リアルタイムのオンチェーンデータ取得に加え、完了したタスクごとにBaseメインネット上でEASアテステーションを自動発行します。

## 機能

- **リアルタイムトークン価格**(DexScreener経由): ETH, USDC, CBBTC, VIRTUAL, AERO, BRETT, TOSHI, DEGEN
- **ウォレット残高取得**(viem経由、Base mainnet)
- **取引履歴取得**(Blockscout API、APIキー不要)
- **EASアテステーション自動発行**(チャット完了ごと)
- **ウォレット接続**(wagmi経由、MetaMask / Coinbase Wallet)
- **Builder Code帰属**(ERC-8021、全レスポンスに埋め込み)

## 技術スタック

- **フレームワーク:** Next.js 14–16 (App Router)
- **Web3ライブラリ:** wagmi, viem
- **スタイリング:** Tailwind CSS
- **AI:** OpenAI GPT-4o-mini
- **アテステーション:** EAS SDK (`@ethereum-attestation-service/eas-sdk`), ethers
- **デプロイ:** Vercel
- **チェーン:** Base Mainnet (Chain ID: 8453)

## デプロイ済みURL

| 項目 | URL |
| --- | --- |
| アプリ | https://base-agent-kit-pied.vercel.app |
| GitHub | https://github.com/dainagon89/base-agent-kit |

## 環境変数の設定方法

Vercelの `Settings → Environment Variables` から以下を設定してください:

```bash
# .env.local
OPENAI_API_KEY=your_openai_api_key
AGENT_PRIVATE_KEY=your_agent_wallet_private_key   # EASアテステーション発行用ウォレット
EAS_SCHEMA_UID=0xc1221c46fb81b7f6416c7da3ad4059d1c6d624e45d7100c5264713586c1373c3
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
```

設定後は Vercel の Deployments タブから **Redeploy** して反映してください。

> ⚠️ `AGENT_PRIVATE_KEY` はガス代を含むオンチェーン発行を行う秘密鍵です。絶対にリポジトリにコミットせず、Vercelの環境変数としてのみ管理してください。

## 対応トークン価格 (DexScreener)

| シンボル | コントラクトアドレス |
| --- | --- |
| ETH / WETH | `0x4200000000000000000000000000000000000006` |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| CBBTC | `0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf` |
| VIRTUAL | `0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b` |
| AERO | `0x940181a94A35A4569E4529a3CDfB74e38FD98631` |
| BRETT | `0x532f27101965dd16442E59d40670FaF5eBB142E4` |
| TOSHI | `0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4` |
| DEGEN | `0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed` |

**プロンプト例:**
> 「ETHの現在価格は?」「AEROはいくら?」「BRETTの24時間変動を教えて」

## ウォレットデータ

ウォレット接続時、エージェントは以下を取得できます。

- Base mainnet上のETH残高
- 直近の取引履歴(Blockscout経由、最新5件)

**プロンプト例:**
> 「私の残高を教えて」「直近の取引履歴を見せて」

## EASアテステーション

ユーザーがメッセージを送信するたびに、Baseメインネット上でEASアテステーションが自動発行され、エージェントが実タスクを完了した検証可能な証明を提供します。

| 項目 | 値 |
| --- | --- |
| EAS Schema UID | `0xc1221c46fb81b7f6416c7da3ad4059d1c6d624e45d7100c5264713586c1373c3` |
| スキーマフィールド | `agentName` (string, 常に"Base Agent Kit"), `taskType` (string, 常に"chat_completion"), `taskSummary` (string, ユーザーメッセージ先頭100文字), `timestamp` (uint256) |
| Attestations一覧 | https://base.easscan.org/attestations/forSchema/0xc1221c46fb81b7f6416c7da3ad4059d1c6d624e45d7100c5264713586c1373c3 |
| エージェントウォレット | `0xe7e648582B323Aa7a57eE1490DD89fE05d5168A8` |

## 本エージェントが管理するアプリ

### Base Tap Rush
https://base-tap-rush-lilac.vercel.app
- ハイスコアをBaseメインネット上にオンチェーン記録
- Builder Code: `bc_l3jofats`

### Base Shooter NFT
https://base-shooter-nft.vercel.app
- スコアに応じたERC-721 NFTミント
- x402 AIアドバイスエンドポイント($0.001 USDC/リクエスト)
- NFTミントごとにEASアテステーション発行
- Builder Code: `bc_kyew96tf`

## Builder Code (ERC-8021)

全レスポンスにBuilder Codeサフィックスが付与され、属性情報として付加されます。

| 項目 | 値 |
| --- | --- |
| Builder Code | `bc_1yawrpdt` |
| Encoded | `0x62635f31796177727064740b0080218021802180218021802180218021` |

## コントラクト・アプリ情報

| 項目 | 値 |
| --- | --- |
| チェーン | Base Mainnet (Chain ID: 8453) |
| App URL | https://base-agent-kit-pied.vercel.app |
| GitHub | https://github.com/dainagon89/base-agent-kit |
| base.dev App ID | `6a48e19b95ca1d5df06c43b0` |
| Builder Code | `bc_1yawrpdt` |
| EAS Schema UID | `0xc1221c46fb81b7f6416c7da3ad4059d1c6d624e45d7100c5264713586c1373c3` |
| Agent Wallet | `0xe7e648582B323Aa7a57eE1490DD89fE05d5168A8` |

## Builder

| 項目 | 値 |
| --- | --- |
| ENS | `dainagon.eth` |
| Address | `0x4128F1A04767F1856db4f1588F8250F9ED948D12` |

---

Built with ❤️ on [Base](https://base.org)
