import type { AliyunBalanceData, BalanceDay, BalanceProvider } from '../types';
import { BalanceCard } from './BalanceCard';

interface AliyunCardProps {
  data: AliyunBalanceData | null;
  error?: string | null;
  loading?: boolean;
  history: BalanceDay[];
  onOpen: (provider: BalanceProvider) => void;
}

export function AliyunCard({ data, error, loading, history, onOpen }: AliyunCardProps) {
  return (
    <BalanceCard
      title="☁️ 阿里云"
      provider="aliyun"
      amount={data ? data.availableAmount : null}
      note={data && data.availableAmount < 0 ? '账户已欠费' : null}
      emptyText="未配置 AK/SK"
      error={error}
      loading={loading}
      history={history}
      onOpen={onOpen}
    />
  );
}
