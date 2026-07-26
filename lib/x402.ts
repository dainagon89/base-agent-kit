import {
  createPublicClient,
  createWalletClient,
  http,
  verifyTypedData,
  encodeFunctionData,
  concat,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

const USDC_ABI = [
  {
    type: 'function',
    name: 'transferWithAuthorization',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'authorizationState',
    stateMutability: 'view',
    inputs: [
      { name: 'authorizer', type: 'address' },
      { name: 'nonce', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

function splitSignature(signature: `0x${string}`) {
  const hex = signature.slice(2);
  const r = `0x${hex.slice(0, 64)}` as `0x${string}`;
  const s = `0x${hex.slice(64, 128)}` as `0x${string}`;
  let v = parseInt(hex.slice(128, 130), 16);
  if (v < 27) v += 27;
  return { r, s, v };
}

export interface X402PaymentRequirements {
  scheme: 'exact';
  network: string;
  asset: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
}

export function buildPaymentRequirements(opts: {
  amount: string;
  payTo: string;
  resource: string;
  description: string;
}): X402PaymentRequirements {
  return {
    scheme: 'exact',
    network: 'eip155:8453',
    asset: USDC_BASE,
    maxAmountRequired: opts.amount,
    resource: opts.resource,
    description: opts.description,
    mimeType: 'application/json',
    payTo: opts.payTo,
    maxTimeoutSeconds: 600,
    extra: { name: 'USD Coin', version: '2' },
  };
}

/**
 * X-PAYMENT ヘッダーを検証し、正しければ自前のリレーウォレットで
 * オンチェーン決済(transferWithAuthorization)を実行する。
 * CDP facilitatorには一切依存しない(Base Shooter NFTで実証済みの方式)。
 */
export async function verifyAndSettleX402Payment(
  paymentHeader: string,
  requirements: X402PaymentRequirements,
  builderCodeSuffix: `0x${string}`
): Promise<{ ok: true; txHash: string } | { ok: false; reason: string }> {
  let payload;
  try {
    payload = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf-8'));
  } catch {
    return { ok: false, reason: 'invalid_payment_header' };
  }

  const { signature, authorization } = payload.payload ?? payload;
  if (!signature || !authorization) return { ok: false, reason: 'malformed_payload' };

  const from = authorization.from as `0x${string}`;
  const to = authorization.to as `0x${string}`;
  const value = BigInt(authorization.value);
  const validAfter = BigInt(authorization.validAfter);
  const validBefore = BigInt(authorization.validBefore);
  const nonce = authorization.nonce as `0x${string}`;

  if (to.toLowerCase() !== requirements.payTo.toLowerCase()) {
    return { ok: false, reason: 'wrong_recipient' };
  }
  if (value < BigInt(requirements.maxAmountRequired)) {
    return { ok: false, reason: 'insufficient_amount' };
  }
  if (from.toLowerCase() === to.toLowerCase()) {
    return { ok: false, reason: 'self_send_not_allowed' };
  }
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  if (nowSec < validAfter || nowSec > validBefore) {
    return { ok: false, reason: 'authorization_expired' };
  }

  const isValidSignature = await verifyTypedData({
    address: from,
    domain: {
      name: 'USD Coin',
      version: '2',
      chainId: 8453,
      verifyingContract: USDC_BASE,
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
    message: { from, to, value, validAfter, validBefore, nonce },
    signature: signature as `0x${string}`,
  });

  if (!isValidSignature) return { ok: false, reason: 'invalid_signature' };

  const relayerPrivateKey = process.env.AGENT_PRIVATE_KEY as string;
  const formattedKey = relayerPrivateKey.startsWith('0x') ? relayerPrivateKey : `0x${relayerPrivateKey}`;
  const account = privateKeyToAccount(formattedKey as `0x${string}`);

  const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: base, transport: http(RPC_URL) });

  const alreadyUsed = await publicClient.readContract({
    address: USDC_BASE,
    abi: USDC_ABI,
    functionName: 'authorizationState',
    args: [from, nonce],
  });
  if (alreadyUsed) return { ok: false, reason: 'nonce_already_used' };

  const { r, s, v } = splitSignature(signature as `0x${string}`);

  const callData = encodeFunctionData({
    abi: USDC_ABI,
    functionName: 'transferWithAuthorization',
    args: [from, to, value, validAfter, validBefore, nonce, v, r, s],
  });

  const txHash = await walletClient.sendTransaction({
    to: USDC_BASE,
    data: concat([callData, builderCodeSuffix]),
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 30_000 });
  if (receipt.status !== 'success') {
    return { ok: false, reason: 'transaction_reverted' };
  }

  return { ok: true, txHash };
}
