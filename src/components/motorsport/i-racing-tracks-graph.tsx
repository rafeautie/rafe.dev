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
import { TrackItem } from 'shared/types';
import { secondsToHours } from '@/lib/time';
import { useIsMobile } from '@/hooks/use-mobile';

type AggregateTrackDataItem = {
  timeOnTrack: number;
  lapsDriven: number;
};

type SortMode = keyof AggregateTrackDataItem;

const chartConfig = {
  timeOnTrack: {
    label: 'Time On Track',
    color: 'hsl(var(--chart-1))',
  },
  track: {
    label: 'Track',
  },
  lapsDriven: {
    label: 'Laps Driven',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig;

const IRacingTracksGraph = () => {
  const { data, isLoading } = useIRacingStats();

  const isMobile = useIsMobile();
  const numberOfTracksToDisplay = isMobile ? 5 : 10;

  const [sortMode, setSortMode] = useState<SortMode>('lapsDriven');
  const chartItem = chartConfig[sortMode];

  const trackData = useMemo(() => {
    const tracksDriven = data?.tracksDriven ?? [];
    const tracksById: Record<string, TrackItem> = {};

    tracksDriven.forEach((track) => {
      tracksById[track.id] = track;
    });

    return tracksById;
  }, [data]);

  const chartData = useMemo(() => {
    const drivingStats = data?.drivingStatistics ?? [];
    const dataByTrack: Record<string, AggregateTrackDataItem> = {};

    drivingStats.forEach(({ track, timeOnTrack, lapsDriven }) => {
      if (!dataByTrack[track]) {
        dataByTrack[track] = { timeOnTrack: 0, lapsDriven: 0 };
      }

      dataByTrack[track].timeOnTrack += timeOnTrack;
      dataByTrack[track].lapsDriven += lapsDriven;
    });

    return Object.entries(dataByTrack)
      .map(([track, trackStats]) => ({
        track,
        ...trackStats,
      }))
      .sort((a, b) => b[sortMode] - a[sortMode])
      .slice(0, numberOfTracksToDisplay);
  }, [data, sortMode, numberOfTracksToDisplay]);

  const formatter = (value: number) => {
    switch (sortMode) {
      case 'timeOnTrack':
        return secondsToHours(value);
      default:
        return value;
    }
  };

  return (
    <Card className="flex-1">
      <CardHeader>
        <div className="flex flex-col md:flex-row justify-between gap-5">
          <div className="flex flex-col">
            <CardTitle>Top {numberOfTracksToDisplay} Tracks</CardTitle>
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
              margin={{ right: 20 }}
            >
              <XAxis type="number" dataKey={sortMode} hide />
              <YAxis
                dataKey="track"
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
                    labelFormatter={(value: number) => trackData[value].name}
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
                            <span className="text-muted-foreground">
                              {chartItem.label}
                            </span>
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
                  dataKey="track"
                  position="insideLeft"
                  content={({ value, ...props }) => (
                    <ScalingText className="fill-white" {...props}>
                      {trackData[value as string].name}
                    </ScalingText>
                  )}
                />
                <LabelList
                  dataKey={sortMode}
                  position="right"
                  className="fill-foreground"
                  fontSize={12}
                  formatter={formatter}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        </Skeleton>
      </CardContent>
    </Card>
  );
};

export default IRacingTracksGraph;
