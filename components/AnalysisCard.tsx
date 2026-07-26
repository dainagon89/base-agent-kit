'use client';

import { useState } from 'react';
import { useWalletClient } from 'wagmi';

interface Props {
  address: string;
}

export function AnalysisCard({ address }: Props) {
  const { data: walletClient } = useWalletClient();
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const handlePay = async () => {
    if (!walletClient) return;
    setLoading(true);
    setError(null);

    try {
      const url = `/api/premium-analysis?address=${address}`;
      const res1 = await fetch(url);
      if (res1.status !== 402) throw new Error('Unexpected response');
      const { accepts } = await res1.json();
      const req = accepts[0];

      const validAfter = Math.floor(Date.now() / 1000) - 1;
      const validBefore = Math.floor(Date.now() / 1000) + 600;
      const nonce = crypto.getRandomValues(new Uint8Array(32));
      const nonceHex = `0x${Array.from(nonce).map((b) => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;

      const signature = await walletClient.signTypedData({
        domain: {
          name: 'USD Coin',
          version: '2',
          chainId: 8453,
          verifyingContract: req.asset as `0x${string}`,
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
          from: walletClient.account.address,
          to: req.payTo as `0x${string}`,
          value: BigInt(req.maxAmountRequired),
          validAfter: BigInt(validAfter),
          validBefore: BigInt(validBefore),
          nonce: nonceHex,
        },
      });

      const payment = btoa(
        JSON.stringify({
          payload: {
            signature,
            authorization: {
              from: walletClient.account.address,
              to: req.payTo,
              value: req.maxAmountRequired,
              validAfter: String(validAfter),
              validBefore: String(validBefore),
              nonce: nonceHex,
            },
          },
        })
      );

      const res2 = await fetch(url, { headers: { 'X-PAYMENT': payment } });
      if (!res2.ok) {
        const errData = await res2.json().catch(() => null);
        throw new Error(errData?.reason || errData?.error || '決済の確認に失敗しました');
      }
      const data = await res2.json();
      setAnalysis(data.analysis);
      setTxHash(data.txHash);
    } catch (e) {
      setError(e instanceof Error ? e.message : '予期しないエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2 max-w-xs rounded-2xl border border-gray-700 bg-gray-900 p-4 text-sm">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-blue-400">
        プレミアム分析(x402)
      </p>
      <p className="mb-3 text-gray-300">
        対象: <span className="font-mono text-white">{address.slice(0, 6)}…{address.slice(-4)}</span>
      </p>

      {!analysis && (
        <button
          onClick={handlePay}
          disabled={loading}
          className="w-full rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? '分析中…' : '$0.01 USDCで詳細分析を受ける'}
        </button>
      )}

      {analysis && (
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-3 text-xs leading-relaxed text-gray-200 whitespace-pre-wrap">
          {analysis}
          {txHash && (
            <p className="mt-2 text-emerald-400">
              決済完了 ✓{' '}
              <a
                href={`https://basescan.org/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Basescanで見る
              </a>
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
