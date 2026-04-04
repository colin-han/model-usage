import { ZhipuCard } from './components/ZhipuCard';
import { RefreshButton } from './components/RefreshButton';
import { useUsageData } from './hooks/useUsageData';

function App() {
  const { data, loading, refresh } = useUsageData();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 头部 */}
      <header className="bg-white shadow-sm px-4 py-3">
        <h1 className="text-lg font-bold text-gray-800">AI Coding Plan Monitor</h1>
      </header>

      {/* 主内容 */}
      <main className="p-4">
        {/* 全局错误提示 */}
        {data.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-4 text-sm">
            {data.error}
          </div>
        )}

        {/* 数据卡片 */}
        <ZhipuCard data={data.zhipu} error={data.zhipuError} />

        {/* 刷新按钮 */}
        <RefreshButton
          onRefresh={refresh}
          loading={loading}
          lastUpdated={data.lastUpdated}
        />

        {/* 说明 */}
        <p className="text-xs text-gray-400 mt-4 text-center">
          数据每分钟自动刷新 | API Key 通过 .env.local 配置
        </p>
      </main>
    </div>
  );
}

export default App;
