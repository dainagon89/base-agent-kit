import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';
import { buildPaymentRequirements, verifyAndSettleX402Payment } from '@/lib/x402';
import { createAttestation } from '@/lib/eas';

export const maxDuration = 60;

const PAYOUT_ADDRESS = process.env.ANALYSIS_PAYOUT_ADDRESS as string;
const PRICE = '10000'; // $0.01 USDC (6 decimals)
const BUILDER_CODE_SUFFIX =
  '0x62635f31796177727064740b0080218021802180218021802180218021' as `0x${string}`;

const publicClient = createPublicClient({ chain: base, transport: http() });

async function gatherOnChainData(address: string) {
  const results: string[] = [];

  const balance = await publicClient.getBalance({ address: address as `0x${string}` });
  results.push(`ETH残高: ${formatEther(balance)} ETH`);

  try {
    const txRes = await fetch(
      `https://base.blockscout.com/api/v2/addresses/${address}/transactions?filter=to%20%7C%20from`
    );
    const txData = await txRes.json();
    if (txData.items?.length > 0) {
      const txList = txData.items.slice(0, 20).map((tx: {
        hash: string;
        value: string;
        timestamp: string;
        from: { hash: string };
        to: { hash: string } | null;
        status: string;
      }) => {
        const ethValue = formatEther(BigInt(tx.value || '0'));
        const direction = tx.from.hash.toLowerCase() === address.toLowerCase() ? '送金' : '受取';
        return `${tx.timestamp}: ${direction} ${ethValue} ETH [${tx.status}] to/from ${tx.to?.hash ?? 'contract creation'}`;
      });
      results.push(`直近取引(最大20件):\n${txList.join('\n')}`);
    }
  } catch (error) {
    console.error('blockscout fetch error:', error);
  }

  return results.join('\n\n');
}

export async function GET(req: NextRequest) {
  try {
    const address = req.nextUrl.searchParams.get('address');
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json({ error: 'Valid address query parameter is required' }, { status: 400 });
    }

    const resourceUrl = `https://${req.headers.get('host')}/api/premium-analysis?address=${address}`;
    const requirements = buildPaymentRequirements({
      amount: PRICE,
      payTo: PAYOUT_ADDRESS,
      resource: resourceUrl,
      description: `Base Agent Kit - ウォレット詳細分析 ($0.01 USDC) for ${address}`,
    });

    const paymentHeader = req.headers.get('X-PAYMENT');
    if (!paymentHeader) {
      return NextResponse.json(
        {
          error: 'Payment required',
          x402Version: 1,
          accepts: [requirements],
          resource: resourceUrl,
          description: requirements.description,
          mimeType: 'application/json',
        },
        { status: 402 }
      );
    }

    const settleResult = await verifyAndSettleX402Payment(paymentHeader, requirements, BUILDER_CODE_SUFFIX);
    if (!settleResult.ok) {
      return NextResponse.json({ error: 'Invalid payment', reason: settleResult.reason }, { status: 402 });
    }

    const onChainData = await gatherOnChainData(address);

    const analysisPrompt = `あなたはオンチェーン分析の専門家です。以下のウォレットアドレス ${address} のデータを分析し、
以下の観点から詳細なレポートを日本語で作成してください:

1. 資産状況の概要
2. 取引パターンの傾向(頻度、規模、時間帯など読み取れる情報)
3. リスク評価(不審な挙動や集中リスクがあれば指摘)
4. 総合コメント

【オンチェーンデータ】
${onChainData}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o', // 無料版(gpt-4o-mini)より高性能なモデルを有料枠で使用
        messages: [{ role: 'user', content: analysisPrompt }],
        temperature: 0.4,
        max_tokens: 1000,
      }),
    });

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content || '分析に失敗しました';

    await createAttestation('premium_analysis', `Paid analysis for ${address} (tx: ${settleResult.txHash})`);

    const nextResponse = NextResponse.json({ analysis, txHash: settleResult.txHash });
    nextResponse.headers.set(
      'X-PAYMENT-RESPONSE',
      Buffer.from(JSON.stringify({ success: true, txHash: settleResult.txHash })).toString('base64')
    );
    return nextResponse;
  } catch (error) {
    console.error('premium-analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'エラーが発生しました' },
      { status: 500 }
    );
  }
}
