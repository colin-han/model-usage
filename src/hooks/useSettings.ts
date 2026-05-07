import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AppSettings } from '../types';

const DEFAULT_SETTINGS: AppSettings = {
  zhipuApiKey: '',
  deepseekApiKey: '',
  refreshIntervalSec: 120,
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<AppSettings>('load_settings')
      .then(s => setSettings({ ...DEFAULT_SETTINGS, ...s }))
      .catch(err => console.error('load_settings failed', err))
      .finally(() => setLoaded(true));
  }, []);

  const update = useCallback(async (next: AppSettings) => {
    await invoke('save_settings', { settings: next });
    setSettings(next);
  }, []);

  return { settings, loaded, update };
}
