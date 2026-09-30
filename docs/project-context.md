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
| Workflow mode の既定値 | `standard` |
| テンプレート導入元 | https://github.com/h1karu-446/ai-dev-starter（`TEMPLATE_VERSION` 1.0.0、commit `705a334` の内容を 2026-09-29 に導入） |

## 技術・構造

- 言語 / フレームワーク: TypeScript 5、React 18、Vite 5、React Router 6、Tailwind CSS 3。
- 状態・データ取得: TanStack Query 5（サーバー状態）、Zustand 5（UI状態 `src/lib/uiStore.ts`）。グラフは Recharts、日付は date-fns 4。
- パッケージマネージャー / ロックファイル: npm / `package-lock.json`。Node 24（ローカルで確認済み、CI も同じ）。
- テンプレートの補助スクリプト: Python 3.10以上（標準ライブラリのみ）。
- ディレクトリと責務:
  - `src/pages/` 画面（Today・Plans・PlanDetail・Journey・Settings・SignIn。旧 `/calendar` は `/journey` へリダイレクト）、`src/components/` UI（`journey/` など画面別のフォルダを含む）
  - `src/lib/queries.ts` Supabase への読み書き（TanStack Query の hooks）。全件が必要な一覧（`useTasks`・`useReviews`・Journey の一覧）は、API の行数上限（`supabase/config.toml` の `max_rows = 1000`）を超えても欠けないよう `src/lib/pagination.ts` の `fetchAllPages` で500件ずつ取得する。並び順には `id` などの一意な副キーを付ける（Issue #27）
  - `src/lib/score.ts` スコア計算、`src/lib/date.ts` 日付処理、`src/lib/auth.tsx` 認証
  - `src/types.ts` 型と定数、`supabase/migrations/` DB スキーマと関数
  - `docs/` 運用、`skills/` スキル原本、`scripts/` と `tests/*.py` はテンプレートの補助スクリプトとそのテスト
- パスの別名: `@/` → `src/`（`vite.config.ts` と `tsconfig.json`）。
- データモデル / 外部サービス / 認証: Supabase。認証はメール + パスワード。主なテーブルは `tasks` と `daily_reviews`、学習計画機能の `plans` / `phases` / `routines` / `routine_skips`（migration 0007）と `materials` / `material_phases`（migration 0008）。設計は `docs/design/study-plans.md`。アカウント既定の目標起床・就寝時刻は Supabase Auth の `user_metadata` に保存。
- デプロイ先: 未設定（リポジトリ内にデプロイ設定なし）。

### 守るべき制約

