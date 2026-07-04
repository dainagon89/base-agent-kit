import { NextRequest, NextResponse } from 'next/server';
import { CdpWalletProvider } from '@coinbase/agentkit';
import { getLangChainTools } from '@coinbase/agentkit-langchain';
import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from 'langchain/agents';
import { AgentKit } from '@coinbase/agentkit';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // CDPウォレットプロバイダーの初期化
    const walletProvider = await CdpWalletProvider.configureWithWallet({
      apiKeyId: process.env.CDP_API_KEY_ID!,
      apiKeySecret: process.env.CDP_API_KEY_SECRET!,
      networkId: 'base-mainnet',
    });

    // AgentKitの初期化
    const agentkit = await AgentKit.from({
      walletProvider,
    });

    // LangChainツールの取得
    const tools = await getLangChainTools(agentkit);

    // OpenAIモデルの初期化
    const model = new ChatOpenAI({
      model: 'gpt-4o-mini',
      temperature: 0,
      openAIApiKey: process.env.OPENAI_API_KEY!,
    });

    // Reactエージェントの作成
    const agent = createReactAgent({
      llm: model,
      tools,
    });

    // エージェントの実行
    const systemPrompt = `あなたはBaseチェーン上で動く自律型AIエージェントです。
Baseエコシステムについての質問に答えたり、オンチェーンの情報を調べたりできます。
以下のアプリについても詳しいです:
- Base Tap Rush: https://base-tap-rush-lilac.vercel.app (ハイスコアをオンチェーンに記録するゲーム)
- Base Shooter NFT: https://base-shooter-nft.vercel.app (スコアに応じたNFTをミントできるシューティングゲーム)
日本語で丁寧に答えてください。`;

    const result = await agent.invoke({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
    });

    const lastMessage = result.messages[result.messages.length - 1];
    const response = typeof lastMessage.content === 'string'
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);

    return NextResponse.json({ response });
  } catch (error) {
    console.error('Agent error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'エージェントでエラーが発生しました' },
      { status: 500 }
    );
  }
}
