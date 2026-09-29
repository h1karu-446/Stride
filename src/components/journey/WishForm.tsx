import { useEffect, useState } from "react";
import { Field, FormActions } from "@/components/common/FormParts";
import type { WishInput } from "@/lib/journey/queries";

export default function WishForm({ initial, onSubmit, onDelete, onCancel, saving, failed }: {
  initial: WishInput; onSubmit: (value: WishInput) => void; onDelete?: () => void;
  onCancel: () => void; saving: boolean; failed: boolean;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) onCancel(); };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [onCancel, saving]);
  const valid = value.title.trim().length > 0 && value.title.trim().length <= 60 && value.note.length <= 100;
  return <form className="space-y-3 rounded-lg border border-slate-200 dark:border-notion-border p-3" onSubmit={(event) => {
    event.preventDefault(); if (valid && !saving) onSubmit(value);
  }}>
    <Field label="タイトル"><input autoFocus className="input" maxLength={60} value={value.title} disabled={saving} onChange={(e) => setValue({ ...value, title: e.target.value })} /></Field>
    <Field label="補足"><input className="input" maxLength={100} value={value.note} disabled={saving} onChange={(e) => setValue({ ...value, note: e.target.value })} /></Field>
    <FormActions onCancel={() => { if (!saving) onCancel(); }} onDelete={onDelete ? () => { if (!saving) onDelete(); } : undefined} canSave={valid} saving={saving} error={failed} />
  </form>;
}
