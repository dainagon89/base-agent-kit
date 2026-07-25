// Aerodrome Finance (Base mainnet) - 公式コントラクトアドレス
// 出典: https://github.com/aerodrome-finance/contracts
export const AERODROME_ROUTER = '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43' as const;
export const AERODROME_POOL_FACTORY = '0x420DD381b31aEf6683db6B902084cB0FFECe40Da' as const;
export const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as const;

// Aerodromeは Route{from, to, stable, factory} の配列でスワップ経路を指定する
// (Uniswapのような単純なアドレス配列ではない、Solidly系DEX特有の仕様)
export const ROUTE_TUPLE = {
  type: 'tuple[]',
  components: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'stable', type: 'bool' },
    { name: 'factory', type: 'address' },
  ],
} as const;

export const AERODROME_ROUTER_ABI = [
  {
    type: 'function',
    name: 'swapExactETHForTokens',
    stateMutability: 'payable',
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'routes', ...ROUTE_TUPLE },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    type: 'function',
    name: 'getAmountsOut',
    stateMutability: 'view',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'routes', ...ROUTE_TUPLE },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const;

/** ETH(WETH) → 指定トークン の単一ホップRoute配列を作る */
export function buildEthToTokenRoute(tokenOutAddress: `0x${string}`) {
  return [
    {
      from: WETH_ADDRESS,
      to: tokenOutAddress,
      stable: false, // ETHペアは基本的にvolatile(変動)プール
      factory: AERODROME_POOL_FACTORY,
    },
  ] as const;
}
