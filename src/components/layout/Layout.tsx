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
        <main className="w-full">
          <div className="flex items-center justify-between sticky top-0 p-3 backdrop-blur-xl">
            <SidebarTrigger />
            <DarkModeToggle />
          </div>
          <div className="p-3 pt-3">{children}</div>
        </main>
      </SidebarProvider>
    </ThemeProvider>
  );
};

export default Layout;
