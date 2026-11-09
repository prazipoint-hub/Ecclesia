import { Eye } from 'lucide-react';
import { exitPreview, readPreview } from '@/utils/preview';

export const PreviewBanner = () => {
  const info = readPreview();
  if (!info) return null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-3 bg-indigo-100 px-4 py-2 text-sm font-medium text-indigo-900">
      <Eye className="h-4 w-4" />
      <span>Previewing as {info.roleName}. Read-only — nothing you do here changes data.</span>
      <button type="button" onClick={() => void exitPreview()} className="rounded-md bg-indigo-900 px-3 py-1 text-white">Exit preview</button>
    </div>
  );
};
