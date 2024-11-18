import { Home, Code, CarFront, LucideProps } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Link, useMatch } from '@tanstack/react-router';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
import { FileRouteTypes } from '@/routeTree.gen';

interface NavigationItem {
  title: string;
  url: FileRouteTypes['fullPaths'];
  icon: ForwardRefExoticComponent<
    Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>
  >;
}

const items: NavigationItem[] = [
  {
    title: 'Home',
    url: '/',
    icon: Home,
  },
  {
    title: 'Work',
    url: '/work',
    icon: Code,
  },
  {
    title: 'Motorsport',
    url: '/motorsport',
    icon: CarFront,
  },
];

const AppSidebar = () => {
  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>rafe.dev</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <AppSidebarItem {...item} key={item.title} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
};

const AppSidebarItem = (item: NavigationItem) => {
  const match = useMatch({
    from: item.url,
    shouldThrow: false,
  });

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={match != null}>
        <Link to={item.url}>
          <item.icon />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

export default AppSidebar;
