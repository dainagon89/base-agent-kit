'use client';

import { useEffect, useState } from 'react';
import { encodeFunctionData, parseUnits } from 'viem';
import { useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
// import { BUILDER_CODE_DATA_SUFFIX } from '@/lib/builderCode'; // 一時的に無効化(デバッグ中)

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;
const USDC_DECIMALS = 6;

const ERC20_TRANSFER_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

interface Props {
  to: string;
  amount: string;
}

export function TransferCard({ to, amount }: Props) {
  const [logged, setLogged] = useState(false);
  const { data: hash, sendTransaction, isPending, error } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isConfirmed && hash && !logged) {
      setLogged(true);
      fetch('/api/log-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, amount, txHash: hash }),
      }).catch((err) => console.error('log-transfer error:', err));
    }
  }, [isConfirmed, hash, logged, to, amount]);

  const handleSend = () => {
    // ⚠️ ここでウォレット(MetaMask/Rabby等)のポップアップが開き、
    //    ユーザー自身の署名でオンチェーン送金が実行される。
    //    サーバーは一切資金を扱わない(非カストディアル)。
    const callData = encodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      functionName: 'transfer',
      args: [to as `0x${string}`, parseUnits(amount, USDC_DECIMALS)],
    });

    sendTransaction({
      to: USDC_ADDRESS,
      data: callData, // ⚠️ デバッグのため一時的にBuilder Codeを外しています
    });
  };

  return (
    <div className="mt-2 max-w-xs rounded-2xl border border-gray-700 bg-gray-900 p-4 text-sm">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-blue-400">
        USDC送金の確認
      </p>
      <p className="mb-1 text-gray-300">
        宛先: <span className="font-mono text-white">{to.slice(0, 6)}…{to.slice(-4)}</span>
      </p>
      <p className="mb-3 text-gray-300">
        金額: <span className="font-semibold text-white">{amount} USDC</span>
      </p>

      {!hash && (
        <button
          onClick={handleSend}
          disabled={isPending}
          className="w-full rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {isPending ? 'ウォレットで署名中…' : '送金する(ウォレットで署名)'}
        </button>
      )}

      {hash && (
        <p className="text-xs">
          {isConfirming && <span className="text-gray-400">トランザクション確認中…</span>}
          {isConfirmed && (
            <span className="text-emerald-400">
              送金完了 ✓{' '}
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

      {error && <p className="mt-2 text-xs text-red-400">送金に失敗しました: {error.message}</p>}
    </div>
  );
}
