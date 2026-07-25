'use client';

import { useEffect, useState } from 'react';
import { encodeFunctionData, concat, parseEther } from 'viem';
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { BUILDER_CODE_DATA_SUFFIX } from '@/lib/builderCode';
import { AERODROME_ROUTER, AERODROME_ROUTER_ABI, buildEthToTokenRoute } from '@/lib/aerodrome';

interface Props {
  amountInEth: string;
  tokenOutSymbol: string;
  tokenOutAddress: string;
  quoteAmountOut: string;
  amountOutMin: string;
}

export function SwapCard({ amountInEth, tokenOutSymbol, tokenOutAddress, quoteAmountOut, amountOutMin }: Props) {
  const { address } = useAccount();
  const [logged, setLogged] = useState(false);
  const { data: hash, sendTransaction, isPending, error } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isConfirmed && hash && !logged) {
      setLogged(true);
      fetch('/api/log-swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountInEth, tokenOutSymbol, txHash: hash }),
      }).catch((err) => console.error('log-swap error:', err));
    }
  }, [isConfirmed, hash, logged, amountInEth, tokenOutSymbol]);

  const handleSwap = () => {
    if (!address) return;

    // ⚠️ ここでウォレット(MetaMask/Rabby等)のポップアップが開き、
    //    ユーザー自身の署名でAerodromeのRouterに直接オンチェーン送信される。
    //    サーバーは一切資金を扱わない(非カストディアル)。
    const routes = buildEthToTokenRoute(tokenOutAddress as `0x${string}`);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600); // 10分間有効

    const callData = encodeFunctionData({
      abi: AERODROME_ROUTER_ABI,
      functionName: 'swapExactETHForTokens',
      args: [BigInt(amountOutMin), routes, address, deadline],
    });

    sendTransaction({
      to: AERODROME_ROUTER,
      value: parseEther(amountInEth),
      data: concat([callData, BUILDER_CODE_DATA_SUFFIX]),
    });
  };

  return (
    <div className="mt-2 max-w-xs rounded-2xl border border-gray-700 bg-gray-900 p-4 text-sm">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-blue-400">
        Aerodromeスワップの確認
      </p>
      <p className="mb-1 text-gray-300">
        支払い: <span className="font-semibold text-white">{amountInEth} ETH</span>
      </p>
      <p className="mb-1 text-gray-300">
        受取(概算): <span className="font-semibold text-white">約 {parseFloat(quoteAmountOut).toFixed(4)} {tokenOutSymbol}</span>
      </p>
      <p className="mb-3 text-xs text-gray-500">スリッページ許容: 3%</p>

      {!hash && (
        <button
          onClick={handleSwap}
          disabled={isPending}
          className="w-full rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {isPending ? 'ウォレットで署名中…' : 'スワップする(ウォレットで署名)'}
        </button>
      )}

      {hash && (
        <p className="text-xs">
          {isConfirming && <span className="text-gray-400">トランザクション確認中…</span>}
          {isConfirmed && (
            <span className="text-emerald-400">
              スワップ完了 ✓{' '}
              <a
                href={`https://basescan.org/tx/${hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Basescanで見る
              </a>
            </span>
          )}
        </p>
      )}

      {error && <p className="mt-2 text-xs text-red-400">スワップに失敗しました: {error.message}</p>}
    </div>
  );
}
