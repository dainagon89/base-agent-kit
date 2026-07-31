// lib/x402PayingClient.ts
//
// 「買う側」機能: Base Agent Kit自身のrelayerウォレット(AGENT_PRIVATE_KEY)が、
// 他のx402対応エンドポイントに対して自律的にUSDC決済を行うための共通クライアント。
//
// 今までの実装(premium-analysis, a2a route)はすべて「ユーザーのウォレットが
// 署名し、Base Agent Kitが検証・settleする(売る側)」でしたが、これはその逆で
// 「Base Agent Kit自身が署名し、相手のサービスが検証・settleする(買う側)」。

import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';

type X402Accepted = {
  scheme: string;
  network: string;
  asset: string;
  payTo: string;
  // サービスによって項目名が揺れるため両対応にしておく
  amount?: string;
  maxAmountRequired?: string;
  extra?: { name?: string; version?: string };
  eip712Domain?: { name?: string; version?: string; chainId?: number; verifyingContract?: string };
};

function getRelayerAccount(): PrivateKeyAccount {
  const raw = process.env.AGENT_PRIVATE_KEY;
  if (!raw) throw new Error('AGENT_PRIVATE_KEY is not set');
  const pk = (raw.startsWith('0x') ? raw : `0x${raw}`) as `0x${string}`;
  return privateKeyToAccount(pk);
}

/**
 * 外部のx402対応エンドポイントに対して、Base Agent Kitのrelayerウォレットから
 * 自動的にUSDC決済(EIP-3009署名)を行い、レスポンスを取得する。
 *
 * 注意: relayerウォレット自身がUSDC残高を持っている必要がある
 * (ここではガス代ではなく、実際に送金されるUSDCそのものを負担する側になるため)。
 */
export async function payAndFetchX402(url: string): Promise<{ data: Record<string, unknown>; txHash: string }> {
  const account = getRelayerAccount();

  // ステップ1: 支払いなしでリクエスト → 402が返るはず
  const res1 = await fetch(url);
  if (res1.status !== 402) {
    throw new Error(`Expected 402 Payment Required, got ${res1.status}`);
  }
  const body1 = await res1.json();
  const accepted: X402Accepted = body1.accepts?.[0] ?? body1.accepted?.[0];
  if (!accepted) throw new Error('No payment requirements returned by server');

  const amount = accepted.maxAmountRequired ?? accepted.amount;
  if (!amount) throw new Error('Payment requirements missing amount');

  const domainName = accepted.eip712Domain?.name ?? accepted.extra?.name ?? 'USD Coin';
  const domainVersion = accepted.eip712Domain?.version ?? accepted.extra?.version ?? '2';
  const chainId = accepted.eip712Domain?.chainId ?? 8453;
  const verifyingContract = (accepted.eip712Domain?.verifyingContract ?? accepted.asset) as `0x${string}`;

  // ステップ2: relayerウォレット自身の鍵でEIP-3009署名を生成
  // (ユーザーの操作は不要。エージェントが自律的に支払いに同意する)
  const validAfter = Math.floor(Date.now() / 1000) - 300; // 5分前(時計のズレ・ネットワーク遅延の余裕を持たせる)
  const validBefore = Math.floor(Date.now() / 1000) + 600;
  const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = `0x${Array.from(nonceBytes).map((b) => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;

  const signature = await account.signTypedData({
    domain: {
      name: domainName,
      version: domainVersion,
      chainId,
      verifyingContract,
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: {
      from: account.address,
      to: accepted.payTo as `0x${string}`,
      value: BigInt(amount),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce,
    },
  });

  const payment = {
    payload: {
      signature,
      authorization: {
        from: account.address,
        to: accepted.payTo,
        value: amount,
        validAfter: String(validAfter),
        validBefore: String(validBefore),
        nonce,
      },
    },
  };
  const paymentHeader = Buffer.from(JSON.stringify(payment)).toString('base64');

  // ステップ3: 署名込みで再送 → 相手サービス側がverify/settleを実行する
  const res2 = await fetch(url, { headers: { 'X-PAYMENT': paymentHeader } });
  if (!res2.ok) {
    const errBody = await res2.json().catch(() => null);
    throw new Error(errBody?.reason || errBody?.error || `Payment failed with status ${res2.status}`);
  }
  const data = await res2.json();
  return { data, txHash: data.txHash };
}
