import { useEffect, useState } from 'react';
import type { AppSettings } from '../types';

interface SettingsModalProps {
  open: boolean;
  initial: AppSettings;
  onClose: () => void;
  onSave: (next: AppSettings) => Promise<void>;
}

export function SettingsModal({ open, initial, onClose, onSave }: SettingsModalProps) {
  const [zhipu, setZhipu] = useState(initial.zhipuApiKey);
  const [deepseek, setDeepseek] = useState(initial.deepseekApiKey);
  const [interval, setIntervalSec] = useState(initial.refreshIntervalSec);
  const [proxyUrl, setProxyUrl] = useState(initial.proxyUrl);
  const [noProxyDns, setNoProxyDns] = useState(initial.noProxyDns.join('\n'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setZhipu(initial.zhipuApiKey);
      setDeepseek(initial.deepseekApiKey);
      setIntervalSec(initial.refreshIntervalSec);
      setProxyUrl(initial.proxyUrl);
      setNoProxyDns(initial.noProxyDns.join('\n'));
      setError(null);
    }
  }, [open, initial]);

  if (!open) return null;

  const handleSave = async () => {
    if (interval < 30) {
      setError('刷新间隔不能小于 30 秒');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const dnsList = noProxyDns
        .split(/[\n,]/)
        .map(s => s.trim())
        .filter(Boolean);
      await onSave({
        zhipuApiKey: zhipu.trim(),
        deepseekApiKey: deepseek.trim(),
        refreshIntervalSec: interval,
        proxyUrl: proxyUrl.trim(),
        noProxyDns: dnsList,
      });
      onClose();
    } catch (err) {
      const msg = typeof err === 'string' ? err : err instanceof Error ? err.message : '保存失败';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-card p-5 w-[420px] max-w-[90vw]"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-white/90 mb-4">设置</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-sm text-white/70 mb-1">智谱 API Key</label>
            <input
              type="password"
              value={zhipu}
              onChange={e => setZhipu(e.target.value)}
              placeholder="留空则不启用智谱卡片"
              className="w-full px-3 py-2 rounded-md bg-white/10 border border-white/15 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:border-white/40"
            />
          </div>

          <div>
            <label className="block text-sm text-white/70 mb-1">DeepSeek API Key</label>
            <input
              type="password"
              value={deepseek}
              onChange={e => setDeepseek(e.target.value)}
              placeholder="留空则不启用 DeepSeek 卡片"
              className="w-full px-3 py-2 rounded-md bg-white/10 border border-white/15 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:border-white/40"
            />
          </div>

          <div>
            <label className="block text-sm text-white/70 mb-1">刷新间隔 (秒)</label>
            <input
              type="number"
              min={30}
              value={interval}
              onChange={e => setIntervalSec(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-md bg-white/10 border border-white/15 text-sm text-white/90 focus:outline-none focus:border-white/40"
            />
            <p className="text-[11px] text-white/40 mt-1">
              建议 ≥ 120 秒，避免触发 Anthropic /api/oauth/usage 限流
            </p>
          </div>

          <div>
            <label className="block text-sm text-white/70 mb-1">代理地址</label>
            <input
              type="text"
              value={proxyUrl}
              onChange={e => setProxyUrl(e.target.value)}
              placeholder="留空则始终直连"
              className="w-full px-3 py-2 rounded-md bg-white/10 border border-white/15 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:border-white/40"
            />
          </div>

          <div>
            <label className="block text-sm text-white/70 mb-1">免代理 DNS（每行或逗号分隔）</label>
            <textarea
              value={noProxyDns}
              onChange={e => setNoProxyDns(e.target.value)}
              rows={2}
              placeholder="172.20.5.1"
              className="w-full px-3 py-2 rounded-md bg-white/10 border border-white/15 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:border-white/40 resize-y"
            />
            <p className="text-[11px] text-white/40 mt-1">
              当前 DNS 命中此列表则直连访问 Anthropic，否则走代理
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-3 px-3 py-2 rounded-md bg-red-500/20 text-red-100 text-xs">{error}</div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm text-white/70 hover:bg-white/10 transition"
            disabled={saving}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 rounded-md text-sm bg-white/15 text-white hover:bg-white/25 transition disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
