# Base Agent Kit

Baseエコシステム向けの自律型AIエージェント。オンチェーンデータの取得、USDC送金・Aerodromeスワップの実行支援、x402マイクロペイメント、EASアテステーション自動発行を行います。

**🤖 Live App:** https://base-agent-kit-pied.vercel.app
**📦 GitHub:** https://github.com/dainagon89/base-agent-kit

---

## 概要

Base Agent Kit は OpenAI GPT-4o-mini(プレミアム機能はGPT-4o)を活用した自律型AIエージェントです。Baseエコシステムに関する質問への回答、リアルタイムのオンチェーンデータ取得に加え、**USDC送金・Aerodromeでのトークンスワップ**をチャットから直接呼び出せます。すべての資金操作は**ユーザー自身のウォレット署名**で実行される非カストディアル設計です。加えて、完了したタスクごとにBaseメインネット上でEASアテステーションを自動発行します。

## 機能

- **リアルタイムトークン価格**(DexScreener経由): ETH, USDC, CBBTC, VIRTUAL, AERO, BRETT, TOSHI, DEGEN
- **ウォレット残高・取引履歴取得**(viem / Blockscout API経由、Base mainnet)
- **USDC送金**: 「0x...に0.5 USDC送って」と話しかけるだけで送金確認カードが表示され、ユーザー自身の署名で送金
- **Aerodromeスワップ**: 「0.001 ETHをAEROにスワップして」で見積もり取得→確認カード→ユーザー自身の署名でオンチェーン実行
- **x402プレミアム分析**: $0.01 USDCの支払いで、GPT-4oによる詳細なウォレット分析レポートを取得(汎用APIとしても公開)
- **EASアテステーション自動発行**(チャット完了・送金・スワップ・プレミアム分析すべてで発行)
- **ウォレット接続**(wagmi経由、MetaMask / Coinbase Wallet)
- **Builder Code帰属**(ERC-8021、全オンチェーン操作に埋め込み)
- **A2A(Agent-to-Agent)決済対応**: Google「A2A x402拡張」のペイメントフロー(payment-required → payment-submitted → payment-completed)に対応。他のAIエージェントがAgent Card経由でBase Agent Kitのスキルと価格を発見し、x402決済でプレミアム分析を呼び出せる
- **A2A「買う側」機能**: relayerウォレットが自律的に他のx402対応サービス(Base Shooter NFTのAIアドバイスなど)に対価を支払い、結果を取得する。エージェント間の自律的な商取引を売り・買い両方向で実証

## 技術スタック

- **フレームワーク:** Next.js 14–16 (App Router)
- **Web3ライブラリ:** wagmi, viem
- **スタイリング:** Tailwind CSS
- **AI:** OpenAI GPT-4o-mini(通常)/ GPT-4o(プレミアム分析)
- **DEX連携:** Aerodrome Finance (Base mainnet Router)
- **決済:** x402(自前のverify/settle、CDP facilitator不使用)
- **アテステーション:** EAS
- **デプロイ:** Vercel
- **チェーン:** Base Mainnet (Chain ID: 8453)

## デプロイ済みURL

| 項目 | URL |
| --- | --- |
| アプリ | https://base-agent-kit-pied.vercel.app |
| プレミアム分析API | https://base-agent-kit-pied.vercel.app/api/premium-analysis?address=0x... |
| GitHub | https://github.com/dainagon89/base-agent-kit |
| A2A Agent Card | https://base-agent-kit-pied.vercel.app/.well-known/agent.json |
| A2Aエンドポイント | https://base-agent-kit-pied.vercel.app/api/a2a |
| A2A買う側エンドポイント(デモ) | https://base-agent-kit-pied.vercel.app/api/agent-buys/shooter-advice?score=300 |

## 環境変数の設定方法

Vercelの `Settings → Environment Variables` から以下を設定してください:

```bash
# .env.local
OPENAI_API_KEY=your_openai_api_key
AGENT_PRIVATE_KEY=your_agent_wallet_private_key   # EASアテステーション発行 + x402決済のリレー実行用
EAS_SCHEMA_UID=0xc1221c46fb81b7f6416c7da3ad4059d1c6d624e45d7100c5264713586c1373c3
ANALYSIS_PAYOUT_ADDRESS=your_payout_wallet_address # プレミアム分析の収益受取先
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
```

設定後は Vercel の Deployments タブから **Redeploy** して反映してください。

> ⚠️ `AGENT_PRIVATE_KEY` はガス代を含むオンチェーン発行・決済リレーを行う秘密鍵です。絶対にリポジトリにコミットせず、Vercelの環境変数としてのみ管理してください。

> ⚠️ `BigInt` リテラルを使用するため、`tsconfig.json` の `target` は `ES2020` 以上である必要があります。

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

**プロンプト例:**
> 「私の残高を教えて」「直近の取引履歴を見せて」

## USDC送金(非カストディアル)

チャットで「0x(送金先アドレス)に(金額)USDC送って」と話しかけると、送金確認カードが表示されます。**実際の送金はユーザー自身のウォレットの署名で実行され、サーバーは資金に一切触れません。**

**プロンプト例:**
> 「0xFc9D...728C6に0.5 USDCを送って」

