import { useIsMobile } from '@/hooks/use-mobile';
import { ThemeProvider } from '../theme/ThemeProvider';
import {
  SIDEBAR_COOKIE_NAME,
  SidebarProvider,
  SidebarTrigger,
} from '../ui/sidebar';
import AppSidebar from './AppSidebar';
import DarkModeToggle from './DarkModeToggle';
import { useCookies } from 'react-cookie';
import { cn } from '@/lib/utils';

interface Props {
  children: React.ReactNode;
}

const Layout = ({ children }: Props) => {
  const isMobile = useIsMobile();
  const [cookies] = useCookies([SIDEBAR_COOKIE_NAME]);
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <SidebarProvider defaultOpen={cookies[SIDEBAR_COOKIE_NAME]}>
        <AppSidebar />
        <main className="w-full">
          <div
            className={cn(
              'flex items-center justify-between sticky top-0 p-3 bg-background z-50 border-b-[1px] border-b-sidebar-border',
              { 'border-b-0': isMobile }
            )}
          >
            <SidebarTrigger />
            <DarkModeToggle />
          </div>
          <div className="p-3">{children}</div>
        </main>
      </SidebarProvider>
    </ThemeProvider>
  );
};

export default Layout;
