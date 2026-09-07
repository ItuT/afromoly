'use client';

import { useEffect, useRef } from 'react';
import type { LogLine } from '@/lib/useGame';

/** The narrated log, for the 3D view where the board has no centre well. */
export function LogPanel({ log }: { log: LogLine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const lastId = log.at(-1)?.id ?? 0;
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  return (
    <div className="panel">
      <h2>At the rank</h2>
      <div className="log" ref={ref} style={{ maxHeight: 260 }}>
        {log.slice(-60).map((line) => (
          <div key={line.id} className={`entry ${line.tone}`}>{line.text}</div>
        ))}
      </div>
    </div>
  );
}