| 項目 | 値 |
| --- | --- |
| 対象トークン | USDC (Base mainnet) |
| 実行方式 | ERC-20 `transfer`、ユーザーのウォレットが署名・送信 |
| Builder Code | 送金トランザクションのcalldataに付与 |

## Aerodromeトークンスワップ(非カストディアル)

チャットで「(金額) ETHを(トークン名)にスワップして」と話しかけると、Aerodrome Router経由の見積もり(スリッページ3%許容)を取得し、確認カードを表示します。**実行はユーザー自身のウォレットの署名。**

**プロンプト例:**
> 「0.001 ETHをAEROにスワップして」

| 項目 | 値 |
| --- | --- |
| DEX | Aerodrome Finance |
| Router | `0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43` |
| PoolFactory | `0x420DD381b31aEf6683db6B902084cB0FFECe40Da` |
| 対応方向 | ETH → 指定トークン(第一弾。トークン→トークンは今後の拡張) |

## x402プレミアム分析(汎用API)

$0.01 USDCの支払いで、GPT-4oによる詳細なウォレット分析レポート(資産状況・取引パターン・リスク評価)を取得できます。ゲームスコアなどに依存しない、**誰のウォレットアドレスでも呼び出せる汎用エンドポイント**です。

```
GET https://base-agent-kit-pied.vercel.app/api/premium-analysis?address={ウォレットアドレス}
```

| 項目 | 値 |
| --- | --- |
| 決済方式 | EIP-3009 TransferWithAuthorization(自前のverify/settle、CDP facilitator不使用) |
| Asset | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`(USDC on Base) |
| 金額 | 10000(= $0.01 USDC、6 decimals) |
| 使用モデル | GPT-4o(無料チャット枠のGPT-4o-miniより高性能) |

**プロンプト例(チャットUI経由):**
> 「0x...を詳しく分析して」

## A2A(Agent-to-Agent)対応

Base Agent Kitは、Googleが提唱する[A2A x402拡張](https://github.com/google-agentic-commerce/a2a-x402)のペイメントフロー(`payment-required` → `payment-submitted` → `payment-completed`)に対応しています。他のAIエージェントはAgent Cardを取得してBase Agent Kitのスキルと価格を発見し、x402決済(USDC on Base)を通じてプレミアム分析を呼び出すことができます。

```
GET  https://base-agent-kit-pied.vercel.app/.well-known/agent.json   # Agent Card(発見用)
POST https://base-agent-kit-pied.vercel.app/api/a2a                  # タスク実行(決済フロー込み)
```

| 項目 | 値 |
| --- | --- |
| 対応スキル | `premium-wallet-analysis`($0.01 USDC) |
| 決済スキーム | `eip3009-transferWithAuthorization`(既存のx402実装を流用、CDP facilitator不使用) |
| 決済確認済みtx | https://basescan.org/tx/0x7a8a78958e546aef1cc168ea8779bb3ce6b3df5b2a15769475d9ab33bd1b238b |

### 買う側:他のx402サービスへの自律決済

Base Agent Kit自身のrelayerウォレット(`0xe7e648582B323Aa7a57eE1490DD89fE05d5168A8`)が、外部のx402対応エンドポイントに対して自律的にEIP-3009署名を生成し、USDCで対価を支払う機能です。ユーザーの操作は不要で、エージェントが自律的に支払いに同意します。

```
GET https://base-agent-kit-pied.vercel.app/api/agent-buys/shooter-advice?score={スコア}
```

現在の実装では、Base Shooter NFTのx402 AIアドバイスエンドポイント($0.001 USDC)を買う先として実証済みです。決済のオンチェーン実行(settle)は相手サービス側(Base Shooter NFT)が自身のBuilder Code付きで行うため、実行トランザクションにはBase Shooter NFT側のBuilder Code(`bc_kyew96tf`)が付与されます。

| 項目 | 値 |
| --- | --- |
| 支払い元 | Base Agent Kit relayerウォレット(`0xe7e648582B323Aa7a57eE1490DD89fE05d5168A8`) |
| 支払い先(現状) | Base Shooter NFT `/api/advice`($0.001 USDC) |
| 決済確認済みtx | https://basescan.org/tx/0xe4ca0c7b09339e943f47e5189ba8f5fb9455626fefb797a5f6702ebf99383e7a |

## EASアテステーション

チャット応答・USDC送金・Aerodromeスワップ・プレミアム分析、それぞれの完了時にBaseメインネット上でEASアテステーションが自動発行されます。

| 項目 | 値 |
| --- | --- |
| EAS Schema UID | `0xc1221c46fb81b7f6416c7da3ad4059d1c6d624e45d7100c5264713586c1373c3` |
| taskType | `chat_completion` / `usdc_transfer` / `aerodrome_swap` / `premium_analysis` / `agent_to_agent_payment` |
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

チャット応答・USDC送金・Aerodromeスワップ・プレミアム分析、すべてのオンチェーン操作にBuilder Codeサフィックスが付与されます。

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
| Agent Wallet(EAS + x402決済リレー) | `0xe7e648582B323Aa7a57eE1490DD89fE05d5168A8` |

## Builder

| 項目 | 値 |
| --- | --- |
| ENS | `dainagon.eth` |
| Address | `0x4128F1A04767F1856db4f1588F8250F9ED948D12` |

---

Built with ❤️ on [Base](https://base.org)
