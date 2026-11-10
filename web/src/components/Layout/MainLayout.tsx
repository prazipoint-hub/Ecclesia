import { useState } from 'react';
import type { ReactNode } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { InstallPrompt } from '@/components/common/InstallPrompt';
import { PreviewBanner } from '@/components/common/PreviewBanner';
import { OfflineBanner } from '@/components/common/OfflineBanner';

interface MainLayoutProps {
  children: ReactNode;
}

export const MainLayout = ({ children }: MainLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white shadow-lg transition-transform focus:translate-y-0"
      >
        Skip to main content
      </a>
      <OfflineBanner />
      <PreviewBanner />
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main id="main-content" tabIndex={-1} className="lg:ml-[240px]">
        <div className="px-4 py-5 sm:px-6 lg:px-8">{children}</div>
      </main>
      <InstallPrompt />
    </div>
  );
};
