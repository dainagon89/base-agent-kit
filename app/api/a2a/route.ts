// app/api/a2a/route.ts
//
// A2A x402 拡張の簡易実装(仕様 v0.1 のペイメントフロー部分のみを移植)。
// 参照: https://github.com/google-agentic-commerce/a2a-x402/blob/main/spec/v0.1/spec.md
//
// この route は他のAIエージェントからの A2A タスクリクエストを受け付け、
// 有料スキル(premium-wallet-analysis)の場合は x402 の
// payment-required / payment-submitted / payment-completed
// の3段階フローを実装する。
//
// 決済の検証(EIP-712/EIP-3009 signature verify)と決済実行(relayerウォレット
// によるtransferWithAuthorization送信)は、既存の /api/premium-analysis で
// 使っている自前実装をそのまま import して使う想定。
// 関数名はプロジェクトの実装に合わせて書き換えてください。

import { NextRequest, NextResponse } from "next/server";
// TODO: 既存の x402 自前実装からimportする(ファイルパスは実際の配置に合わせる)
// import { verifyEip3009Payment, settlePaymentOnChain } from "@/lib/x402";
// import { runPremiumAnalysis } from "@/lib/premiumAnalysis";

const PAY_TO_ADDRESS = "0xe7e648582B323Aa7a57eE1490DD89fE05d5168A8";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PREMIUM_ANALYSIS_PRICE_USDC = "10000"; // 0.01 USDC = 10000 (6 decimals)

type A2ATaskRequest = {
  skillId: string;
  input: Record<string, unknown>;
  // 2回目以降の呼び出し(支払い提出時)に含まれる x402 payload
  payment?: {
    signature: string;
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
  };
};

export async function POST(req: NextRequest) {
  const body: A2ATaskRequest = await req.json();

  // 無料スキルはそのまま実行(既存の /api/token-price 等のロジックを呼ぶだけ)
  if (body.skillId !== "premium-wallet-analysis") {
    return NextResponse.json(
      { error: "unsupported skill for this endpoint, use free endpoints directly" },
      { status: 400 }
    );
  }

  // --- ステップ1: 支払いがまだ提出されていない場合 → payment-required を返す ---
  if (!body.payment) {
    return NextResponse.json(
      {
        status: "payment-required",
        x402Version: 1,
        accepted: [
          {
            scheme: "eip3009-transferWithAuthorization",
            network: "base",
            asset: USDC_ADDRESS,
            payTo: PAY_TO_ADDRESS,
            maxAmountRequired: PREMIUM_ANALYSIS_PRICE_USDC,
            // USDC on Base の EIP-712 domain name は "USD Coin"(BaseScan表示名の
            // "USDC" ではない点に注意 — ここを間違えると verify は通っても
            // execution reverted になる)
            eip712Domain: {
              name: "USD Coin",
              version: "2",
              chainId: 8453,
              verifyingContract: USDC_ADDRESS,
            },
            description: "Premium GPT-4o wallet analysis (0.01 USDC)",
          },
        ],
      },
      { status: 402 }
    );
  }

  // --- ステップ2: 支払いが提出された → 検証してオンチェーンでsettle ---
  try {
    // const verified = await verifyEip3009Payment(body.payment, {
    //   expectedTo: PAY_TO_ADDRESS,
    //   expectedValue: PREMIUM_ANALYSIS_PRICE_USDC,
    //   domainName: "USD Coin",
    // });
    // if (!verified) throw new Error("signature verification failed");
    //
    // const txHash = await settlePaymentOnChain(body.payment);

    const txHash = "0x_TODO_wire_up_settlePaymentOnChain";

    // --- ステップ3: 決済完了 → 実際のプレミアム分析を実行して結果を返す ---
    // const result = await runPremiumAnalysis(body.input.address as string);

    const result = { note: "TODO: call existing runPremiumAnalysis() here" };

    return NextResponse.json({
      status: "payment-completed",
      txHash,
      result,
    });
  } catch (err) {
    return NextResponse.json(
      { status: "payment-failed", error: (err as Error).message },
      { status: 402 }
    );
  }
}
