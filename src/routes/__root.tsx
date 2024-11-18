import Layout from '@/components/layout/Layout';
import { createRootRoute, Outlet } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: () => (
    <>
      <Layout>
        <Outlet />
      </Layout>
    </>
  ),
});
