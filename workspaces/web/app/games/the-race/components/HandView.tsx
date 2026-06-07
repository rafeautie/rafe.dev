import type { Card, PublicCarState } from '../engine/types';
import { isExtendCard } from '../engine/cards';
import { PlayingCard } from './PlayingCard';
import { Card as CardComponent, CardContent } from '~/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { livery } from '../engine/liveries';
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
				<TabsList variant="the-race-bg" className="space-x-1 p-1">
					{myCars.map((car) => {
						const isTabActive = activeCarIds?.includes(car.id);
						return (
							<RaceBorderBeam active={isTabActive}>
								<TabsTrigger key={car.id} value={String(car.id)} className="px-3 py-1.5">
									#{livery(car.liveryId).number}
								</TabsTrigger>
							</RaceBorderBeam>
						);
					})}
				</TabsList>
			)}
			{myCars.map((car) => {
				return (
					<TabsContent key={car.id} value={String(car.id)}>
						<CardComponent variant="the-race-bg" className="relative h-74 p-0">
							<CardContent className="flex p-0">
								<div className="top-0 bottom-0 flex w-full flex-1 items-center justify-center px-10 py-25 pr-0">
									<CarPiece
										liveryId={car.liveryId}
										className="w-40 -rotate-90 drop-shadow-[0_0_40px_rgba(255,255,255,0.7)]"
									/>
								</div>
								<div className="flex h-74 flex-5 scrollbar-none flex-wrap items-center justify-center gap-4 overflow-y-scroll px-15 py-15">
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
