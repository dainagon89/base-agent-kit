import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Base Agent',
  description: 'Baseチェーン上で動く自律型AIエージェント',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
