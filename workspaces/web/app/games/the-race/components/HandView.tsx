import type { Card, PublicCarState } from '../engine/types';
import { isExtendCard } from '../engine/cards';
import { PlayingCard } from './PlayingCard';
import { Card as CardComponent, CardContent } from '~/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { cn } from '~/lib/utils';
import { CarInfoCard } from './CarInfoCard';
import { CarPiece } from './CarPiece';
import { RaceBorderBeam } from './RaceBorderBeam';

interface HandViewProps {
	selectedMainId: string | null;
	pairRedlineId: string | null;
	canPairRedline: boolean;
	onSelectMain: (cardId: string | null) => void;
	onToggleRedlinePair: () => void;
	myCars?: PublicCarState[];
	selectedCarId?: number;
	onSelectCar?: (carId: number) => void;
	activeCarIds?: number[];
}

export function HandView({
	selectedMainId,
	pairRedlineId,
	canPairRedline,
	onSelectMain,
	onToggleRedlinePair,
	myCars,
	selectedCarId,
	onSelectCar,
	activeCarIds
}: HandViewProps) {
	function renderCards(hand: Card[]) {
		// Sort for display by ascending value, with Redlines (no value) last. Cards
		// carry stable ids, so selection and dispatch are keyed by id — the visual
		// order is free to differ from the underlying hand order.
		const ordered = [...hand].sort((a, b) => {
			const aRedline = a.kind === 'redline';
			const bRedline = b.kind === 'redline';
			if (aRedline !== bRedline) return aRedline ? 1 : -1;
			if (a.kind === 'regular' && b.kind === 'regular') return a.value - b.value;
			return 0;
		});
		return ordered.map((card) => {
			const isMain = selectedMainId === card.id;
			const isPaired = pairRedlineId === card.id;
			const isRedline = card.kind === 'redline';
			const isRedlinePairMode = isRedline && canPairRedline;
			return (
				<PlayingCard
					key={card.id}
					card={card}
					selected={isMain}
					paired={isPaired}
					isExtendable={isExtendCard(card)}
					onClick={() => {
						if (isRedlinePairMode) {
							onToggleRedlinePair();
						} else {
							onSelectMain(isMain ? null : card.id);
						}
					}}
				/>
			);
		});
	}

	if (!myCars || myCars.length === 0 || !onSelectCar) return null;

	return (
		<Tabs
			value={String(selectedCarId)}
			onValueChange={(v) => onSelectCar(Number(v))}
			className="w-full"
		>
			{myCars.length > 1 && (
				<TabsList variant="ghost" className="space-x-1">
					{myCars.map((car) => {
						const isTabActive = activeCarIds?.includes(car.id);
						const isSelected = car.id === selectedCarId;
						return (
							<RaceBorderBeam key={car.id} active={isTabActive}>
								<TabsTrigger
									value={String(car.id)}
									className="h-auto border-0 bg-transparent p-0 data-active:bg-transparent dark:data-active:border-0 dark:data-active:bg-transparent"
								>
									<CarInfoCard
										liveryId={car.liveryId}
										handSize={car.handSize}
										className={cn(
											'transition-opacity',
											isSelected ? 'ring-1 ring-white/0' : 'brightness-70'
										)}
									/>
								</TabsTrigger>
							</RaceBorderBeam>
						);
					})}
				</TabsList>
			)}
			{myCars.map((car) => {
				return (
					<TabsContent key={car.id} value={String(car.id)}>
						<CardComponent
							variant="the-race-bg"
							className="relative h-[clamp(13rem,28dvh,18.5rem)] p-0"
						>
							<CardContent className="flex h-full p-0">
								<div className="flex w-full flex-1 flex-col items-center justify-center gap-6 px-10 pr-0">
									<CarPiece liveryId={car.liveryId} className="w-40 -rotate-90" />
									<CarInfoCard liveryId={car.liveryId} handSize={car.handSize} />
								</div>
								<div className="flex h-full flex-5 scrollbar-none flex-wrap items-center justify-center gap-4 overflow-y-scroll px-12 py-6">
									{renderCards(car.hand ?? [])}
								</div>
							</CardContent>
						</CardComponent>
					</TabsContent>
				);
			})}
		</Tabs>
	);
}
