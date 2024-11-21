import { doRequest } from '@/lib/network';
import { useQuery } from '@tanstack/react-query';
import { StatsResponse } from 'shared/types';

// import { mockData } from '@/components/motorsport/mockData';

export const useIRacingStats = () => {
  return useQuery({
    queryKey: ['iracing-stats'],
    queryFn: () => doRequest<StatsResponse>('/api/stats'),
    // queryFn: () => mockData as StatsResponse,
  });
};
