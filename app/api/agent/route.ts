import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http, formatEther, encodeAbiParameters, parseAbiParameters } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

export const maxDuration = 60;

const EAS_CONTRACT = '0x4200000000000000000000000000000000000021' as `0x${string}`;
const SCHEMA_UID = process.env.EAS_SCHEMA_UID as `0x${string}`;

const EAS_ABI = [
  {
    type: 'function',
    name: 'attest',
    inputs: [
      {
        name: 'request',
        type: 'tuple',
        components: [
          { name: 'schema', type: 'bytes32' },
          {
            name: 'data',
            type: 'tuple',
            components: [
              { name: 'recipient', type: 'address' },
              { name: 'expirationTime', type: 'uint64' },
              { name: 'revocable', type: 'bool' },
              { name: 'refUID', type: 'bytes32' },
              { name: 'data', type: 'bytes' },
              { name: 'value', type: 'uint256' },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'payable',
  },
] as const;

const TOKEN_MAP: Record<string, string> = {
  'ETH':     '0x4200000000000000000000000000000000000006',
  'WETH':    '0x4200000000000000000000000000000000000006',
  'USDC':    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'CBBTC':   '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
  'VIRTUAL': '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b',
  'AERO':    '0x940181a94A35A4569E4529a3CDfB74e38FD98631',
  'BRETT':   '0x532f27101965dd16442E59d40670FaF5eBB142E4',
  'TOSHI':   '0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4',
  'DEGEN':   '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed',
};

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

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

  // メッセージ内に含まれるトークンシンボルを全部検出
  const mentionedTokens = Object.keys(TOKEN_MAP).filter(t =>
    message.toUpperCase().includes(t)
  );

  // 価格クエリキーワード または トークン名だけで聞いている場合
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

  // ウォレットデータ
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

async function createAttestation(taskSummary: string) {
  try {
    const privateKey = process.env.AGENT_PRIVATE_KEY!;
    const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const account = privateKeyToAccount(formattedKey as `0x${string}`);

    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(),
    });

    const encodedData = encodeAbiParameters(
      parseAbiParameters('string agentName, string taskType, string taskSummary, uint256 timestamp'),
      [
        'Base Agent Kit',
        'chat_completion',
        taskSummary.slice(0, 100),
        BigInt(Math.floor(Date.now() / 1000)),
      ]
    );

    const hash = await walletClient.writeContract({
      address: EAS_CONTRACT,
      abi: EAS_ABI,
      functionName: 'attest',
      args: [
        {
          schema: SCHEMA_UID,
          data: {
            recipient: '0x0000000000000000000000000000000000000000',
            expirationTime: BigInt(0),
            revocable: true,
            refUID: '0x0000000000000000000000000000000000000000000000000000000000000000',
            data: encodedData,
            value: BigInt(0),
          },
        },
      ],
    });

    return hash;
  } catch (error) {
    console.error('EAS attestation error:', error);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { message, walletAddress } = await req.json();
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
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

    const attestationHash = await createAttestation(message);

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
