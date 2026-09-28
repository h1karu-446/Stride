# ai-dev-starter 導入・管理ガイド

Claude Code と Codex を、共通ルール・GitHub Issue・PR のもとで使う開発テンプレートです。
アプリのフレームワークを含まないため、新規プロジェクトにも既存リポジトリにも導入できます。

基本の流れは **Issue → Plan → 実装 → 検証 → 別Agentレビュー → PRマージ**。
GitHubに判断と証拠を残し、人間・Claude Code・Codexが担当を引き継げる状態を保ちます。

このガイドは導入先にも残す共通の説明です。以下のコマンドとコード内のパスは、リポジトリのルートを基準にしています。

## 初期導入

1. このフォルダを導入先へコピーします。GitHub上にテンプレートとして登録済みなら **Use this template → Create a new repository** から作成できます。
2. [プロジェクト固有Context](project-context.md) の名前、目的、技術スタック、担当、実行コマンドを導入先に合わせます。
3. Python 3.10以上で次を実行します。外部パッケージは不要です。

   ```sh
   python3 scripts/check_template.py
   python3 -m unittest discover -s tests -v
   ```

4. アプリの test / lint / typecheck / build を定義し、そのCIを追加します。同梱の `Template checks` はテンプレートの整合性だけを確認します。
5. GitHubへ登録したら「開発作業・初回セットアップ」Issueを作り、Contextの未設定項目、レビュー担当、必要なブランチ保護・必須チェックを決めます。
6. ルートの `README.md` をアプリの概要・セットアップ・起動方法・使い方に書き換えます。このガイドは残し、READMEからリンクします。具体的な記載項目は次節を参照してください。
7. リポジトリを開いてClaude CodeまたはCodexを起動し、最初のIssueを依頼します。

初回導入はIssue作成前でも構いません。アプリ用のコマンドが未設定なら、その検証はBLOCKEDです。
同梱Contextにあるtypecheck / buildのN/Aはテンプレート自体に限った設定です。

## アプリのREADMEへ切り替える

雛形のルートREADMEは導入案内の入口です。新しいアプリへ流用するときは、初回セットアップの一部として次の内容へ書き換えます。

- アプリ名、目的、主な機能
- 必要な環境、インストール・セットアップ方法
- 起動方法と基本的な使い方
- 開発者向けの検証方法、ライセンスなど必要な情報
- 開発ドキュメントへのリンク

未決定の機能や実行コマンドを実装済みとして記載しないでください。確定した内容から記入し、実装とともに更新します。
READMEには利用者に必要な情報を、`docs/project-context.md` にはAgentや開発者に必要な設計・制約・開発情報を記載します。
両方に載せる実行コマンドなどは、変更時に一致させます。

アプリのルートREADMEには、例えば次のリンクを残します。

| READMEからリンクする文書 | READMEを基準とするリンク先 |
| --- | --- |
| 開発手順 | `docs/development-workflow.md` |
| プロジェクト固有Context | `docs/project-context.md` |
| AI開発テンプレートの導入・管理ガイド | `docs/ai-dev-starter-guide.md` |

既存アプリへ導入するときは、そのREADMEを保持し、必要なリンクだけ追加します。
テンプレートの更新を取り込むときも、アプリのREADMEを雛形のREADMEで上書きしないでください。

## 構成と編集先

```text
ai-dev-starter/
├── README.md                       導入後はアプリの説明へ書き換える
├── AGENTS.md                       共通方針の原本
├── CLAUDE.md                       AGENTS.mdを読み込む入口
├── docs/
│   ├── ai-dev-starter-guide.md     雛形の導入・管理方法
│   ├── development-workflow.md     共通の開発手順
│   └── project-context.md          プロジェクト固有情報
├── .github/
│   ├── ISSUE_TEMPLATE/             機能・不具合・作業
│   ├── pull_request_template.md    検証・レビューの記録
│   └── workflows/template-check.yml
├── skills/                         スキルの原本
│   ├── spec-writing/SKILL.md
│   ├── bug-investigation/SKILL.md
│   └── pr-review/SKILL.md
├── .agents/skills/                  Codex用の生成コピー
├── .claude/skills/                  Claude Code用の生成コピー
├── scripts/                        同期・整合性チェック
├── tests/                          同期スクリプトのテスト
└── TEMPLATE_VERSION                導入元の版
```

| 変更したいもの | 編集先 |
| --- | --- |
| アプリの概要・起動方法・使い方 | [README.md](../README.md) |
| 雛形の導入・スキル管理・更新方法 | [ai-dev-starter-guide.md](ai-dev-starter-guide.md) |
| 全プロジェクトで守る方針 | [AGENTS.md](../AGENTS.md) |
| 作業の進め方・完了条件 | [development-workflow.md](development-workflow.md) |
| 技術、コマンド、設計、合意済み例外 | [project-context.md](project-context.md) |
| 仕様作成・調査・レビューの手順 | `skills/*/SKILL.md` |
| Issue / PRの記入欄 | `.github/` 配下のテンプレート |

## Claude Code / Codexで使う

Claude Codeは `CLAUDE.md` の `@AGENTS.md` importを通して共通ルールを読みます。
Codexは `AGENTS.md` を使います。両方ともContextと開発手順を読んでから作業する設計です。

