import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppSettings } from '../types';

interface SettingsModalProps {
  open: boolean;
  initial: AppSettings;
  onClose: () => void;
  onSave: (next: AppSettings) => Promise<void>;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors ${
        checked ? 'bg-emerald-400/70' : 'bg-white/15'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : ''
        }`}
      />
    </button>
  );
}

interface SettingGroupProps {
  title: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children?: ReactNode;
}

function SettingGroup({ title, enabled, onToggle, children }: SettingGroupProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white/80">{title}</span>
        <Toggle checked={enabled} onChange={onToggle} />
      </div>
      {enabled && children && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  );
}

const inputClass =
  'w-full px-3 py-2 rounded-md bg-white/10 border border-white/15 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:border-white/40';

export function SettingsModal({ open, initial, onClose, onSave }: SettingsModalProps) {
  const [zhipu, setZhipu] = useState(initial.zhipuApiKey);
  const [deepseek, setDeepseek] = useState(initial.deepseekApiKey);
  const [volcAk, setVolcAk] = useState(initial.volcengineAccessKey);
  const [volcSk, setVolcSk] = useState(initial.volcengineSecretKey);
  const [showClaudeCode, setShowClaudeCode] = useState(initial.showClaudeCode);
  const [showZhipu, setShowZhipu] = useState(initial.showZhipu);
  const [showDeepseek, setShowDeepseek] = useState(initial.showDeepseek);
  const [showVolcengine, setShowVolcengine] = useState(initial.showVolcengine);
  const [showDiskUsage, setShowDiskUsage] = useState(initial.showDiskUsage);
  const [interval, setIntervalSec] = useState(initial.refreshIntervalSec);
  const [proxyUrl, setProxyUrl] = useState(initial.proxyUrl);
  const [noProxyDns, setNoProxyDns] = useState(initial.noProxyDns.join('\n'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setZhipu(initial.zhipuApiKey);
      setDeepseek(initial.deepseekApiKey);
      setVolcAk(initial.volcengineAccessKey);
      setVolcSk(initial.volcengineSecretKey);
      setShowClaudeCode(initial.showClaudeCode);
      setShowZhipu(initial.showZhipu);
      setShowDeepseek(initial.showDeepseek);
      setShowVolcengine(initial.showVolcengine);
      setShowDiskUsage(initial.showDiskUsage);
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
        volcengineAccessKey: volcAk.trim(),
        volcengineSecretKey: volcSk.trim(),
        showClaudeCode,
        showZhipu,
        showDeepseek,
        showVolcengine,
        showDiskUsage,
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
        className="glass-card p-5 w-[420px] max-w-[90vw] max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-white/90 mb-4">设置</h2>

        <div className="space-y-3">
          <SettingGroup title="🤖 Claude Code" enabled={showClaudeCode} onToggle={setShowClaudeCode}>
            <div>
              <label className="block text-sm text-white/70 mb-1">代理地址</label>
              <input
                type="text"
                value={proxyUrl}
                onChange={e => setProxyUrl(e.target.value)}
                placeholder="留空则始终直连"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">免代理 DNS（每行或逗号分隔）</label>
              <textarea
                value={noProxyDns}
                onChange={e => setNoProxyDns(e.target.value)}
                rows={2}
                placeholder="172.20.5.1"
                className={`${inputClass} resize-y`}
              />
              <p className="text-[11px] text-white/40 mt-1">
                当前 DNS 命中此列表则直连访问 Anthropic，否则走代理
              </p>
            </div>
          </SettingGroup>

          <SettingGroup title="🤖 智谱 AI" enabled={showZhipu} onToggle={setShowZhipu}>
            <div>
              <label className="block text-sm text-white/70 mb-1">API Key</label>
              <input
                type="password"
                value={zhipu}
                onChange={e => setZhipu(e.target.value)}
                placeholder="留空则不显示数据"
                className={inputClass}
              />
            </div>
          </SettingGroup>

          <SettingGroup title="🧠 DeepSeek" enabled={showDeepseek} onToggle={setShowDeepseek}>
            <div>
              <label className="block text-sm text-white/70 mb-1">API Key</label>
              <input
                type="password"
                value={deepseek}
                onChange={e => setDeepseek(e.target.value)}
                placeholder="留空则不显示数据"
                className={inputClass}
              />
            </div>
          </SettingGroup>

          <SettingGroup title="🌋 火山引擎" enabled={showVolcengine} onToggle={setShowVolcengine}>
            <div>
              <label className="block text-sm text-white/70 mb-1">Access Key</label>
              <input
                type="password"
                value={volcAk}
                onChange={e => setVolcAk(e.target.value)}
                placeholder="控制台「API 访问密钥」中生成"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">Secret Key</label>
              <input
                type="password"
                value={volcSk}
                onChange={e => setVolcSk(e.target.value)}
                placeholder="与 Access Key 配套使用"
                className={inputClass}
              />
            </div>
          </SettingGroup>

          <SettingGroup title="💾 磁盘使用量" enabled={showDiskUsage} onToggle={setShowDiskUsage} />

          <div>
            <label className="block text-sm text-white/70 mb-1">刷新间隔 (秒)</label>
            <input
              type="number"
              min={30}
              value={interval}
              onChange={e => setIntervalSec(Number(e.target.value))}
              className={inputClass}
            />
            <p className="text-[11px] text-white/40 mt-1">
              建议 ≥ 120 秒，避免触发 Anthropic /api/oauth/usage 限流
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