- **スコア計算は2か所にある。** 保存される点数は PostgreSQL の `calculate_daily_score`（最新定義は `supabase/migrations/` の最後のファイル）とトリガーで計算する。`src/lib/score.ts` の `calculateScore` は画面でのプレビュー用の写し。計算式やランクの境界を変えるときは、新しい migration と `score.ts`、`src/lib/score.test.ts` を同時に更新する。
- **計画・フェーズ・ルーティン（migration 0007）。** 計画を作ると、期間を持たない暗黙のフェーズ（`phases.is_implicit`）が自動で1つできる（ADR-0004）。ルーティンは必ずフェーズに属する。通常フェーズの期間は同じ計画内で重ならない（`btree_gist` の除外制約）。フェーズの削除は RPC `delete_phase`、計画の削除は `delete_plan(p_plan_id, p_today)` に限る（最後のフェーズは暗黙のフェーズに戻る／未来の未完了タスクも消える）。
- **ルーティンタスクの生成ルール。** RPC `generate_routine_tasks(p_date)` が、進行中（`status = 'active'`）の計画で、暗黙のフェーズ、または `p_date` を含むフェーズの、曜日（ISO: 1=月〜7=日）が合うルーティンを `tasks` に作り、作った件数を返す。`p_date` は DB の日付の±1日以内に限る（範囲外は例外）。`tasks (routine_id, scheduled_date)` の部分一意インデックスと `on conflict do nothing` で、何度呼んでも1日1つしか作られない。生成後にルーティンを編集しても作成済みタスクは変わらない。
- **スキップ記録のトリガー（副作用に注意）。** `routine_id` を持つタスクを削除すると、`tasks_record_routine_skip`（AFTER DELETE）が `routine_skips (routine_id, date)` に1行足し、`generate_routine_tasks` はその日を再生成しない（ADR-0003）。コードから見えない副作用なので、ルーティンタスクの削除処理を変えるときは必ずこのトリガーを確認する。`routine_skips` の行はこのトリガーだけが作る（削除の取り消しで消す処理は 0016 を参照）。
- **持ち越しは複製（migration 0014、Issue #36）。** 期限切れの予定の「今日に移す」は、`carried_from` に元の id を入れた新しいタスクを insert する（元の予定は動かさない。元の日のスコアを変えないため）。`carried_from` は `on delete set null`、部分一意インデックスで1つの予定の複製は1つだけ。`tasks_owner_all` の `with check` は複製元も本人のタスクであることを要求する。ポリシーの中で `tasks` を直接参照すると再帰エラーになるため、`security definer` の `is_own_task(uuid)` を使う（`tasks` のポリシーを変えるときも同じ）。過去の日付の予定はタイトルだけ変更できる（`src/lib/plans/logic.ts` の `isLockedSchedule` / `planScheduleSave`）。検証SQLは `supabase/tests/0014_task_carry_over.sql`。
- **教材とマイルストーン（migration 0008）。** `materials.status` が `done` 以外なら `completed_at` は NULL、`done` で未指定なら `current_date`（UTC）で補う（`plans` と同じ。画面は端末の日付を送ること）。教材とフェーズの紐づけは `material_phases`（フェーズを消すと紐づけも消える）。`tasks.is_milestone` は予定のマイルストーンの印。子テーブルのRLSは、親の計画・教材・フェーズも本人のものであることを要求する。
- **教材のメモ（migration 0017、Issue #53）。** `materials.note`（nullable、1000文字まで、制約名 `materials_note_length`）。画面は前後の空白を除き、空なら NULL を送る。既存の教材は NULL のまま。GRANT・RLS・`completed_at` のトリガーは 0008 のまま。状態は循環ではなくメニューで直接選ぶ（`materialStatusPatch`）。検証SQLは `supabase/tests/0017_material_note.sql`（0017 を `\ir` で2回流す）。
- **tasks の親の所有（migration 0010、Issue #23）。** `tasks_owner_all` の `with check` は、`plan_id` / `routine_id` があればその計画・ルーティンも本人のものであることを要求する（`using` は従来どおり）。検証SQLは `supabase/tests/0010_tasks_parent_ownership.sql`。
- **`delete_plan` の修正（migration 0011、Issue #28）。** 残すタスクの `plan_id` / `routine_id` を、計画を削除する前に明示的に null にする。`on delete set null` に任せると、同じトランザクション内で作成・更新したタスクで `tasks_routine_id_fkey` 違反になるため。残す・消すタスクの扱い（BR-08）は同じ。検証SQLは `supabase/tests/0011_fix_delete_plan.sql`。
- **ランクの境界（migration 0013、Issue #35）。** ランクは保存される `total_score`（`numeric(5,2)`）と同じ、小数第2位に丸めた合計で決める（SQL は `round(round(v_total, 9), 2)`、TS は `roundTotalScore`。9桁で計算誤差を落としてから四捨五入）。30点ちょうどは D（`CLUSTER_META.D.min = 30` と同じ）。A〜C の境界（85・70・50）も同じ扱い。`calculate_daily_score` の最新定義は 0013（0006 から、この丸めと D の条件 `>= 30` だけを変更）。0013 は、保存済みの行のうち `cluster` が保存値から求めたランクと食い違う行を、`trg_update_scores` を止めたまま（スコアは再計算せず）直す。止める・直す・戻すは1つの `do` ブロックで行う。検証SQLは `supabase/tests/0013_cluster_d_boundary.sql`（0013 を `\ir` で2回流す）。
- **日付変更とスコア再計算（migration 0008）。** `touch_daily_review_after_task_change`（`trg_touch_review_on_task` から呼ばれる）は、タスクの `scheduled_date` が変わったとき、新しい日に加えて元の日の `daily_reviews` も更新して再計算させる（「今日に移す」で元の日のスコアが古いまま残る不具合の修正）。関数本体だけを差し替えており、トリガー定義は 0001 のまま。
- **`plans.completed_at`。** `status` が `done` 以外なら NULL、`done` で未指定なら `current_date`（UTC）で補う。日本時間の0〜9時にずれるため、画面は端末の日付を送ること。
- **タスク削除の取り消し（migration 0016、Issue #56）。** Today の削除（リスト・時刻未設定欄・タイムライン）は RPC `delete_task_for_undo(p_task_id)` で即時に削除し、削除した行を jsonb で丸ごと返す（`carried_from` で参照していた複製の id も返す）。5秒間の「元に戻す」は `restore_deleted_task(p_task, p_carried_copy_ids)` で、同じ id・値の行を入れ直し、同じトランザクションで `(routine_id, scheduled_date)` の `routine_skips` を消し、複製の `carried_from` を戻す。id や同じルーティンの同じ日が既に使われていれば一意制約のエラーで何も変えない（上書きしない）。どちらも `security invoker` で RLS がそのまま効く。`carried_from` は動的SQLで扱うので 0014 の有無に依存しない。Plans の予定一覧の削除は従来の `useDeleteTask` のまま。検証SQLは `supabase/tests/0016_task_delete_undo.sql`。
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

