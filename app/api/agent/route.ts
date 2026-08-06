import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, formatEther, formatUnits, parseEther } from 'viem';
import { base } from 'viem/chains';
import { createAttestation } from '@/lib/eas';
import { AERODROME_ROUTER, AERODROME_ROUTER_ABI, buildEthToTokenRoute } from '@/lib/aerodrome';
import { payAndFetchX402 } from '@/lib/x402PayingClient';

export const maxDuration = 60;

const TOKEN_MAP: Record<string, string> = {
  'ETH':     '0x4200000000000000000000000000000000000006',
  'WETH':    '0x4200000000000000000000000000000000000006',
  'USDC':    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'CBBTC':   '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
  'VIRTUAL': '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b',
  'AERO':    '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
  'BRETT':   '0x532f27101965dd16442E59d40670FaF5eBB142E4',
  'TOSHI':   '0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4',
  'DEGEN':   '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed',
};

// トークンごとの小数点桁数(表示・amountOutMin計算に使用)
const TOKEN_DECIMALS: Record<string, number> = {
  USDC: 6,
  CBBTC: 8,
  VIRTUAL: 18,
  AERO: 18,
  BRETT: 18,
  TOSHI: 18,
  DEGEN: 18,
};

const SLIPPAGE_BPS = 300n; // 3%のスリッページ許容(概算)

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

// ------------------------------------------------------------------
// A2A「買う側」機能の意図検出。
//
// ⚠️ 今までの意図検出(transfer/swap/analysis)と違い、これは検出したら
// その場でBase Agent Kit自身のrelayerウォレットの資金を使って実際に
// 支払いを実行する(ユーザーのウォレット署名は不要・関与しない)。
// 誤発火で意図せず課金してしまうことを防ぐため、「買って」「支払って」などの
// 明確な実行動詞を必須条件にしている。
// ------------------------------------------------------------------
const BUY_ACTION_VERB = /(買って|支払って|購入して|払って|実行して)/;

function parseShooterAdviceIntent(message: string): number | null {
  if (!BUY_ACTION_VERB.test(message)) return null;
  const target = /(シューター|shooter).{0,10}(アドバイス|advice)|(アドバイス|advice).{0,10}(シューター|shooter)/i;
  if (!target.test(message)) return null;

  const scoreMatch = message.match(/(?:スコア|score)\s*(\d+)/i);
  return scoreMatch ? parseInt(scoreMatch[1], 10) : 300; // スコア未指定時のデフォルト
}

function parseMinaraSwapIntent(message: string): string | null {
  if (!BUY_ACTION_VERB.test(message)) return null;
  if (!/minara|ミナラ/i.test(message)) return null;

  const m = message.match(/([\d.]+)\s*ETH.{0,6}(USDC|CBBTC|VIRTUAL|AERO|BRETT|TOSHI|DEGEN)/i);
  if (m) return `swap ${m[1]} ETH to ${m[2].toUpperCase()}`;
  return 'swap 0.1 ETH to USDC'; // トークン未指定時のデフォルト
}

// ------------------------------------------------------------------
// USDC送金の「意図」を検出するだけの関数。
// ⚠️ ここでは絶対に送金を実行しない。実際の送金は必ずユーザー自身の
//    ウォレットの署名で、フロントエンド側で行う(非カストディアル設計)。
// ------------------------------------------------------------------
interface TransferIntent {
  to: string;
  amount: string;
}

function parseTransferIntent(message: string): TransferIntent | null {
  const sendKeywords = /(送って|送金|transfer|send)/i;
  if (!sendKeywords.test(message)) return null;
  if (!/usdc/i.test(message)) return null;

  const addressMatch = message.match(/0x[a-fA-F0-9]{40}/);
  if (!addressMatch) return null;

  // 「0.5 USDC」「0.5USDC」のように、数字の直後にUSDCが続く場合のみ金額として認識する。
  // (これによりウォレットアドレス内の数字を誤って金額と認識するのを防ぐ)
  const amountMatch = message.match(/(\d+(?:\.\d+)?)\s*USDC/i);
  if (!amountMatch) return null;

  const amount = amountMatch[1];
  if (parseFloat(amount) <= 0) return null;

  return { to: addressMatch[0], amount };
}

