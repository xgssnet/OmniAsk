import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell, viewFromUrl } from '@/components/AppShell';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Workspace } from '@/components/Workspace';
import { AppStateProvider } from '@/state/AppStateProvider';
import '@/styles/globals.css';

const container = document.getElementById('root');
if (!container) throw new Error('未找到 #root 节点');

createRoot(container).render(
  <StrictMode>
    <div className="h-screen w-full">
      <AppStateProvider>
        <ThemeProvider>
          <AppShell variant="full" initialView={viewFromUrl()}>
            <Workspace />
          </AppShell>
        </ThemeProvider>
      </AppStateProvider>
    </div>
  </StrictMode>,
);
