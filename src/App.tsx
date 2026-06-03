import { useState } from 'react';
import { ZhipuCard } from './components/ZhipuCard';
import { DeepSeekCard } from './components/DeepSeekCard';
import { ClaudeCodeCard } from './components/ClaudeCodeCard';
import { DiskUsageCard } from './components/DiskUsageCard';
import { TitleBar } from './components/TitleBar';
import { SettingsModal } from './components/SettingsModal';
import { useUsageData } from './hooks/useUsageData';
import { useSettings } from './hooks/useSettings';

function App() {
  const { settings, loaded, update } = useSettings();
  const { data, loading, refresh } = useUsageData(settings, loaded);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col animated-gradient">
      <TitleBar
        onRefresh={refresh}
        onOpenSettings={() => setSettingsOpen(true)}
        loading={loading}
      />

      <main className="flex-1 p-4 overflow-auto">
        {data.error && (
          <div className="glass-error px-4 py-3 rounded-xl mb-4 text-sm">
            {data.error}
          </div>
        )}

        <ClaudeCodeCard data={data.claudeCode} error={data.claudeCodeError} />
        <ZhipuCard data={data.zhipu} error={data.zhipuError} />
        <DeepSeekCard data={data.deepseek} error={data.deepseekError} />
        <DiskUsageCard data={data.diskUsage} error={data.diskUsageError} />
      </main>

      <SettingsModal
        open={settingsOpen}
        initial={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={update}
      />
    </div>
  );
}

export default App;
