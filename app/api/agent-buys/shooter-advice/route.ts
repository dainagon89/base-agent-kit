// app/api/agent-buys/shooter-advice/route.ts
//
// デモ用エンドポイント: Base Agent Kit自身が「買う側」として、
// Base Shooter NFTのx402 AIアドバイスエンドポイント($0.001 USDC)に
// relayerウォレットから自動で支払い、結果を取得する。
//
// これがA2A商取引の「フェーズ2」— エージェントが別のエージェント/サービスに
// 自律的に対価を払う実例です。

import { NextRequest, NextResponse } from 'next/server';
import { payAndFetchX402 } from '@/lib/x402PayingClient';
import { createAttestation } from '@/lib/eas';

export const maxDuration = 60;

const SHOOTER_ADVICE_URL = 'https://base-shooter-nft.vercel.app/api/advice';

export async function GET(req: NextRequest) {
  try {
    const score = req.nextUrl.searchParams.get('score') || '0';
    const url = `${SHOOTER_ADVICE_URL}?score=${score}`;

    const { data, txHash } = await payAndFetchX402(url);

    await createAttestation(
      'agent_to_agent_payment',
      `Base Agent Kit paid Base Shooter NFT advice endpoint (tx: ${txHash})`
    );

    return NextResponse.json({
      paidTo: 'Base Shooter NFT (/api/advice)',
      amountPaid: '$0.001 USDC',
      txHash,
      result: data,
    });
  } catch (error) {
    console.error('agent-buys/shooter-advice error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'unknown error' },
      { status: 500 }
    );
  }
}
