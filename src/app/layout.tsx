import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Job Tracker CRM - Dispatch & Estimating',
  description: 'Internal job tracking web application for dispatchers and estimators',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 antialiased">
        <header className="border-b border-slate-200 bg-white sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                JT
              </div>
              <div>
                <h1 className="text-base font-semibold text-slate-900 leading-tight">
                  Job Tracking CRM
                </h1>
                <p className="text-xs text-slate-500">Estimating & Dispatch Operations</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                Phase 1: Estimating Ingestion
              </span>
              <div className="text-xs text-slate-400">
                Calendar Manager Active
              </div>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
