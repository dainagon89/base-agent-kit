import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Base Agent',
  description: 'Baseチェーン上で動く自律型AIエージェント',
  other: {
    'base:app_id': '6a48e19b95ca1d5df06c43b0',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