スキルは両ツールの検出先へコピー済みなので、初回の同期作業は不要です。

| 作業 | Claude Code | Codex CLI / IDE |
| --- | --- | --- |
| 仕様作成 | `/spec-writing Issue #123の仕様を作って` | `$spec-writing Issue #123の仕様を作って` |
| 不具合調査 | `/bug-investigation Issue #124を調査して` | `$bug-investigation Issue #124を調査して` |
| レビュー | `/pr-review PR #45をレビューして` | `$pr-review PR #45をレビューして` |

UIでの選択方法は利用環境によって異なります。見つからない場合は再起動し、プロジェクトを信頼しているか、同名の個人スキルがないかを確認してください。
ファイルのパスを指定して「このSKILL.mdに従って」と依頼することもできます。

通常の実装依頼の例:

```text
Issue #123を担当してください。
AGENTS.mdとContextを確認し、Planを記録してから実装・検証を進めてください。
別Agentレビュー用に差分、head SHA、検証結果をまとめてください。
```

GitHubへ書き込む運用なら、別途「このIssueの進捗コメントとDraft PR作成まで行ってよい」など範囲を明示します。
これらのファイルは手順の定義であり、自動のAgent起動・レビュー・マージを有効化するものではありません。
レビューは別セッションや別Agentに依頼し、[開発手順](development-workflow.md)に沿って証拠を記録します。

## スキルを更新する

`skills/` の原本を編集し、以下を実行します。

```sh
python3 scripts/sync_skills.py
python3 scripts/sync_skills.py --check
python3 scripts/check_template.py
python3 -m unittest discover -s tests -v
```

原本と `.agents/skills/`、`.claude/skills/` の変更を同じコミットに含めます。
同期スクリプトは `skills/*/SKILL.md` を自動検出してコピーします。原本にない生成先の独自スキルは変更しません。削除・改名した原本の古いコピーは自動削除しないため、確認して手動で整理します。
コピー側を直接編集すると同期時に上書きされます。既存の同名スキルがある場合は先に差分を確認してください。
新しいスキルは `skills/<name>/SKILL.md` を追加して同期するだけで認識されます。補助ファイルは同期対象外です。
CIは同期漏れを検出します。シンボリックリンクは使わないので、通常のZIP展開やWindowsでもコピーを保持できます。

`.claude/skills/` と `.agents/skills/` を無視設定に含めないでください。
チェックは `git check-ignore --no-index` で同期先ディレクトリと各skillの実際のパスを検査します。
`.gitignore` だけでなく `.git/info/exclude` やグローバル設定も対象で、追跡済みファイルも検査します。
無視される場合、このままだと生成されたskillがcommitされません。親ディレクトリの除外も含めて設定を直し、再検査してください。
ZIP展開などGitリポジトリでない場合はこの検査だけをスキップします。Git初期化後に再実行してください。

Claude Codeの独立レビューは `reviewer` subagentを指定して依頼します。
実行定義は `.claude/agents/reviewer.md`、共通手順は `skills/pr-review/SKILL.md` です。
Codexでの依頼方法とmode選択は [開発手順](development-workflow.md) を参照してください。
Write / Edit等を除外してもBashの副作用まで機械的に防ぐ設定ではないため、検証コマンドも読み取り限定の共通ルールに従います。

## 既存プロジェクトに導入する

1. 作業ブランチを作り、既存の `AGENTS.md` / `CLAUDE.md` / `.github/` / スキルを確認します。
2. 同名ファイルは上書きせず、方針とテンプレートをレビューして統合します。既存のアプリ用READMEは保持し、このガイドへのリンクを追加します。特に既存CIを置き換えないでください。
3. Contextには既存コードから確認した情報を記入し、スキルを同期・検査します。
4. 最初の小さなIssueで実装からレビューまで試し、運用に合わない部分は理由を記録して調整します。

## 複数プロジェクトへ更新を配る

Template Repositoryから作ったプロジェクトへ、後の変更は自動同期されません。
このテンプレートを共通原本として管理し、導入先では `TEMPLATE_VERSION` と導入元URLを記録します。
共通ファイルの差分を専用Issue / PRで取り込み、固有ContextとアプリのREADMEを丸ごと上書きしないでください。
原本と導入先で同じファイルを変更した場合は、人間またはAgentが差分を統合します。
最初はこの手動更新で運用し、プロジェクト数が増えてから更新の自動化を検討できます。

## 個人利用とライセンスの扱い

この雛形は、自分の複数プロジェクトで使い回す個人利用を想定しています。雛形自体の公開・第三者配布は現在の運用に含めず、配布用ライセンスの選定を初回セットアップの必須作業にはしません。

この雛形から作るアプリの利用・公開方針は、各プロジェクトで別途決めます。アプリのライセンスに関する情報は、必要に応じてそのアプリのREADMEやLICENSEファイルで管理します。

## 参照した公式仕様

- [CodexのAGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Codexのスキル配置と利用](https://learn.chatgpt.com/docs/build-skills)
- [Claude Codeのsubagent設定](https://code.claude.com/docs/en/sub-agents)
- [Claude Codeのスキル](https://code.claude.com/docs/en/skills)
- [Claude CodeのCLAUDE.mdとimport](https://code.claude.com/docs/en/memory)

最終仕様確認日: 2026-09-29。
