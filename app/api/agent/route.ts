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

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

async function getOnChainData(message: string, walletAddress?: string): Promise<string> {
  const targetAddress = walletAddress || message.match(/0x[a-fA-F0-9]{40}/)?.[0];
  if (!targetAddress) return '';

  try {
    const results: string[] = [];

    // ETH残高
    const balance = await publicClient.getBalance({
      address: targetAddress as `0x${string}`,
    });
    results.push(`ETH残高: ${formatEther(balance)} ETH`);

    // Blockscout APIで取引履歴を取得(APIキー不要)
    const txRes = await fetch(
      `https://base.blockscout.com/api/v2/addresses/${targetAddress}/transactions?limit=3`
    );
    const txData = await txRes.json();

    if (txData.items?.length > 0) {
      const txList = txData.items.slice(0, 3).map((tx: {
        hash: string;
        value: string;
        timestamp: string;
        from: { hash: string };
        to: { hash: string } | null;
      }) => {
        const ethValue = formatEther(BigInt(tx.value || '0'));
        const date = new Date(tx.timestamp).toLocaleDateString('ja-JP');
        const direction = tx.from.hash.toLowerCase() === targetAddress.toLowerCase() ? '送金' : '受取';
        return `- ${date}: ${direction} ${ethValue} ETH (${tx.hash.slice(0, 10)}...)`;
      });
      results.push(`直近の取引:\n${txList.join('\n')}`);
    }

    return `ウォレット ${targetAddress} の情報:\n${results.join('\n')}`;
  } catch {
    return '';
  }
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
Baseエコシステムについての質問に答えたり、オンチェーンの情報を提供したりできます。

あなたが管理しているアプリ:
- Base Tap Rush: https://base-tap-rush-lilac.vercel.app
- Base Shooter NFT: https://base-shooter-nft.vercel.app

Baseチェーンの情報:
- Chain ID: 8453
- ネイティブトークン: ETH
- 公式サイト: https://base.org

重要: オンチェーンデータが提供されている場合は、必ずそのデータを使って具体的に答えてください。
「取引履歴を確認できません」などの回答は絶対にしないでください。
日本語で丁寧かつ簡潔に答えてください。${onChainData ? `\n\nオンチェーンデータ: ${onChainData}` : ''}`;

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
        temperature: 0.7,
        max_tokens: 500,
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
