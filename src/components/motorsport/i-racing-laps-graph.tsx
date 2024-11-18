import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import { DrivingStatItem, StatsResponse } from 'shared/types';
import { DateTime } from 'luxon';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { dateTimeFrom } from '@/lib/motorsport';
import { doRequest } from '@/lib/network';
import { Skeleton } from '../ui/skeleton';

// import { mockData } from './mockData';

type AggregateStats = Pick<
  DrivingStatItem,
  'lapsDriven' | 'cleanLapsDriven' | 'day'
>;

type DateFilterModes = 'all-time' | 'last-3-months' | 'last-week';

const chartConfig = {
  lapsDriven: {
    label: 'Invalid Laps Driven',
    color: 'hsl(var(--chart-3))',
  },
  cleanLapsDriven: {
    label: 'Clean Laps Driven',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig;

const IRacingLapsGraph = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['iracing-stats'],
    queryFn: () => doRequest<StatsResponse>('/api/stats'),
    // queryFn: () => mockData as StatsResponse,
  });

  const [dateFilterMode, setDateFilterMode] =
    useState<DateFilterModes>('last-3-months');

  const minDate = useMemo(() => {
    switch (dateFilterMode) {
      case 'all-time':
        return null;
      case 'last-3-months':
        return DateTime.now().minus({ months: 3 });
      case 'last-week':
        return DateTime.now().minus({ week: 1 });
    }
  }, [dateFilterMode]);

  const chartData = useMemo(() => {
    const drivingStats = data?.drivingStatistics ?? [];

    const aggregateDataByDay = drivingStats.reduce<
      Record<string, AggregateStats>
    >((acc, item) => {
      const current = acc[item.day];
      const currentCleanLaps = item?.cleanLapsDriven ?? 0;
      const currentLaps = item?.lapsDriven ?? 0;
      const cleanLapsDriven =
        (current?.cleanLapsDriven ?? 0) + currentCleanLaps;
      const invalidLapsDriven =
        (current?.lapsDriven ?? 0) + (currentLaps - currentCleanLaps);

      acc[item.day] = {
        day: item.day,
        lapsDriven: invalidLapsDriven,
        cleanLapsDriven: cleanLapsDriven,
      };

      return acc;
    }, {});

    let processedData = Object.values(aggregateDataByDay).sort(
      (a, b) => dateTimeFrom(a.day).toMillis() - dateTimeFrom(b.day).toMillis()
    );

    if (minDate != null) {
      processedData = processedData.filter(
        ({ day }) => dateTimeFrom(day) >= minDate
      );
    }

    return processedData;
  }, [data, minDate]);

  const { startDate, endDate } = useMemo(
    () => ({
      startDate: dateTimeFrom(chartData.at(0)?.day).toLocaleString({
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      endDate: dateTimeFrom(chartData.at(-1)?.day).toLocaleString({
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    }),
    [chartData]
  );

  return (
    <Card className="animate-in duration-1000 fade-out-75 mt-10">
      <CardHeader>
        <div className="flex flex-col md:flex-row justify-between gap-x-5 gap-y-4">
          <div className="flex flex-col gap-1">
            <CardTitle>iRacing Laps</CardTitle>
            <Skeleton loading={isLoading}>
              <CardDescription>
                {startDate} - {endDate}
              </CardDescription>
            </Skeleton>
          </div>
          <Tabs
            value={dateFilterMode}
            onValueChange={(v) => setDateFilterMode(v as DateFilterModes)}
          >
            <TabsList>
              <TabsTrigger value="all-time">All Time</TabsTrigger>
              <TabsTrigger value="last-3-months">Last 3 Months</TabsTrigger>
              <TabsTrigger value="last-week">Last Week</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton loading={isLoading}>
          <ChartContainer config={chartConfig} className="w-full max-h-96">
            <BarChart accessibilityLayer data={chartData}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="day"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                tickFormatter={(value: string) =>
                  dateTimeFrom(value).toLocaleString({
                    month: 'short',
                    day: 'numeric',
                  })
                }
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) =>
                      dateTimeFrom(value).toLocaleString({
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    }
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar
                dataKey="lapsDriven"
                stackId="a"
                fill={chartConfig.lapsDriven.color}
                radius={[0, 0, 8, 8]}
              />
              <Bar
                dataKey="cleanLapsDriven"
                stackId="a"
                fill={chartConfig.cleanLapsDriven.color}
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </Skeleton>
      </CardContent>
      {/* <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 font-medium leading-none">
          Trending up by 5.2% this month <TrendingUp className="h-4 w-4" />
        </div>
        <div className="leading-none text-muted-foreground">
          Showing total visitors for the last 6 months
        </div>
      </CardFooter> */}
    </Card>
  );
};

export default IRacingLapsGraph;
