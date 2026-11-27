import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { useEffect, useState, type CSSProperties } from 'react';
import { DialogClose, DialogPortal, DialogTitle } from '~/components/ui/dialog';
import type { Standing, ToRoom } from '~/lib/race/room';
import { LOANS, type Box, type Layout, type Reup as Drawn } from './hud';
import { chips, ghost, hit, useSelection } from './shared';

// Out of chips: no chips left and no bets riding. It opens by itself when
// that happens, and again from the wallet or the slip. Like the settings it
// is drawn on the race (hud.ts); this is the dialog itself, unseen, with a
// real field and real buttons over the ones drawn.
//
// While the house will still lend, it borrows: any amount up to what is left
// under the re-up limit. Once it will not, the one way on is bankruptcy. A
// re-up that works closes it, since you are no longer out of chips.

type Props = {
	you: Standing;
	/** What the house will still lend you. */
	credit: number;
	/** The start a bankruptcy puts you back on. */
	start: number;
	problem: string | null;
	send: (message: ToRoom) => boolean;
	at: Layout['reup'];
	over: (box: Box) => CSSProperties;
	show: (reup: Drawn | null) => void;
};

export function Reup({ container, ...props }: Props & { container: HTMLElement | null }) {
	return (
		<DialogPortal container={container}>
			<DialogPrimitive.Popup className="absolute inset-0 outline-none">
				<Open {...props} />
			</DialogPrimitive.Popup>
		</DialogPortal>
	);
}

function Open({ you, credit, start, problem, send, at, over, show }: Props) {
	const [amount, setAmount] = useState(credit);
	const [typing, setTyping] = useState(false);
	const [field, selection] = useSelection();
	const [asked, setAsked] = useState(false);
	const [sure, setSure] = useState(false);
	// a refusal already showing when this opened was about something else
	const [stale] = useState(problem);
	const refusal = asked && problem && problem !== stale ? problem : null;
	const ready = Number.isInteger(amount) && amount >= 1 && amount <= credit;

	useEffect(() => {
		show({ amount, typing, selection, credit, sure, refusal });
	});
	useEffect(() => () => show(null), [show]);

	const to = (next: number) => {
		setAmount(next);
		setAsked(false);
	};
	function borrow() {
		if (ready && send({ type: 'reup', amount })) setAsked(true);
	}
	function bankrupt() {
		if (!sure) return setSure(true);
		if (send({ type: 'bankrupt' })) setAsked(true);
		setSure(false);
	}

	return (
		<>
			<DialogTitle className="sr-only">Out of chips</DialogTitle>
			{/* anywhere off the panel closes it, as Just watch does */}
			<DialogClose aria-hidden tabIndex={-1} className="absolute inset-0 cursor-default" />
			<div
				className="absolute"
				style={over(at.panel)}
				onClick={(event) => event.stopPropagation()}
			/>
			<div className="sr-only">
				{credit > 0 ? (
					<p>
						You're broke. Borrow from the house to keep betting, up to {chips(credit)} chips.
						Winnings pay the loan back first, and you're not in the green until it's paid off.
					</p>
				) : (
					<p>
						{you.debt > 0
							? `You owe the house ${chips(you.debt)}, as much as it lends, so it won't lend you more.`
							: "The house isn't lending right now."}{' '}
						Going bankrupt {you.debt > 0 ? 'wipes the loan and ' : ''}starts you again on{' '}
						{chips(start)} chips. It's counted on the leaderboard.
						{sure && ' Are you sure?'}
					</p>
				)}
				<p role="status">{refusal}</p>
			</div>
			{credit > 0 ? (
				<>
					<div role="group" aria-label="Amount to borrow">
						{LOANS.map((value, index) => {
							const of = value === 'Max' ? credit : value;
							return (
								<button
									key={value}
									type="button"
									disabled={of > credit}
									aria-pressed={amount === of}
									aria-label={
										value === 'Max' ? `All the house will lend: ${chips(credit)}` : `${value} chips`
									}
									onClick={() => to(of)}
									className={hit}
									style={over(at.amounts[index])}
								/>
							);
						})}
						<input
							ref={field}
							aria-label="Chips to borrow"
							inputMode="numeric"
							autoComplete="off"
							value={Number.isNaN(amount) ? '' : amount}
							onChange={(event) => to(Number(event.target.value.replace(/\D/g, '').slice(0, 7)))}
							onKeyDown={(event) => event.key === 'Enter' && borrow()}
							onFocus={() => setTyping(true)}
							onBlur={() => setTyping(false)}
							className={ghost}
							style={over(at.input)}
						/>
					</div>
					<button
						type="button"
						disabled={!ready}
						aria-label={`Re-up ${chips(amount || 0)}: you will owe ${chips(you.debt + (amount || 0))}`}
						onClick={borrow}
						className={hit}
						style={over(at.go)}
					/>
				</>
			) : (
				<button
					type="button"
					aria-label={sure ? 'Confirm bankruptcy' : 'Declare bankruptcy'}
					onClick={bankrupt}
					className={hit}
					style={over(at.go)}
				/>
			)}
			<DialogClose
				render={
					<button type="button" aria-label="Just watch" className={hit} style={over(at.watch)} />
				}
			/>
			<DialogClose
				render={<button type="button" aria-label="Close" className={hit} style={over(at.close)} />}
			/>
		</>
	);
}
