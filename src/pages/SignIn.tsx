import { FormEvent, useState } from "react";
import { useAuth } from "@/lib/auth";

type Mode = "signin" | "signup";

export default function SignIn() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      if (mode === "signin") {
        await signIn(email, password);
      } else {
        await signUp(email, password);
        setInfo(
          "登録メールを送信しました。受信箱を確認してから、サインインしてください。"
        );
        setMode("signin");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "不明なエラー");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm card space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stride</h1>
          <p className="text-sm muted mt-1">
            {mode === "signin"
              ? "アカウントにサインイン"
              : "新しいアカウントを作成"}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">メール</label>
            <input
              type="email"
              required
              autoComplete="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label">パスワード</label>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
          <button
            type="submit"
            className="btn-primary w-full"
            disabled={submitting}
          >
            {submitting
              ? "..."
              : mode === "signin"
              ? "サインイン"
              : "登録"}
          </button>
        </form>

        <div className="text-xs text-center muted">
          {mode === "signin" ? (
            <>
              アカウントが無い場合{" "}
              <button
                type="button"
                className="text-notion-blue hover:underline"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                  setInfo(null);
                }}
              >
                新規登録
              </button>
            </>
          ) : (
            <>
              すでにアカウントがある場合{" "}
              <button
                type="button"
                className="text-notion-blue hover:underline"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                  setInfo(null);
                }}
              >
                サインイン
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
