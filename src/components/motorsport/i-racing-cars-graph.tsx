import { useMemo, useState } from 'react';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ScalingText,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Bar, BarChart, LabelList, XAxis, YAxis } from 'recharts';
import { Skeleton } from '../ui/skeleton';
import { useIRacingStats } from '@/hooks/use-iracing-stats';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { CarItem } from 'shared/types';
import { secondsToHours } from '@/lib/time';
import { useIsMobile } from '@/hooks/use-mobile';

type AggregateCarDataItem = {
  timeOnTrack: number;
  lapsDriven: number;
};

type SortMode = keyof AggregateCarDataItem;

const chartConfig = {
  timeOnTrack: {
    label: 'Time On Track',
    color: 'hsl(var(--chart-1))',
  },
  car: {
    label: 'Track',
  },
  lapsDriven: {
    label: 'Laps Driven',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig;

const IRacingCarsGraph = () => {
  const { data, isLoading } = useIRacingStats();

  const isMobile = useIsMobile();
  const numberOfCarsToDisplay = isMobile ? 5 : 10;

  const [sortMode, setSortMode] = useState<SortMode>('lapsDriven');
  const chartItem = chartConfig[sortMode];

  const carData = useMemo(() => {
    const carsDriven = data?.carsDriven ?? [];
    const carsById: Record<string, CarItem> = {};

    carsDriven.forEach((car) => {
      carsById[car.id] = car;
    });

    return carsById;
  }, [data]);

  const chartData = useMemo(() => {
    const drivingStats = data?.drivingStatistics ?? [];
    const dataByCar: Record<string, AggregateCarDataItem> = {};

    drivingStats.forEach(({ car, timeOnTrack, lapsDriven }) => {
      if (!dataByCar[car]) {
        dataByCar[car] = { timeOnTrack: 0, lapsDriven: 0 };
      }

      dataByCar[car].timeOnTrack += timeOnTrack;
      dataByCar[car].lapsDriven += lapsDriven;
    });

    return Object.entries(dataByCar)
      .map(([car, trackStats]) => ({
        car,
        ...trackStats,
      }))
      .sort((a, b) => b[sortMode] - a[sortMode])
      .slice(0, numberOfCarsToDisplay);
  }, [data, sortMode, numberOfCarsToDisplay]);

  const formatter = (value: number | string | undefined): string => {
    switch (sortMode) {
      case 'timeOnTrack':
        return secondsToHours(value);
      default:
        return String(value);
    }
  };

  return (
    <Card className="flex-1">
      <CardHeader>
        <div className="flex flex-col md:flex-row justify-between gap-5">
          <div className="flex flex-col">
            <CardTitle>Top {numberOfCarsToDisplay} Cars</CardTitle>
            <CardDescription className="ml-1">{`by ${chartItem.label}`}</CardDescription>
          </div>
          <Tabs
            value={sortMode}
            onValueChange={(v) => setSortMode(v as SortMode)}
          >
            <TabsList>
              <TabsTrigger value="lapsDriven">
                {chartConfig.lapsDriven.label}
              </TabsTrigger>
              <TabsTrigger value="timeOnTrack">
                {chartConfig.timeOnTrack.label}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton loading={isLoading}>
          <ChartContainer config={chartConfig}>
            <BarChart
              accessibilityLayer
              data={chartData}
              layout="vertical"
              margin={{ right: 60 }}
            >
              <XAxis type="number" dataKey={sortMode} hide />
              <YAxis
                dataKey="car"
                type="category"
                tickLine={false}
                axisLine={false}
                orientation="right"
                hide
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value: number) => carData[value].name}
                    formatter={(value) => {
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
                            <div className="grid gap-1.5">
                              <span className="text-muted-foreground">
                                {chartItem.label}
                              </span>
                            </div>
                            <span className="font-mono font-medium tabular-nums text-foreground">
                              {formatter(value as number)}
                            </span>
                          </div>
                        </>
                      );
                    }}
                  />
                }
              />
              <Bar dataKey={sortMode} fill={chartItem.color} radius={10}>
                <LabelList
                  dataKey="car"
                  position="insideLeft"
                  content={({ value, ...props }) => (
                    <ScalingText className="fill-white" {...props}>
                      {carData[value as string].name}
                    </ScalingText>
                  )}
                />
                <LabelList
                  dataKey={sortMode}
                  position="right"
                  content={({ value, width, x, ...props }) => (
                    <ScalingText
                      className="fill-foreground"
                      x={Number(x) + Number(width) - 5}
                      width={Number(width) * 2}
                      {...props}
                    >
                      {formatter(value)}
                    </ScalingText>
                  )}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        </Skeleton>
      </CardContent>
    </Card>
  );
};

export default IRacingCarsGraph;
