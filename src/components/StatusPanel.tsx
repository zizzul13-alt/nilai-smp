import type { PropsWithChildren } from 'react';

type Props = PropsWithChildren<{
  title: string;
  tone?: 'neutral' | 'error';
}>;

export function StatusPanel({ title, tone = 'neutral', children }: Props) {
  return (
    <section className={`status-panel status-panel--${tone}`} aria-live={tone === 'error' ? 'assertive' : 'polite'}>
      <h1>{title}</h1>
      <div>{children}</div>
    </section>
  );
}