### ローカル検証環境（Issue #5）

2026-09-29、Dockerが利用可能になったため、検証用クラウドプロジェクトを作る方針から、Docker上のローカルSupabaseを使う方針へ変更した。本番のDBとは分離し、本番データはコピーしない。

- Docker Engine 28.1.1、Supabase CLI 2.109.1で起動を確認済み。既存migration 0001〜0006（その後 0007・0008 も適用）を適用し、ローカルのテストユーザーを2人作成した。0007以降は各Issueで扱う。新しいmigrationは共有DBに対して `docker exec -i supabase_db_Stride psql -v ON_ERROR_STOP=1 -U postgres -d postgres < 該当ファイル` で適用し、`supabase_migrations.schema_migrations` に版を記録する（`supabase db reset` は共有DBを消すため使わない）。0007以降の新テーブルのGRANTはmigration自身に含むので、`scripts/grant_local_supabase.sql` は変更不要。
- `supabase/config.toml` はローカルサービスとポートの設定。`supabase/migrations/` はDB構造の変更履歴。DockerイメージとコンテナはSupabase CLIが管理する。
- ローカル用の起動・停止はSupabase CLIで管理する。ローカル環境構築のためにクラウドへ `supabase link` / `supabase db push` は実行しない。

#### 起動とDB権限

1. Docker Desktopを起動し、リポジトリルートで `supabase start`。初回起動時にmigration 0001〜0006が適用される。
2. `supabase migration list --local` でローカルDBの適用履歴を確認する。ここでの `Remote` 列はDocker上のDBを指す。
3. `docker exec -i supabase_db_Stride psql -v ON_ERROR_STOP=1 -U postgres -d postgres < scripts/grant_local_supabase.sql` を実行する。既存migrationは古いSupabaseのAPI権限の既定値に依存しており、現在のローカル環境では `authenticated` に `tasks` と `daily_reviews` の権限が付かない。SQLはこの2テーブルに必要な権限だけを付け、既存RLSは維持する。`supabase db reset` 後も再実行する。
4. `supabase status` でローカルAPI URLとPublishable Keyを確認する。Secret Keyはブラウザへ渡さない。

ローカルAPIは通常 `127.0.0.1:54321`、DBは `127.0.0.1:54322`、Studioは `127.0.0.1:54323`。`supabase stop` でコンテナを停止してもローカルデータは残る。`supabase db reset` はローカルDBを再作成しテストユーザーとタスクを消すため、必要なときだけ実行する。新しいテーブルを追加するmigrationでは、RLSに加えて利用するロールへの明示的な `GRANT` も設計する。

#### 接続先の切り替え

既存の `.env.local` は上書きせず保持する。ローカル用のURLと公開キーは `.env.docker.local`（Git管理外）に次の2変数として設定する。値は `supabase status` で確認し、キーの値を文書へ転記しない。

- `VITE_SUPABASE_URL`: ローカルSupabaseのAPI URL
- `VITE_SUPABASE_ANON_KEY`: ローカルSupabaseのPublishable Key。変数名は既存コードとの互換のため `ANON_KEY` のまま（service_role / Secret Keyは使用しない）

