// lib/x402PayingClient.ts
//
// 「買う側」機能: Base Agent Kit自身のrelayerウォレット(AGENT_PRIVATE_KEY)が、
// 他のx402対応エンドポイントに対して自律的にUSDC決済を行うための共通クライアント。
//
// GET専用(Base Shooter NFT向け)だった実装を、POST + JSONボディにも対応させた版。
// Minara AIのような外部の第三者サービス(POSTエンドポイント)にも対応する。

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

type PayOptions = {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
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
export async function payAndFetchX402(
  url: string,
  options: PayOptions = {}
): Promise<{ data: Record<string, unknown>; txHash: string | null }> {
  const account = getRelayerAccount();
  const method = options.method ?? 'GET';
  const body = options.body;

  const baseHeaders: Record<string, string> = body ? { 'Content-Type': 'application/json' } : {};
  const baseInit: RequestInit = {
    method,
    headers: baseHeaders,
    body: body ? JSON.stringify(body) : undefined,
  };

  // ステップ1: 支払いなしでリクエスト → 402が返るはず
  const res1 = await fetch(url, baseInit);
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
  const validAfter = Math.floor(Date.now() / 1000) - 300; // 時計のズレ・遅延の余裕を持たせる
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
    x402Version: 1,
    scheme: accepted.scheme,
    network: accepted.network,
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
  const res2 = await fetch(url, {
    method,
    headers: { ...baseHeaders, 'X-PAYMENT': paymentHeader },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res2.ok) {
    const errBody = await res2.json().catch(() => null);
    throw new Error(errBody?.reason || errBody?.error || `Payment failed with status ${res2.status}`);
  }
  const data = await res2.json();

  // txHashがレスポンスbodyになければ、X-PAYMENT-RESPONSEヘッダー(base64)から拾う
  let txHash: string | null = (data.txHash as string | undefined) ?? null;
  if (!txHash) {
    const payResponseHeader = res2.headers.get('X-PAYMENT-RESPONSE') ?? res2.headers.get('x-payment-response');
    if (payResponseHeader) {
      try {
        const decoded = JSON.parse(Buffer.from(payResponseHeader, 'base64').toString('utf-8'));
        txHash = decoded.txHash ?? decoded.transactionHash ?? null;
      } catch {
        // デコードできなければ諦める(致命的ではない)
      }
    }
  }

  return { data, txHash };
}
