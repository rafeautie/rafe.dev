import { ThemeProvider } from '../theme/ThemeProvider';
import {
  SIDEBAR_COOKIE_NAME,
  SidebarProvider,
  SidebarTrigger,
} from '../ui/sidebar';
import AppSidebar from './AppSidebar';
import DarkModeToggle from './DarkModeToggle';
import { useCookies } from 'react-cookie';

interface Props {
  children: React.ReactNode;
}

const Layout = ({ children }: Props) => {
  const [cookies] = useCookies([SIDEBAR_COOKIE_NAME]);
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <SidebarProvider defaultOpen={cookies[SIDEBAR_COOKIE_NAME]}>
        <AppSidebar />
        <main className="p-3 w-full">
          <div className="flex items-center justify-between">
            <SidebarTrigger />
            <DarkModeToggle />
          </div>
          {children}
        </main>
      </SidebarProvider>
    </ThemeProvider>
  );
};

export default Layout;
