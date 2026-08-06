// app/api/agent-buys/minara-swap-intent/route.ts
//
// デモ用エンドポイント: Base Agent Kit自身が「買う側」として、
// 完全に外部・無関係の第三者サービス(Minara AI)のx402対応エンドポイントに
// relayerウォレットから自動で支払い、結果を取得する。
//
// Base Shooter NFTの例(自分のエコシステム内)とは違い、こちらは本当の
// 第三者との自律的なエージェント間商取引の実例になる。

import { NextRequest, NextResponse } from 'next/server';
import { payAndFetchX402 } from '@/lib/x402PayingClient';
import { createAttestation } from '@/lib/eas';

export const maxDuration = 60;

const MINARA_URL = 'https://x402.minara.ai/x402/intent-to-swap-tx';
// relayerウォレット自身のアドレス(スワップ結果の受取先として渡す)
const DEFAULT_WALLET_ADDRESS = '0xe7e648582B323Aa7a57eE1490DD89fE05d5168A8';

export async function GET(req: NextRequest) {
  try {
    const intent = req.nextUrl.searchParams.get('intent') || 'swap 0.1 ETH to USDC';
    const walletAddress = req.nextUrl.searchParams.get('walletAddress') || DEFAULT_WALLET_ADDRESS;
    const chain = req.nextUrl.searchParams.get('chain') || 'base';

    const { data, txHash } = await payAndFetchX402(MINARA_URL, {
      method: 'POST',
      body: { intent, walletAddress, chain },
    });

    await createAttestation(
      'agent_to_agent_payment',
      `Base Agent Kit paid Minara AI intent-to-swap-tx endpoint (tx: ${txHash ?? 'n/a'})`
    );

    return NextResponse.json({
      paidTo: 'Minara AI (/x402/intent-to-swap-tx)',
      amountPaid: '$0.10 USDC',
      txHash,
      result: data,
    });
  } catch (error) {
    console.error('agent-buys/minara-swap-intent error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'unknown error' },
      { status: 500 }
    );
  }
}
