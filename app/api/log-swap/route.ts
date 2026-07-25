import { NextRequest, NextResponse } from 'next/server';
import { createAttestation } from '@/lib/eas';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { amountInEth, tokenOutSymbol, txHash } = await req.json();
    if (!amountInEth || !tokenOutSymbol || !txHash) {
      return NextResponse.json({ error: 'amountInEth, tokenOutSymbol, txHash is required' }, { status: 400 });
    }

    const summary = `Aerodrome swap: ${amountInEth} ETH -> ${tokenOutSymbol} (tx: ${txHash})`;
    const attestationHash = await createAttestation('aerodrome_swap', summary);

    return NextResponse.json({ attestationHash: attestationHash || undefined });
  } catch (error) {
    console.error('log-swap error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'エラーが発生しました' },
      { status: 500 }
    );
  }
}
