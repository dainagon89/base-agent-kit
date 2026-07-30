// lib/analysis.ts
//
// premium-analysis/route.ts と api/a2a/route.ts の両方から呼び出す共通の
// 分析処理。オンチェーンデータの収集とGPT-4oによるレポート生成のみを行い、
// 決済(x402 verify/settle)は呼び出し側の責任にする。

import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';

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

export async function runPremiumAnalysisReport(address: string): Promise<string> {
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
      model: 'gpt-4o',
      messages: [{ role: 'user', content: analysisPrompt }],
      temperature: 0.4,
      max_tokens: 1000,
    }),
  });

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '分析に失敗しました';
}
