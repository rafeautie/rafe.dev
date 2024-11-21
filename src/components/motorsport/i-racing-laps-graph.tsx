import { useMemo, useState } from 'react';
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
import { DateTime } from 'luxon';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { dateTimeFrom } from '@/lib/time';
import { Skeleton } from '../ui/skeleton';
import { useIRacingStats } from '@/hooks/use-iracing-stats';

type AggregateStats = {
  cleanLapsDriven: number;
  invalidLapsDriven: number;
};

type DateFilterModes = 'all-time' | 'last-3-months' | 'last-week';

const chartConfig = {
  cleanLapsDriven: {
    label: 'Clean Laps Driven',
    color: 'hsl(var(--chart-1))',
  },
  invalidLapsDriven: {
    label: 'Invalid Laps Driven',
    color: 'hsl(var(--chart-3))',
  },
} satisfies ChartConfig;

const IRacingLapsGraph = () => {
  const { data, isLoading } = useIRacingStats();

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
    const dataByDay: Record<string, AggregateStats> = {};

    drivingStats.forEach((item) => {
      if (!dataByDay[item.day]) {
        dataByDay[item.day] = {
          cleanLapsDriven: 0,
          invalidLapsDriven: 0,
        };
      }

      dataByDay[item.day].cleanLapsDriven += item?.cleanLapsDriven ?? 0;
      dataByDay[item.day].invalidLapsDriven -=
        item.lapsDriven - item.cleanLapsDriven;
    });

    let processedData = Object.entries(dataByDay)
      .map(([day, dayStats]) => ({
        day,
        ...dayStats,
      }))
      .sort(
        (a, b) =>
          dateTimeFrom(a.day).toMillis() - dateTimeFrom(b.day).toMillis()
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
    <Card className="flex-1">
      <CardHeader>
        <div className="flex flex-col md:flex-row justify-between gap-x-5 gap-y-4">
          <div className="flex flex-col gap-1">
            <CardTitle>Lap Performance</CardTitle>
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
          <ChartContainer config={chartConfig}>
            <BarChart accessibilityLayer data={chartData} stackOffset="sign">
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
                    formatter={(value, name) => {
                      const chartItem =
                        chartConfig[name as keyof typeof chartConfig];
                      return (
                        <>
                          <div
                            className="shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg] h-2.5 w-2.5"
                            style={
                              {
                                '--color-bg': chartItem.color,
                                '--color-border': chartItem.color,
                              } as React.CSSProperties
                            }
                          />
                          <div className="flex flex-1 justify-between leading-none gap-x-2 items-center">
                            <span className="text-muted-foreground">
                              {chartItem.label}
                            </span>
                            <span className="font-mono font-medium tabular-nums text-foreground">
                              {Math.abs(value as number)}
                            </span>
                          </div>
                        </>
                      );
                    }}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar
                dataKey="cleanLapsDriven"
                stackId="a"
                fill={chartConfig.cleanLapsDriven.color}
                radius={[8, 8, 0, 0]}
              />
              <Bar
                dataKey="invalidLapsDriven"
                stackId="a"
                fill={chartConfig.invalidLapsDriven.color}
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </Skeleton>
      </CardContent>
    </Card>
  );
};

export default IRacingLapsGraph;
