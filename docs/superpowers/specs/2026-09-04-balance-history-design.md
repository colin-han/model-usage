# 余额历史记录与趋势展示 设计文档

日期：2026-09-04

## 1. 目标

为三张余额卡片（DeepSeek、火山引擎、阿里云）增加余额变化历史：

- 每次刷新成功后把余额按天记录到 SQLite。
- 自动识别充值行为，并据此计算每日花费。
- 卡片内以 sparkline 底图展示最近 30 天走势，不明显撑大卡片。
- 点击卡片弹出主窗口内的 modal，用图表查看每天的余额、花费和充值。

不在范围内：历史清理与导出、卡片上显示"今日花费"文字、智谱额度卡与 Claude Code 卡。

## 2. 方案选择

- 存储与业务逻辑放在 Rust 侧，使用 `rusqlite`（`bundled` 特性）。充值检测、取整、花费计算全部在后端完成并可单元测试，前端只调用 command 取现成结果。
- 图表用手写 SVG，不引入图表库。

## 3. 数据模型

数据库文件：`~/.config/model-usage/history.sqlite`（与 `setting.json` 同目录）。

```sql
CREATE TABLE IF NOT EXISTS balance_daily (
  provider   TEXT NOT NULL,             -- deepseek | volcengine | aliyun
  day        TEXT NOT NULL,             -- 本地日期 YYYY-MM-DD
  balance    REAL NOT NULL,             -- 当天最后一次成功余额
  recharge   REAL NOT NULL DEFAULT 0,   -- 当天累计充值，已按 10 元向上取整
  updated_at TEXT NOT NULL,             -- RFC3339 时间
  PRIMARY KEY (provider, day)
);
```

`provider` 在 Rust 侧校验白名单，非法值返回错误。

## 4. 后端（`src-tauri/src/history.rs`）

### 4.1 `record_balance(provider, balance) -> Vec<BalanceDay>`

每次余额获取成功后由前端调用：

1. 打开（必要时创建）数据库并建表。
2. 取该 provider 最近一行作为"上一次余额"：今天的行若存在则用它，否则用日期最大的历史行。
3. 若 `balance - 上一次余额 > 0.005`，判定为充值：`充值额 = ceil(差值 / 10) * 10`，累加到今天这行的 `recharge`。首次记录无上一次余额，不判断充值。
4. upsert 今天这行的 `balance`、`updated_at`（`recharge` 只累加不重置）。
5. 返回最近 30 天历史（同 4.2）。

### 4.2 `get_balance_history(provider, days) -> Vec<BalanceDay>`

返回该 provider 最近 `days` 天内的行，按日期升序，每行结构：

```ts
interface BalanceDay {
  day: string;          // YYYY-MM-DD
  balance: number;
  recharge: number;
  spend: number | null; // 前一行余额 + 当天充值 - 当天余额
  sinceDay: string | null; // 前一行日期；与 day 不相邻时表示花费覆盖了断档区间
}
```

- 第一行没有前一行，`spend` 与 `sinceDay` 为 null。
- 为保证窗口内第一行也能算出花费，查询时多取一行窗口之前的记录作为基准，但不返回它。

### 4.3 错误处理

- 数据库打开、建表、读写失败均返回 `Err(String)`，由前端记录日志，不影响余额展示。
- 每次调用独立打开连接，调用频率低，不维护长连接状态。

### 4.4 注册

`lib.rs` 的 `generate_handler!` 新增 `history::record_balance`、`history::get_balance_history`。`Cargo.toml` 新增 `rusqlite = { version = "0.40", features = ["bundled"] }`。

## 5. 前端数据流

- `types/index.ts` 新增 `BalanceProvider = 'deepseek' | 'volcengine' | 'aliyun'`、`BalanceDay`，`UsageData` 新增 `histories: Record<BalanceProvider, BalanceDay[]>`。
- `useUsageData.ts`：三个余额分别获取成功后 `invoke('record_balance', { provider, balance })`，把返回值写入 `histories[provider]`。记录失败只 `console.error`，保留上一轮的历史。
- 取值口径：DeepSeek 用 `total_balance`，火山用 `availableBalance`，阿里云用 `availableAmount`，与卡片显示的金额一致。

## 6. 卡片（方案 D）

三张卡统一为共享组件 `BalanceCard`，props：`title`、`amount`、`provider`、`history`、`note?`（欠费提示）、`error`、`loading`、`onOpen`。

布局：

- 上层两行文字：标题（`text-lg font-bold`）、金额（`text-lg font-semibold`）。原"总余额 / 可用余额"小字和有色内框去掉。
- 底图：`Sparkline` 组件绝对定位铺在卡片底部约 40px 高，折线 + 淡色填充，x 按日期分布，缺失日直接连线，充值日画绿色实心圆点。
- 预警色：余额 < 2 红色、< 5 黄色，作用于整张卡的背景与边框。
- 欠费提示（火山 `arrearsBalance > 0`、阿里 `availableAmount < 0`）以小红字放在金额右侧同一行。
- 历史少于 2 个点时不渲染底图，只显示标题和金额。
- 整张卡可点击（`cursor-pointer`，hover 微亮），点击调用 `onOpen(provider)`。
- 卡片高度约 88px，与现状持平。

## 7. 详情 modal（`BalanceHistoryModal`）

- 复用 `SettingsModal` 的覆盖层与 glass 样式，标题为服务商名，右上角关闭。
- `App.tsx` 持有 `openProvider: BalanceProvider | null` 状态，传入对应 `histories` 与标题。
- 图表区约 460×220 的 SVG：
  - 每日花费为柱状，余额为折线（各用一侧 y 轴刻度，只画 3 条淡网格线）。
  - 充值日在柱顶上方画绿色三角并标注 `+¥50`。
  - x 轴每 5 天标一个日期。
- 鼠标悬停某一天显示提示框：日期、余额、当天花费、充值额；`sinceDay` 与 `day` 不相邻时注明"自 X 日以来"。
- 图下方一行汇总：30 天总花费、总充值、日均花费（总花费 / 有花费数据的天数）。
- 历史为空时显示"暂无历史数据"。

## 8. 测试

- Rust：`history.rs` 的核心逻辑接受 `&Connection` 参数，测试使用内存 SQLite，覆盖：
  - 首次记录不产生充值；
  - 同日多次记录覆盖 balance、保留 recharge；
  - 充值检测与 10 元向上取整（49.7 → 50，24.6 → 30）；
  - 余额下降不算充值；
  - 花费计算与断档 `sinceDay`；
  - 非法 provider 报错。
- 前端：项目无测试框架和 lint 脚本，以 `volta run yarn build`（含 `tsc`）通过和在 `tauri dev` 中手动验证为准。

## 9. 其他

- `.superpowers/` 加入 `.gitignore`。
