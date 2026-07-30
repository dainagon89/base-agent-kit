// app/api/a2a/route.ts
//
// A2A x402 拡張の簡易実装(仕様 v0.1 のペイメントフロー部分をNext.jsに移植)。
// 決済の検証/実行は既存の /api/premium-analysis と全く同じ
// buildPaymentRequirements / verifyAndSettleX402Payment を再利用している。
// 分析処理は lib/analysis.ts に切り出した runPremiumAnalysisReport を使う
// (premium-analysis/route.ts 側もこの共通関数を使うようリファクタしておくと、
//  今後ロジックが2箇所に分岐しなくて済みます)。

import { NextRequest, NextResponse } from 'next/server';
import { buildPaymentRequirements, verifyAndSettleX402Payment } from '@/lib/x402';
import { createAttestation } from '@/lib/eas';
import { runPremiumAnalysisReport } from '@/lib/analysis';

export const maxDuration = 60;

const PAYOUT_ADDRESS = process.env.ANALYSIS_PAYOUT_ADDRESS as string;
const PRICE = '10000'; // $0.01 USDC (6 decimals)
const BUILDER_CODE_SUFFIX =
  '0x62635f31796177727064740b0080218021802180218021802180218021' as `0x${string}`;

type A2ATaskRequest = {
  skillId: string;
  input: { address?: string };
  // クライアントが x402 の X-PAYMENT ヘッダーとして送るはずのペイロードを
  // そのままJSONオブジェクトとしてbodyに含めたもの
  payment?: unknown;
};

export async function POST(req: NextRequest) {
  let body: A2ATaskRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (body.skillId !== 'premium-wallet-analysis') {
    return NextResponse.json(
      { error: 'unsupported skill for this endpoint (only premium-wallet-analysis)' },
      { status: 400 }
    );
  }

  const address = body.input?.address;
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'valid input.address is required' }, { status: 400 });
  }

  const resourceUrl = `https://${req.headers.get('host')}/api/a2a`;
  const requirements = buildPaymentRequirements({
    amount: PRICE,
    payTo: PAYOUT_ADDRESS,
    resource: resourceUrl,
    description: `Base Agent Kit - ウォレット詳細分析 ($0.01 USDC) for ${address} (via A2A)`,
  });

  // --- ステップ1: 支払いがまだ提出されていない場合 → payment-required ---
  if (!body.payment) {
    return NextResponse.json(
      {
        status: 'payment-required',
        x402Version: 1,
        accepted: [requirements],
        resource: resourceUrl,
        description: requirements.description,
      },
      { status: 402 }
    );
  }

  // --- ステップ2: 支払いが提出された → 既存のverify/settleをそのまま流用 ---
  // 既存の verifyAndSettleX402Payment は「base64エンコードされた文字列」を
  // 期待しているので(GETハンドラの req.headers.get('X-PAYMENT') と同じ形)、
  // body.payment (JSONオブジェクト) を同じ形式に変換してから渡す。
  const paymentHeader = Buffer.from(JSON.stringify(body.payment)).toString('base64');

  const settleResult = await verifyAndSettleX402Payment(paymentHeader, requirements, BUILDER_CODE_SUFFIX);
  if (!settleResult.ok) {
    return NextResponse.json(
      { status: 'payment-failed', reason: settleResult.reason },
      { status: 402 }
    );
  }

  // --- ステップ3: 決済完了 → 分析を実行してEAS attestationを発行 ---
  try {
    const analysis = await runPremiumAnalysisReport(address);

    await createAttestation(
      'premium_analysis',
      `Paid analysis via A2A for ${address} (tx: ${settleResult.txHash})`
    );

    return NextResponse.json({
      status: 'payment-completed',
      txHash: settleResult.txHash,
      result: { analysis },
    });
  } catch (error) {
    console.error('a2a premium-analysis error:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'unknown error' },
      { status: 500 }
    );
  }
}
