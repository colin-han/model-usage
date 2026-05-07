import { useEffect, useState, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface TitleBarProps {
  onRefresh: () => void;
  onOpenSettings: () => void;
  loading: boolean;
}

export function TitleBar({ onRefresh, onOpenSettings, loading }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const window = getCurrentWindow();

    const checkMaximized = async () => {
      const maximized = await window.isMaximized();
      setIsMaximized(maximized);
    };
    checkMaximized();

    // 监听窗口大小变化
    const unlisten = window.onResized(() => {
      checkMaximized();
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const handleMinimize = useCallback(async () => {
    await getCurrentWindow().minimize();
  }, []);

  const handleMaximize = useCallback(async () => {
    const window = getCurrentWindow();
    if (await window.isMaximized()) {
      await window.unmaximize();
      setIsMaximized(false);
    } else {
      await window.maximize();
      setIsMaximized(true);
    }
  }, []);

  const handleClose = useCallback(async () => {
    await getCurrentWindow().close();
  }, []);

  return (
    <div
      className="h-10 flex items-center justify-between px-3"
      data-tauri-drag-region
    >
      {/* 左侧：红绿灯按钮 */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleClose}
          className="w-3 h-3 rounded-full bg-[#ff5f57] hover:bg-[#ff5f57]/80 flex items-center justify-center transition-colors"
          aria-label="关闭"
        >
          <svg className="w-2 h-2 opacity-0 hover:opacity-100" viewBox="0 0 8 8">
            <path d="M1 1L7 7M7 1L1 7" stroke="#4a0000" strokeWidth="1" fill="none" />
          </svg>
        </button>
        <button
          onClick={handleMinimize}
          className="w-3 h-3 rounded-full bg-[#febc2e] hover:bg-[#febc2e]/80 flex items-center justify-center transition-colors"
          aria-label="最小化"
        >
          <svg className="w-2 h-2 opacity-0 hover:opacity-100" viewBox="0 0 8 8">
            <path d="M1 4H7" stroke="#995700" strokeWidth="1" fill="none" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="w-3 h-3 rounded-full bg-[#28c840] hover:bg-[#28c840]/80 flex items-center justify-center transition-colors"
          aria-label="最大化"
        >
          <svg className="w-2 h-2 opacity-0 hover:opacity-100" viewBox="0 0 8 8">
            {isMaximized ? (
              <path d="M2 3H5V6M3 2V5H6V2H3Z" stroke="#006500" strokeWidth="1" fill="none" />
            ) : (
              <path d="M2 2H6V6H2Z" stroke="#006500" strokeWidth="1" fill="none" />
            )}
          </svg>
        </button>
      </div>

      {/* 中间：标题 */}
      <span
        className="text-xs font-medium text-white/80 pointer-events-none select-none"
        data-tauri-drag-region
      >
        AI Coding Plan Monitor
      </span>

      {/* 右侧：设置 + 刷新按钮 */}
      <div className="flex items-center gap-1">
        <button
          onClick={onOpenSettings}
          className="w-7 h-7 rounded-md flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all"
          aria-label="设置"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="w-7 h-7 rounded-md flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all disabled:opacity-50"
          aria-label="刷新"
        >
        <svg
          className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        </button>
      </div>
    </div>
  );
}
