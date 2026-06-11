import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { ZhipuCard } from './components/ZhipuCard';
import { DeepSeekCard } from './components/DeepSeekCard';
import { VolcengineCard } from './components/VolcengineCard';
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
  const contentRef = useRef<HTMLDivElement>(null);

  // 窗口高度跟随内容自适应：监听卡片区域实际高度，变化时调整窗口尺寸
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const win = getCurrentWindow();
    let frame = 0;

    const resizeToContent = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const mainEl = el.parentElement;
        if (!mainEl) return;
        // 内容高度 + main 上下内边距 + 标题栏高度
        const contentHeight = el.offsetHeight + 32 + mainEl.offsetTop;
        const maxHeight = window.screen.availHeight - 40;
        const height = Math.min(Math.max(contentHeight, 200), maxHeight);
        win.setSize(new LogicalSize(window.innerWidth, height)).catch(err => {
          console.error('调整窗口大小失败', err);
        });
      });
    };

    const observer = new ResizeObserver(resizeToContent);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  // 卡片 loading 条件：首次数据尚未返回，或上次获取失败且正在重新加载
  const isFirstLoad = data.lastUpdated === null;
  const cardLoading = (cardError: string | null) =>
    isFirstLoad || (loading && cardError !== null);

  return (
    <div className="min-h-screen flex flex-col animated-gradient">
      <TitleBar
        onRefresh={refresh}
        onOpenSettings={() => setSettingsOpen(true)}
        loading={loading}
      />

      <main className="flex-1 p-4 overflow-auto">
        <div ref={contentRef}>
        {data.error && (
          <div className="glass-error px-4 py-3 rounded-xl mb-4 text-sm">
            {data.error}
          </div>
        )}

        {settings.showClaudeCode && (
          <ClaudeCodeCard
            data={data.claudeCode}
            error={data.claudeCodeError}
            loading={cardLoading(data.claudeCodeError)}
          />
        )}
        {settings.showZhipu && (
          <ZhipuCard
            data={data.zhipu}
            error={data.zhipuError}
            loading={cardLoading(data.zhipuError)}
          />
        )}
        {(settings.showDeepseek || settings.showVolcengine) && (
          <div
            className={`grid gap-4 mb-4 ${
              settings.showDeepseek && settings.showVolcengine ? 'grid-cols-2' : 'grid-cols-1'
            }`}
          >
            {settings.showDeepseek && (
              <DeepSeekCard
                data={data.deepseek}
                error={data.deepseekError}
                loading={cardLoading(data.deepseekError)}
              />
            )}
            {settings.showVolcengine && (
              <VolcengineCard
                data={data.volcengine}
                error={data.volcengineError}
                loading={cardLoading(data.volcengineError)}
              />
            )}
          </div>
        )}
        {settings.showDiskUsage && (
          <DiskUsageCard
            data={data.diskUsage}
            error={data.diskUsageError}
            loading={cardLoading(data.diskUsageError)}
          />
        )}
        </div>
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
