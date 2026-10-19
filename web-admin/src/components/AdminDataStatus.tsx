import { Button } from './ui/button';

export default function AdminDataStatus({ error, page, total, loading, onPage }: {
  error: string; page: number; total: number | null; loading: boolean; onPage: (page: number) => void;
}) {
  return <div className="space-y-2">
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <p className="text-sm text-gray-600">Page {page}. Search, filters and farm summaries apply to loaded rows only. Each list loads at most 100 rows per page.</p>
    <div className="flex gap-2">
      <Button variant="outline" disabled={loading || page === 1} onClick={() => onPage(page - 1)}>Previous page</Button>
      <Button variant="outline" disabled={loading || total === null || page * 100 >= total} onClick={() => onPage(page + 1)}>Next page</Button>
    </div>
  </div>;
}
