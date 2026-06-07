import { motion } from 'framer-motion';
import { TheRaceLogo } from './TheRaceLogo';

const LIGHTS = [0, 1, 2, 3, 4];
// One full cycle: lights arm left-to-right (red), hold, then "lights out".
const CYCLE = 2.4;

interface ConnectingViewProps {
	gameId: string;
}

export function ConnectingView({ gameId }: ConnectingViewProps) {
	return (
		<div className="flex h-dvh flex-col items-center justify-center gap-8 p-10">
			<TheRaceLogo />

			{/* F1-style starting gantry — lights arm one by one, then go out. */}
			<div
				className="flex gap-2.5 rounded-xl bg-black/30 p-3 ring-1 ring-white/5"
				role="status"
				aria-label={`Connecting to ${gameId}`}
			>
				{LIGHTS.map((i) => (
					<motion.span
						key={i}
						className="size-4 rounded-full bg-the-race-red-from"
						initial={{ opacity: 0.12 }}
						animate={{
							opacity: [0.12, 0.12, 1, 1, 0.12],
							boxShadow: [
								'0 0 0px 0px var(--color-the-race-red-from)',
								'0 0 0px 0px var(--color-the-race-red-from)',
								'0 0 10px 1px var(--color-the-race-red-from)',
								'0 0 10px 1px var(--color-the-race-red-from)',
								'0 0 0px 0px var(--color-the-race-red-from)'
							]
						}}
						transition={{
							duration: CYCLE,
							times: [0, i * 0.12, i * 0.12 + 0.12, 0.78, 0.88],
							ease: 'easeOut',
							repeat: Infinity
						}}
					/>
				))}
			</div>

			<p className="font-mono text-sm tracking-wide text-white/45">
				Connecting to <span className="font-bold text-white/70">{gameId}</span>…
			</p>
		</div>
	);
}
