import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';

export const maxDuration = 60;

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

async function getOnChainData(message: string): Promise<string> {
  const addressMatch = message.match(/0x[a-fA-F0-9]{40}/);
  if (addressMatch) {
    try {
      const balance = await publicClient.getBalance({
        address: addressMatch[0] as `0x${string}`,
      });
      return `ウォレット ${addressMatch[0]} のBase上のETH残高: ${formatEther(balance)} ETH`;
    } catch {
      return '';
    }
  }
  return '';
}

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const onChainData = await getOnChainData(message);

    const systemPrompt = `あなたはBaseチェーン上で動く自律型AIエージェントです。
Baseエコシステムについての質問に答えたり、オンチェーンの情報を提供したりできます。

あなたが管理しているアプリ:
- Base Tap Rush: https://base-tap-rush-lilac.vercel.app
- Base Shooter NFT: https://base-shooter-nft.vercel.app

Baseチェーンの情報:
- Chain ID: 8453
- ネイティブトークン: ETH
- 公式サイト: https://base.org

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

    const builderCodeSuffix = '0x62635f31796177727064740b0080218021802180218021802180218021';

    return NextResponse.json({ response: content, _attribution: builderCodeSuffix });
  } catch (error) {
    console.error('Agent error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'エラーが発生しました' },
      { status: 500 }
    );
  }
}