| 接続先 | 起動コマンド | 設定ファイル |
| --- | --- | --- |
| ローカル検証用 | `npm run dev -- --mode docker` | `.env.docker.local` の2変数を使用 |
| 既存の接続先 | `npm run dev` | `.env.local`（既存のdevelopmentモード） |

切り替え時はdevサーバーを止めて起動し直す。Viteはmode固有の値を優先するが、未設定の変数は `.env.local` から引き継ぐため、ローカル用の2変数を両方設定してから起動する。シェルに同名変数をexportしているとファイルより優先されるため解除する。Viteは5173番が使用中なら5174番などへ移るため、ターミナルが表示したURLを開く。ブラウザのNetworkでAPI接続先がローカルの54321番であることを確認してから検証する。

参考: [Supabaseのローカル開発](https://supabase.com/docs/guides/local-development/cli/getting-started)、[Viteの環境変数とmode](https://vite.dev/guide/env-and-mode)。

## レビューと例外

- レビュー手順は開発ワークフローの mode 定義に従う。Human review とマージ判断は本人（h1karu-446）が担当する。
- Claude Code での別Agentレビューは `reviewer` subagent を指定して依頼する。
- GitHubへ投稿してよい範囲: 未設定。Issue / PR の作成・コメントは、その都度ユーザーの依頼を確認する。

### light の手続き簡略化

- 対象: `light` を適用する変更のみ。`standard` の変更には適用しない。
- 内容:
  1. **Issue と PR を省略してよい。** 作業ブランチを作らず main へ直接コミットしてよい。Plan・検証結果・別Agentレビューを省略した理由は、チャットでの完了報告に含める。
  2. **Human review は、コミット前に本人が差分を確認することで行う。**
  3. **検証は省略しない。** 変更対象の確認に加え、test / typecheck / build は変更ごとに実行し、PASS / FAIL / BLOCKED / N/A で報告する（共通ルールの light より厳しくする。どれも数秒で終わるため）。

## 未決事項

- `npm audit` の指摘（メジャー更新なしで直る分は `npm audit fix`、Vite などのメジャー更新は別作業）。
- デプロイ先、ESLint の導入。

### Journey のデータ（Issue #11）

- migration `0009_wishes_and_achievements.sql` は0008適用後に実行する。`wishes` は本人のみ読み書き可能。`achieved_at` は画面から端末の日付を送信し、NULLに戻すと未達成になる。
- `achievements` は `security_invoker = true` の読み取り専用ビュー。達成済みのやりたいこと、完了した計画、完了したマイルストーン、完了した教材をまとめ、元テーブルのRLSを適用する。識別子は `kind` と `id` の組。
- 未ログインの `wishes` / `achievements` へのアクセスは権限エラーで拒否する（情報を返さない）。DB-53の「0件」と同じ非公開要件をより厳しく満たす。
- 計画削除後も残る完了マイルストーンは、計画情報なしで達成の記録に残る。スコア・既存タスクの変更はない。

### Journey 画面（Issue #12）

- `/journey` が Calendar を置き換える。旧 `/calendar` はリダイレクトする。やりたいことの即時取り消しは5秒、達成の記録からの取り消しは常時可能。
- `Wish` / `Achievement` はDB行のNULLをそのまま扱う型（`user_id`付き）を採用する。既存のPlan等のoptional型とは異なり、変換時の取りこぼしを避ける。
- 年の達成はフィードの表示月とは独立したexact count。フィード・未達成wishはAPIの行数制限を超えても取得できるようページングする。
- 計画・タスクの作成/更新/削除時には達成キャッシュも無効化する。教材mutationも同じキー `["achievements"]` を無効化すること。
- `achievements.started_at`（migration 0012、Issue #34）は計画の `created_at` を timestamptz のまま返す。0009 の `started_on`（UTC 日付）は廃止した。現地の日付への変換は画面側で行い、Journey の期間は Plans と同じ `spanLabel`（`src/lib/plans/logic.ts`、`planSpanLabel` の本体）で表示する。完了/達成日は端末の日付を送る。ビューの列を変えるときは `create or replace view` では名前・型を変えられないため drop → create し、`security_invoker = true` と GRANT（authenticated の select のみ）を付け直す。検証SQLは `supabase/tests/0012_achievements_started_at.sql`。
