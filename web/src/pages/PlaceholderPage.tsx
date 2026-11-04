import { MainLayout } from '@/components/Layout/MainLayout';

interface PlaceholderPageProps {
  title: string;
  description: string;
}

export const PlaceholderPage = ({ title, description }: PlaceholderPageProps) => (
  <MainLayout>
    <div className="mx-auto max-w-7xl">
      <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
      <p className="mt-2 text-gray-600">{description}</p>
      <div className="mt-8 rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">
        This module is ready for development.
      </div>
    </div>
  </MainLayout>
);
