'use client';

import { useState } from 'react';

interface Message {
  role: 'user' | 'agent';
  content: string;
}

export default function Page() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'agent',
      content: 'こんにちは！Baseチェーンの自律型AIエージェントです。Baseエコシステムについての質問や、オンチェーンの情報を調べることができます。何でも聞いてください。',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: 'agent',
          content: data.response || data.error || 'エラーが発生しました',
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'agent', content: 'エラーが発生しました。もう一度お試しください。' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-10">
      <header className="mb-8">
        <p className="font-mono text-[11px] uppercase tracking-widest text-blue-500">
          on base
        </p>
        <h1 className="text-2xl font-bold text-white">Base Agent</h1>
        <p className="mt-1 text-sm text-gray-400">
          Baseチェーン上で動く自律型AIエージェント
        </p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-700 bg-gray-900 text-gray-200'
              }`}
            >
              {msg.role === 'agent' && (
                <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-blue-400">
                  Base Agent
                </p>
              )}
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-blue-400">
                Base Agent
              </p>
              <p className="text-sm text-gray-400">考え中…</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Baseについて何でも聞いてください..."
          className="flex-1 rounded-full border border-gray-700 bg-gray-900 px-5 py-3 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500"
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          className="rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
        >
          送信
        </button>
      </div>

      <footer className="mt-6 text-center text-[11px] text-gray-600">
        Powered by Coinbase AgentKit + OpenAI on Base Mainnet
      </footer>
    </main>
  );
}
