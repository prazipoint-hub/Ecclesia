import { useState } from 'react';
import type { ReactNode } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { InstallPrompt } from '@/components/common/InstallPrompt';
import { OfflineBanner } from '@/components/common/OfflineBanner';

interface MainLayoutProps {
  children: ReactNode;
}

export const MainLayout = ({ children }: MainLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-xl bg-primary-950 px-4 py-2.5 text-sm font-semibold text-white shadow-lift transition-transform focus:translate-y-0"
      >
        Skip to main content
      </a>
      <OfflineBanner />
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main id="main-content" tabIndex={-1} className="lg:ml-72">
        <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-10">{children}</div>
      </main>
      <InstallPrompt />
    </div>
  );
};
