'use client';

import { useEffect, useState } from 'react';
import { configNow, isOnline, loadConfig, type RuntimeConfig } from './config';

export function useRuntimeConfig(): { config: RuntimeConfig; ready: boolean; online: boolean } {
  const [config, setConfig] = useState<RuntimeConfig>(configNow);
  const [ready, setReady] = useState(() => isOnline(configNow()));

  useEffect(() => {
    let live = true;
    void loadConfig().then((loaded) => {
      if (!live) return;
      setConfig(loaded);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  return { config, ready, online: isOnline(config) };
}
