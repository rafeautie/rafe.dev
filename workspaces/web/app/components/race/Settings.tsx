import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { useEffect, useState, type CSSProperties } from 'react';
import { DialogClose, DialogPortal, DialogTitle } from '~/components/ui/dialog';
import type { Standing, ToRoom } from '~/lib/race/room';
import type { Settings as Rules } from '~/lib/race/settings';
import type { Box, Layout, Menu } from './hud';
import { chips, ghost, hit, useSelection } from './shared';

// Your name, where you stand, and the way out of debt. It opens from the
// wallet, over the race, and like everything else there it is drawn on the
// race (hud.ts): this is the dialog itself, unseen, with a real field and
// real buttons over the ones drawn, so it traps focus, closes on Escape and
// can be read out.

// What was asked of the server, so that its answer is read as an answer to
// this: a name is saved when it comes back changed, a bankruptcy when the
// debt is gone, and a refusal arrives as `problem`.
type Asked = { kind: 'name'; from: string } | { kind: 'bankrupt' };

type Props = {
	you: Standing;
	/** The money rules of the race on now. */
	rules: Rules;
	problem: string | null;
	send: (message: ToRoom) => boolean;
	/** Where the graphics are, where on the page that is, and how to tell them what to show. */
	at: Layout['menu'];
	over: (box: Box) => CSSProperties;
	show: (menu: Menu | null) => void;
};

export function Settings({ container, ...props }: Props & { container: HTMLElement | null }) {
	return (
		<DialogPortal container={container}>
			<DialogPrimitive.Popup className="absolute inset-0 outline-none">
				<Open {...props} />
			</DialogPrimitive.Popup>
		</DialogPortal>
	);
}

// What is in the dialog. It is only there while the dialog is open, so it
// starts from your name as it is each time.
function Open({ you, rules, problem, send, at, over, show }: Props) {
	const [name, setName] = useState(you.name);
	const [typing, setTyping] = useState(false);
	const [field, selection] = useSelection();
	const [asked, setAsked] = useState<Asked | null>(null);
	const [sure, setSure] = useState(false);
	// a refusal already showing when this opened was about something else
	const [stale] = useState(problem);
	const refusal = asked && problem && problem !== stale ? problem : null;
	const trimmed = name.trim();
	const fresh = trimmed !== '' && trimmed !== you.name;
	const saved = asked?.kind === 'name' && you.name !== asked.from;
	const nameRefusal = asked?.kind === 'name' ? refusal : null;
	const bankruptRefusal = asked?.kind === 'bankrupt' ? refusal : null;
	const debt = you.balance < 0;
	const note = nameRefusal
		? { text: nameRefusal, bad: true }
		: saved
			? { text: 'Saved', bad: false }
			: null;

	// the graphics show whatever this last rendered, and nothing once it is gone
	useEffect(() => {
		show({ name, typing, selection, fresh, note, refusal: bankruptRefusal, sure });
	});
	useEffect(() => () => show(null), [show]);

	return (
		<>
			<DialogTitle className="sr-only">Settings</DialogTitle>
			{/* anywhere off the panel closes it */}
			<DialogClose aria-hidden tabIndex={-1} className="absolute inset-0 cursor-default" />
			<div
				className="absolute"
				style={over({ ...at.panel, h: debt ? 170 : 91 })}
				onClick={(event) => event.stopPropagation()}
			/>
			<form
				onSubmit={(event) => {
					event.preventDefault();
					if (!fresh) return;
					if (send({ type: 'name', name })) setAsked({ kind: 'name', from: you.name });
				}}
			>
				<input
					ref={field}
					aria-label="Name"
					aria-invalid={nameRefusal ? true : undefined}
					value={name}
					maxLength={16}
					autoComplete="off"
					onChange={(event) => {
						setName(event.target.value);
						setAsked(null);
					}}
					onFocus={() => setTyping(true)}
					onBlur={() => setTyping(false)}
					className={ghost}
					style={over(at.name)}
				/>
				<button
					type="submit"
					disabled={!fresh}
					aria-label="Save"
					className={hit}
					style={over(at.save)}
				/>
			</form>
			{debt &&
				(sure ? (
					<>
						<button
							type="button"
							aria-label="Confirm bankruptcy"
							onClick={() => {
								if (send({ type: 'bankrupt' })) setAsked({ kind: 'bankrupt' });
								setSure(false);
							}}
							className={hit}
							style={over(at.confirm)}
						/>
						<button
							type="button"
							aria-label="Cancel"
							onClick={() => setSure(false)}
							className={hit}
							style={over(at.cancel)}
						/>
					</>
				) : (
					<button
						type="button"
						aria-label="Declare bankruptcy"
						onClick={() => setSure(true)}
						className={hit}
						style={over(at.bankrupt)}
					/>
				))}
			<DialogClose
				render={<button type="button" aria-label="Close" className={hit} style={over(at.close)} />}
			/>

			{/* what the panel says, as text */}
			<div className="sr-only">
				<p role="status">{note?.text}</p>
				<p>
					Balance {chips(you.balance)}
					{debt && `, credit left ${chips(you.balance + rules.debtCap)}`}, bankruptcies{' '}
					{you.bankruptcies}.
				</p>
				{debt && (
					<p>
						Declaring bankruptcy wipes your debt and puts you back to {chips(rules.start)} chips. It
						is counted on the leaderboard.{sure && ' Are you sure?'}
					</p>
				)}
				<p role="status">{bankruptRefusal}</p>
			</div>
		</>
	);
}
