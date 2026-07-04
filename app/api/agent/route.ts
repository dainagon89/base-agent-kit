import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // 動的インポートでESMモジュールの問題を回避
    const { AgentKit, cdpApiActionProvider } = await import('@coinbase/agentkit');
    const { getLangChainTools } = await import('@coinbase/agentkit-langchain');
    const { ChatOpenAI } = await import('@langchain/openai');
    const { HumanMessage, SystemMessage } = await import('@langchain/core/messages');

    const agentkit = await AgentKit.from({
      cdpApiKeyId: process.env.CDP_API_KEY_ID!,
      cdpApiKeySecret: process.env.CDP_API_KEY_SECRET!,
      actionProviders: [cdpApiActionProvider()],
    });

    const tools = await getLangChainTools(agentkit);

    const model = new ChatOpenAI({
      model: 'gpt-4o-mini',
      temperature: 0,
      openAIApiKey: process.env.OPENAI_API_KEY!,
    });

    const modelWithTools = model.bindTools(tools);

    const systemPrompt = `あなたはBaseチェーン上で動く自律型AIエージェントです。
Baseエコシステムについての質問に答えたり、オンチェーンの情報を調べたりできます。
- Base Tap Rush: https://base-tap-rush-lilac.vercel.app
- Base Shooter NFT: https://base-shooter-nft.vercel.app
日本語で丁寧に答えてください。`;

    const response = await modelWithTools.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(message),
    ]);

    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    return NextResponse.json({ response: content });
  } catch (error) {
    console.error('Agent error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'エラーが発生しました' },
      { status: 500 }
    );
  }
}