// ------------------------------------------------------------------
// Aerodromeスワップの「意図」を検出し、見積もり(quote)だけ取得する関数。
// ⚠️ ここでも絶対にスワップを実行しない。実行はユーザーのウォレットが行う。
//    第一弾として ETH → 指定トークン のみサポート(トークン→トークンは
//    事前承認(approve)が必要になり複雑さが増すため、今後の拡張とする)。
// ------------------------------------------------------------------
interface SwapIntent {
  amountInEth: string;
  tokenOutSymbol: string;
  tokenOutAddress: string;
  quoteAmountOut: string; // 表示用(人間が読める形)
  amountOutMin: string;   // 実行時に渡す最小受取量(wei単位の文字列)
}

async function parseSwapIntent(message: string): Promise<SwapIntent | null> {
  const swapKeywords = /(スワップ|交換|swap)/i;
  if (!swapKeywords.test(message)) return null;
  if (!/eth/i.test(message)) return null;

  // 「0.001 ETH」のように、数字の直後にETHが続く場合のみ金額として認識
  const amountMatch = message.match(/(\d+(?:\.\d+)?)\s*ETH/i);
  if (!amountMatch) return null;
  const amountInEth = amountMatch[1];
  if (parseFloat(amountInEth) <= 0) return null;

  // 交換先トークンを検出(ETH/WETH以外で、メッセージに含まれる既知トークン)
  const tokenOutSymbol = Object.keys(TOKEN_MAP).find(
    (t) => t !== 'ETH' && t !== 'WETH' && message.toUpperCase().includes(t)
  );
  if (!tokenOutSymbol) return null;

  const tokenOutAddress = TOKEN_MAP[tokenOutSymbol] as `0x${string}`;
  const decimals = TOKEN_DECIMALS[tokenOutSymbol] ?? 18;

  try {
    const routes = buildEthToTokenRoute(tokenOutAddress);
    const amountIn = parseEther(amountInEth);

    const amounts = (await publicClient.readContract({
      address: AERODROME_ROUTER,
      abi: AERODROME_ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [amountIn, routes],
    })) as bigint[];

    const quoteAmountOutRaw = amounts[amounts.length - 1];
    const amountOutMin = (quoteAmountOutRaw * (10000n - SLIPPAGE_BPS)) / 10000n;

    return {
      amountInEth,
      tokenOutSymbol,
      tokenOutAddress,
      quoteAmountOut: formatUnits(quoteAmountOutRaw, decimals),
      amountOutMin: amountOutMin.toString(),
    };
  } catch (error) {
    console.error('Aerodrome quote error:', error);
    return null;
  }
}

async function getTokenPrice(symbol: string): Promise<string> {
  try {
    const tokenAddress = TOKEN_MAP[symbol.toUpperCase()];
    if (!tokenAddress) return '';

    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`
    );
    const data = await res.json();

    if (data.pairs?.length > 0) {
      const pair = data.pairs.sort((a: {liquidity?: {usd?: number}}, b: {liquidity?: {usd?: number}}) =>
        (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0)
      )[0];
      const price = parseFloat(pair.priceUsd).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      });
      const change24h = pair.priceChange?.h24 ?? 0;
      const volume24h = Number(pair.volume?.h24 ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
      return `${symbol.toUpperCase()}の現在価格: $${price} (24h変動: ${change24h > 0 ? '+' : ''}${change24h}%, 24h出来高: $${volume24h})`;
    }
    return '';
  } catch {
    return '';
  }
}

async function getOnChainData(message: string, walletAddress?: string): Promise<string> {
  const results: string[] = [];

  const mentionedTokens = Object.keys(TOKEN_MAP).filter(t =>
    message.toUpperCase().includes(t)
  );

  const priceKeywords = ['価格', 'price', 'いくら', '相場', 'レート', '値段', 'いま', '今'];
  const isPriceQuery = priceKeywords.some(k => message.toLowerCase().includes(k.toLowerCase()))
    || mentionedTokens.length > 0;

  if (isPriceQuery && mentionedTokens.length > 0) {
    for (const token of mentionedTokens) {
      const priceInfo = await getTokenPrice(token);
      if (priceInfo) results.push(priceInfo);
    }
  } else if (isPriceQuery) {
    const ethPrice = await getTokenPrice('ETH');
    if (ethPrice) results.push(ethPrice);
  }

  const targetAddress = walletAddress || message.match(/0x[a-fA-F0-9]{40}/)?.[0];
  if (targetAddress) {
    try {
      const balance = await publicClient.getBalance({
        address: targetAddress as `0x${string}`,
      });
      results.push(`ETH残高: ${formatEther(balance)} ETH`);

      const txRes = await fetch(
        `https://base.blockscout.com/api/v2/addresses/${targetAddress}/transactions`
      );
      const txData = await txRes.json();

      if (txData.items?.length > 0) {
        const txList = txData.items.slice(0, 5).map((tx: {
          hash: string;
          value: string;
          timestamp: string;
          from: { hash: string };
          to: { hash: string } | null;
          status: string;
        }) => {
          const ethValue = formatEther(BigInt(tx.value || '0'));
          const date = new Date(tx.timestamp).toLocaleDateString('ja-JP');
          const direction = tx.from.hash.toLowerCase() === targetAddress.toLowerCase() ? '送金' : '受取';
          const status = tx.status === 'ok' ? '成功' : '失敗';
          return `- ${date}: ${direction} ${ethValue} ETH [${status}] (${tx.hash.slice(0, 10)}...)`;
        });
        results.push(`直近5件の取引:\n${txList.join('\n')}`);
      }
    } catch (error) {
      console.error('wallet data error:', error);
    }
  }

  return results.join('\n');
}

