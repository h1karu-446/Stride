// PostgREST caps each response at `max_rows` (1000 in supabase/config.toml),
// so reads that must return every row fetch fixed-size pages until a short one.
// Callers must order by a unique key (e.g. add `id`) so pages neither skip nor
// repeat rows, and must build a fresh query for every page.
export const PAGE_SIZE = 500;

type PageResult<T> = { data: T[] | null; error: unknown };

export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await page(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}
