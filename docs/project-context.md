# プロジェクト固有Context

共通ルールを変更せず、このファイルをプロジェクトごとに更新する。
未設定の値は推測で埋めず、初回セットアップ Issue で決める。

## 基本情報

| 項目 | 現在の値 |
| --- | --- |
| プロジェクト名 | Stride |
| 目的 | 日々のタスク達成度・充実度・起床/就寝時刻を点数化し、自己改善のために可視化する |
| Repository / Issue のURL | https://github.com/h1karu-446/Stride / https://github.com/h1karu-446/Stride/issues |
| 主要な利用者 / ユースケース | 個人（開発者本人）。タスクの予定と完了、1日の振り返り、スコアの推移確認 |
| 基準ブランチ | main |
| 実装担当 / レビュー担当 / マージ担当 | 個人開発：実装は Claude Code / Codex / 本人、マージ判断は本人（h1karu-446） |
| Workflow mode の既定値 | `light`（個人開発のため）。詳細は「Workflow modeの既定値」 |
| テンプレート導入元 | https://github.com/h1karu-446/ai-dev-starter（`TEMPLATE_VERSION` 1.0.0、commit `705a334` の内容を 2026-09-29 に導入） |

## 技術・構造

- 言語 / フレームワーク: TypeScript 5、React 18、Vite 5、React Router 6、Tailwind CSS 3。
- 状態・データ取得: TanStack Query 5（サーバー状態）、Zustand 5（UI状態 `src/lib/uiStore.ts`）。グラフは Recharts、日付は date-fns 4。
- パッケージマネージャー / ロックファイル: npm / `package-lock.json`。Node 24（ローカルで確認済み、CI も同じ）。
- テンプレートの補助スクリプト: Python 3.10以上（標準ライブラリのみ）。
- ディレクトリと責務:
  - `src/pages/` 画面（Today・Calendar・Settings・SignIn）、`src/components/` 共通UI
  - `src/lib/queries.ts` Supabase への読み書き（TanStack Query の hooks）
  - `src/lib/score.ts` スコア計算、`src/lib/date.ts` 日付処理、`src/lib/auth.tsx` 認証
  - `src/types.ts` 型と定数、`supabase/migrations/` DB スキーマと関数
  - `docs/` 運用、`skills/` スキル原本、`scripts/` と `tests/*.py` はテンプレートの補助スクリプトとそのテスト
- パスの別名: `@/` → `src/`（`vite.config.ts` と `tsconfig.json`）。
- データモデル / 外部サービス / 認証: Supabase。認証はメール + パスワード。主なテーブルは `tasks` と `daily_reviews`。アカウント既定の目標起床・就寝時刻は Supabase Auth の `user_metadata` に保存。
- デプロイ先: 未設定（リポジトリ内にデプロイ設定なし）。

### 守るべき制約

- **スコア計算は2か所にある。** 保存される点数は PostgreSQL の `calculate_daily_score`（最新定義は `supabase/migrations/` の最後のファイル）とトリガーで計算する。`src/lib/score.ts` の `calculateScore` は画面でのプレビュー用の写し。計算式やランクの境界を変えるときは、新しい migration と `score.ts`、`src/lib/score.test.ts` を同時に更新する。
- **migration は追記のみ。** 適用済みの migration ファイルは書き換えず、新しい番号のファイルを追加する。

## セットアップと検証

作業ディレクトリはリポジトリのルート。

| 項目 | 現在のコマンド / 適用条件 |
| --- | --- |
| install | `npm install`（CI は `npm ci`） |
| dev | `npm run dev`（`.env.local` に Supabase の値が必要） |
| test | `npm test`（Vitest 3。`src/**/*.test.ts`）。テンプレート補助スクリプトの変更時は `python3 -m unittest discover -s tests -v` も |
| lint | N/A：ESLint などのリンターは未導入。導入するまでは typecheck で代替 |
| typecheck | `npm run lint`（中身は `tsc --noEmit`。スクリプト名は lint だが実体は型検査） |
| build | `npm run build`（`tsc -b && vite build`。ビルド時に Supabase の環境変数が必要。検証目的ならダミー値でよい: `VITE_SUPABASE_URL=x VITE_SUPABASE_ANON_KEY=x npm run build`） |
| テンプレート整合性 | `python3 scripts/check_template.py`（必須ファイル、Git管理対象のMarkdownのローカルリンク、スキル同期を確認） |