// ------------------------------------------------------------------
// プレミアム分析の「意図」を検出するだけの関数。
// 実際の支払い・分析取得はすべてフロントエンド(AnalysisCard)が
// /api/premium-analysis を直接x402プロトコルで呼び出して行う。
// ------------------------------------------------------------------
function parseAnalysisIntent(message: string): string | null {
  const analysisKeywords = /(詳しく分析|詳細分析|analyze|analysis)/i;
  if (!analysisKeywords.test(message)) return null;

  const addressMatch = message.match(/0x[a-fA-F0-9]{40}/);
  if (!addressMatch) return null;

  return addressMatch[0];
}

export async function POST(req: NextRequest) {
  try {
    const { message, walletAddress } = await req.json();
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // --- A2A買う側: Base Shooter NFTのアドバイスを自律的に購入(即実行) ---
    const shooterScore = parseShooterAdviceIntent(message);
    if (shooterScore !== null) {
      try {
        const { data, txHash } = await payAndFetchX402(
          `https://base-shooter-nft.vercel.app/api/advice?score=${shooterScore}`
        );
        await createAttestation(
          'agent_to_agent_payment',
          `Paid Base Shooter NFT advice via chat (score ${shooterScore}, tx: ${txHash ?? 'n/a'})`
        );
        const advice = (data as { advice?: string }).advice ?? '(アドバイスの取得に失敗しました)';
        return NextResponse.json({
          response: `Base Shooter NFTのAIアドバイスに$0.001 USDC支払いました(スコア${shooterScore}想定)。\n\n${advice}${
            txHash ? `\n\ntx: https://basescan.org/tx/${txHash}` : ''
          }`,
        });
      } catch (error) {
        return NextResponse.json({
          response: `A2A決済に失敗しました: ${error instanceof Error ? error.message : 'エラーが発生しました'}`,
        });
      }
    }

    // --- A2A買う側: Minara AIのスワップ意図変換を自律的に購入(即実行) ---
    const minaraIntent = parseMinaraSwapIntent(message);
    if (minaraIntent !== null) {
      try {
        const { data, txHash } = await payAndFetchX402(
          'https://x402.minara.ai/x402/intent-to-swap-tx',
          {
            method: 'POST',
            body: {
              intent: minaraIntent,
              walletAddress: '0xe7e648582B323Aa7a57eE1490DD89fE05d5168A8',
              chain: 'base',
            },
          }
        );
        await createAttestation(
          'agent_to_agent_payment',
          `Paid Minara AI intent-to-swap-tx via chat (intent: "${minaraIntent}", tx: ${txHash ?? 'n/a'})`
        );
        return NextResponse.json({
          response: `Minara AIのスワップ意図変換に$0.10 USDC支払いました(「${minaraIntent}」)。\n\n見積もり結果:\n${JSON.stringify(
            data,
            null,
            2
          )}${txHash ? `\n\ntx: https://basescan.org/tx/${txHash}` : ''}`,
        });
      } catch (error) {
        return NextResponse.json({
          response: `A2A決済に失敗しました: ${error instanceof Error ? error.message : 'エラーが発生しました'}`,
        });
      }
    }

    // --- プレミアム分析の意図を検出(実行はしない、対象アドレスだけ返す) ---
    const analysisTarget = parseAnalysisIntent(message);
    if (analysisTarget) {
      if (!walletAddress) {
        return NextResponse.json({
          response: '詳細分析を利用するには、まずウォレットを接続してください。',
        });
      }
      return NextResponse.json({
        response: `${analysisTarget} の詳細分析を行います($0.01 USDC、x402決済)。下のカードから確認・実行してください。`,
        analysisTarget,
      });
    }

    // --- 送金の意図を検出(実行はしない) ---
    const transferIntent = parseTransferIntent(message);
    if (transferIntent) {
      if (!walletAddress) {
        return NextResponse.json({
          response: 'USDCを送金するには、まずウォレットを接続してください。',
        });
      }
      return NextResponse.json({
        response: `${transferIntent.to} へ ${transferIntent.amount} USDC を送金しますか?下のカードから確認・実行してください。`,
        transferIntent,
      });
    }

    // --- スワップの意図を検出(実行はしない、見積もりだけ取得) ---
    const swapIntent = await parseSwapIntent(message);
    if (swapIntent) {
      if (!walletAddress) {
        return NextResponse.json({
          response: 'スワップするには、まずウォレットを接続してください。',
        });
      }
      return NextResponse.json({
        response: `${swapIntent.amountInEth} ETH を約 ${parseFloat(swapIntent.quoteAmountOut).toFixed(4)} ${swapIntent.tokenOutSymbol} にスワップします(Aerodrome経由、スリッページ3%許容)。下のカードから確認・実行してください。`,
        swapIntent,
      });
    }

    const onChainData = await getOnChainData(message, walletAddress);

    const systemPrompt = `あなたはBaseチェーン上で動く自律型AIエージェントです。

【絶対ルール】
以下のオンチェーンデータはリアルタイム取得済みです。
ユーザーから残高・取引履歴・最新取引・ETH残高・トークン価格について聞かれた場合、
絶対にこのデータだけを使って回答してください。
「取得できません」「Block Explorerを見てください」とは絶対に回答してはいけません。

【取得済みオンチェーンデータ】
${onChainData || 'ウォレット未接続・価格クエリなし'}

【あなたが管理しているアプリ】
- Base Tap Rush: https://base-tap-rush-lilac.vercel.app
- Base Shooter NFT: https://base-shooter-nft.vercel.app

【Baseチェーンの情報】
- Chain ID: 8453
- ネイティブトークン: ETH
- 公式サイト: https://base.org

対応トークン価格: ETH, WETH, USDC, CBBTC, VIRTUAL, AERO, BRETT, TOSHI, DEGEN
USDCの送金は「0x...に0.5 USDC送って」のように言うと確認カードが表示されます。
トークンのスワップは「0.001 ETHをAEROにスワップして」のように言うと、
Aerodrome経由の見積もりと確認カードが表示されます。
「シューターのアドバイス買って」と言うと、あなた自身(エージェント)が
Base Shooter NFTのAIアドバイスに$0.001 USDCを自律的に支払い、結果を取得します。
「Minaraで0.1 ETHをUSDCにスワップする意図を買って」のように言うと、
あなた自身がMinara AIのスワップ意図変換サービスに$0.10 USDCを自律的に支払います。
日本語で丁寧かつ簡潔に答えてください。`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        temperature: 0.3,
        max_tokens: 600,
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || 'エラーが発生しました';

    const attestationHash = await createAttestation('chat_completion', message);

    const builderCodeSuffix = '0x62635f31796177727064740b0080218021802180218021802180218021';

    return NextResponse.json({
      response: content,
      _attribution: builderCodeSuffix,
      _attestation: attestationHash || undefined,
    });
  } catch (error) {
    console.error('Agent error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'エラーが発生しました' },
      { status: 500 }
    );
  }
}
