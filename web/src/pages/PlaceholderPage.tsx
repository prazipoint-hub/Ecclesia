import { MainLayout } from '@/components/Layout/MainLayout';
import { Construction } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
  description: string;
}

export const PlaceholderPage = ({ title, description }: PlaceholderPageProps) => (
  <MainLayout>
    <div className="mx-auto max-w-4xl space-y-7">
      <div>
        <p className="page-eyebrow">Ecclesia workspace</p>
        <h1 className="mt-2 text-2xl font-medium text-gray-950 sm:text-2xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-gray-600">{description}</p>
      </div>
      <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white/60 p-8 text-center shadow-card">
        <span className="rounded-lg bg-primary-50 p-4 text-primary-700">
          <Construction className="h-7 w-7" />
        </span>
        <h2 className="mt-4 text-lg font-medium text-gray-950">
          This workspace is being prepared
        </h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-600">
          The module is part of the Ecclesia roadmap and will appear here when it is ready.
        </p>
      </div>
    </div>
  </MainLayout>
);
