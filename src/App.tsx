import { ZhipuCard } from './components/ZhipuCard';
import { TitleBar } from './components/TitleBar';
import { useUsageData } from './hooks/useUsageData';

function App() {
  const { data, loading, refresh } = useUsageData();

  return (
    <div className="min-h-screen flex flex-col animated-gradient">
      {/* 标题栏 */}
      <TitleBar onRefresh={refresh} loading={loading} />

      {/* 主内容 */}
      <main className="flex-1 p-4 overflow-auto">
        {/* 全局错误提示 */}
        {data.error && (
          <div className="glass-error px-4 py-3 rounded-xl mb-4 text-sm">
            {data.error}
          </div>
        )}

        {/* 数据卡片 */}
        <ZhipuCard data={data.zhipu} error={data.zhipuError} />

        {/* 说明 */}
        <p className="text-xs text-white/40 mt-4 text-center">
          数据每分钟自动刷新 | API Key 通过 .env.local 配置
        </p>
      </main>
    </div>
  );
}

export default App;
