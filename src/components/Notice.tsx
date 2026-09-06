import type { ReactNode } from 'react';

export function Notice({
  tone = 'info',
  children,
  action,
}: {
  tone?: 'info' | 'caution' | 'error';
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="notice" data-tone={tone}>
      <p>{children}</p>
      {action ? <div className="actions">{action}</div> : null}
    </div>
  );
}