CI: `.github/workflows/ci.yml`（typecheck・test・build）と `.github/workflows/template-check.yml`（テンプレート整合性）。

## 環境変数・データ

| 変数 | 用途 | 取得方法 |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase プロジェクトのURL | Supabase ダッシュボードの Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase の anon（公開）キー | 同上 |

- 値は `.env.local`（Git 管理外）に置く。`.env.example` には変数名だけを載せる。
- 未設定だとアプリ起動時に `src/lib/supabase.ts` が例外を投げる。
- テスト（`npm test`）は純粋な関数だけを対象にしており、Supabase への通信は行わない。
- DB 変更は `supabase/migrations/` に追加し、Supabase CLI で適用する。本番データを使った検証・削除は明示の指示がある場合だけ行う。

## Workflow modeの既定値

プロジェクト既定値は `light`（個人開発のため、h1karu-446 が 2026-09-29 に選択）。Issue で `standard` が選ばれていればそれを優先する。
ただし次に当たる変更は、指定にかかわらず `standard` を適用する。

- DB migration、スコア計算・ランク判定（`src/lib/score.ts` と SQL の関数）の変更
- 認証まわりの変更
- 複数画面にまたがる機能追加
- 依存パッケージのメジャー更新

手順と選択基準は [開発ワークフロー](development-workflow.md#workflow-modeissueごと) を参照する。

## レビューと例外

- レビュー手順は開発ワークフローの mode 定義に従う。Human review とマージ判断は本人（h1karu-446）が担当する。
- Claude Code での別Agentレビューは `reviewer` subagent を指定して依頼する。
- GitHubへ投稿してよい範囲: 未設定。Issue / PR の作成・コメントは、その都度ユーザーの依頼を確認する。

### 合意済み例外：light の手続き簡略化

- 対象: `light` を適用する変更のみ。`standard` の変更には適用しない。
- 内容:
  1. **Issue と PR を省略してよい。** 作業ブランチを作らず main へ直接コミットしてよい。Plan・検証結果・別Agentレビューを省略した理由は、チャットでの完了報告に含める。
  2. **Human review は、コミット前に本人が差分を確認することで行う。**
  3. **検証は省略しない。** 変更対象の確認に加え、test / typecheck / build は変更ごとに実行し、PASS / FAIL / BLOCKED / N/A で報告する（共通ルールの light より厳しくする。どれも数秒で終わるため）。
- 理由: 利用者・開発者が本人のみの個人開発で、小さな変更に Issue / PR を作るのは規模に比べて重いため。
- 承認者 / 日付: h1karu-446 / 2026-09-29
- 見直し条件: 共同開発者が加わる、他者に公開・提供する、本番データの事故が起きる、のいずれか。

## 未決事項

- `src/types.ts` の `CLUSTER_META.D.min` は 30 だが、実際の判定（`clusterFromScore` と SQL）では 30 点ちょうどは E。表示用の値をどちらに合わせるか未決定。
- `LICENSE` と、以前の `README.md` の中身が Supabase CLI のものになっていた（commit `cb1b54d`）。README は書き直した。LICENSE をどうするかは未決定。
- `supabase/.temp/` が Git 管理下にある（CLI の一時ファイル）。管理から外すか未決定。
- `npm audit` の指摘（メジャー更新なしで直る分は `npm audit fix`、Vite などのメジャー更新は別作業）。
- デプロイ先、ESLint の導入。
