import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent
} from '~/components/ui/chart';
import { DAY, HOUR } from './format';

// One number over time, as an area. Hover for the value at each hour or day.
export function TimeChart<T extends { at: number }>({
	data,
	dataKey,
	label,
	hourly = false,
	format,
	className
}: {
	data: T[];
	dataKey: keyof T & string;
	label: string;
	hourly?: boolean;
	format: (value: number | null) => string;
	className?: string;
}) {
	const config = { [dataKey]: { label, color: 'var(--foreground)' } } satisfies ChartConfig;
	const when = (at: number) => (hourly ? HOUR.format(at) : DAY.format(at));
	return (
		<ChartContainer config={config} className={className ?? 'aspect-auto h-52 w-full'}>
			<AreaChart data={data} margin={{ top: 8, left: 0, right: 0, bottom: 0 }}>
				<defs>
					<linearGradient id={`fill-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor={`var(--color-${dataKey})`} stopOpacity={0.14} />
						<stop offset="100%" stopColor={`var(--color-${dataKey})`} stopOpacity={0} />
					</linearGradient>
				</defs>
				<CartesianGrid vertical={false} />
				<XAxis
					dataKey="at"
					tickLine={false}
					axisLine={false}
					tickMargin={8}
					minTickGap={40}
					tickFormatter={when}
				/>
				<YAxis
					width={56}
					tickLine={false}
					axisLine={false}
					tickMargin={4}
					tickCount={4}
					allowDecimals={false}
					tickFormatter={(value: number) => format(value)}
				/>
				<ChartTooltip
					cursor={false}
					content={
						<ChartTooltipContent
							indicator="dot"
							labelFormatter={(_, payload) => when(Number(payload?.[0]?.payload?.at))}
							formatter={(value) => (
								<div className="flex w-full items-center justify-between gap-4">
									<span className="text-muted-foreground">{label}</span>
									<span className="font-medium tabular-nums">
										{format(value === null || value === undefined ? null : Number(value))}
									</span>
								</div>
							)}
						/>
					}
				/>
				<Area
					dataKey={dataKey as string}
					type="monotone"
					stroke={`var(--color-${dataKey})`}
					strokeWidth={2}
					fill={`url(#fill-${dataKey})`}
					connectNulls
					isAnimationActive={false}
				/>
			</AreaChart>
		</ChartContainer>
	);
}
