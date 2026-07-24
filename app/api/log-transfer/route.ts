import { NextRequest, NextResponse } from 'next/server';
import { createAttestation } from '@/lib/eas';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { to, amount, txHash } = await req.json();
    if (!to || !amount || !txHash) {
      return NextResponse.json({ error: 'to, amount, txHash is required' }, { status: 400 });
    }

    const summary = `USDC transfer: ${amount} to ${to} (tx: ${txHash})`;
    const attestationHash = await createAttestation('usdc_transfer', summary);

    return NextResponse.json({ attestationHash: attestationHash || undefined });
  } catch (error) {
    console.error('log-transfer error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'エラーが発生しました' },
      { status: 500 }
    );
  }
}
