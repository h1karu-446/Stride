import { FormEvent, useState } from "react";
import {
  useDeleteAll,
  useReviews,
  useTasks,
  useUpdateWakeTarget,
  useWakeTarget,
} from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export default function Settings() {
  const { session, signOut } = useAuth();
  const tasks = useTasks().data ?? [];
  const reviews = useReviews().data ?? [];
  const deleteAll = useDeleteAll();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm muted">アカウントとデータ管理</p>
      </div>

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold">アカウント</h2>
        <div className="text-sm">
          <span className="muted">サインイン中:</span>{" "}
          <span className="font-medium">{session?.user.email}</span>
        </div>
        <button type="button" onClick={() => signOut()} className="btn-outline">
          ログアウト
        </button>
      </section>

      <WakeTargetSection />

      <PasswordChangeSection />

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold">データ</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Stat label="タスク数" value={tasks.length} />
          <Stat label="レビュー数" value={reviews.length} />
        </div>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  "すべてのタスクとレビューを削除します。よろしいですか？"
                )
              ) {
                deleteAll.mutate();
              }
            }}
            className="btn-outline text-rose-500"
            disabled={deleteAll.isPending}
          >
            全データ削除
          </button>
        </div>
      </section>
    </div>
  );
}

function WakeTargetSection() {
  const current = useWakeTarget();
  const update = useUpdateWakeTarget();
  const [value, setValue] = useState(current);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setInfo(null);
    setError(null);
    try {
      await update.mutateAsync(value);
      setInfo("目標起床時刻を更新しました。");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "不明なエラー");
    }
  }

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="text-sm font-semibold">目標起床時刻</h2>
        <p className="text-xs muted mt-0.5">
          スコアの起床配分(5%)はこの時刻との差分で決まります（150分以上遅れで0点）
        </p>
      </div>
      <form onSubmit={submit} className="flex items-end gap-2">
        <div className="flex-1">
          <label className="label">目標時刻</label>
          <input
            type="time"
            className="input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="btn-primary"
          disabled={update.isPending || value === current}
        >
          保存
        </button>
      </form>
      {info && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">{info}</p>
      )}
      {error && (
        <p className="text-sm text-rose-500" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function PasswordChangeSection() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (password.length < 6) {
      setError("パスワードは6文字以上にしてください。");
      return;
    }
    if (password !== confirm) {
      setError("確認用パスワードが一致しません。");
      return;
    }
    setSubmitting(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setInfo("パスワードを更新しました。");
      setPassword("");
      setConfirm("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "不明なエラー");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card space-y-3">
      <h2 className="text-sm font-semibold">パスワード変更</h2>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">新しいパスワード</label>
          <input
            type="password"
            autoComplete="new-password"
            minLength={6}
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label className="label">確認用</label>
          <input
            type="password"
            autoComplete="new-password"
            minLength={6}
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error && (
          <p className="text-sm text-rose-500" role="alert">
            {error}
          </p>
        )}
        {info && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            {info}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            className="btn-primary"
            disabled={submitting || !password || !confirm}
          >
            {submitting ? "..." : "パスワードを更新"}
          </button>
        </div>
      </form>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-slate-50 dark:bg-notion-panel-hover p-3">
      <div className="text-xs muted">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
