import { NextRequest, NextResponse } from 'next/server';
import { AgentKit, cdpApiActionProvider } from '@coinbase/agentkit';
import { getLangChainTools } from '@coinbase/agentkit-langchain';
import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

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

    const agent = createReactAgent({ llm: model, tools });

    const result = await agent.invoke({
      messages: [
        new SystemMessage(`あなたはBaseチェーン上で動く自律型AIエージェントです。
Baseエコシステムについての質問に答えたり、オンチェーンの情報を調べたりできます。
- Base Tap Rush: https://base-tap-rush-lilac.vercel.app
- Base Shooter NFT: https://base-shooter-nft.vercel.app
日本語で丁寧に答えてください。`),
        new HumanMessage(message),
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
      { error: error instanceof Error ? error.message : 'エラーが発生しました' },
      { status: 500 }
    );
  }
}
