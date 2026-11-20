import { useId, useState } from 'react';
import { Button } from '~/components/ui/button';
import { DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { DEBT_CAP, START } from '~/lib/race/betting';
import type { Standing, ToRoom } from '~/lib/race/room';
import { chips } from './shared';

// Your name, where you stand, and the way out of debt. It lives in a dialog
// opened from the wallet, so the page below the race has nothing of it.

// What was asked of the server, so that its answer is read as an answer to
// this: a name is saved when it comes back changed, a bankruptcy when the
// debt is gone, and a refusal arrives as `problem`.
type Asked = { kind: 'name'; from: string } | { kind: 'bankrupt' };

export function Settings({
	you,
	problem,
	send
}: {
	you: Standing;
	problem: string | null;
	send: (message: ToRoom) => boolean;
}) {
	const nameId = useId();
	const errorId = useId();
	const [name, setName] = useState(you.name);
	const [asked, setAsked] = useState<Asked | null>(null);
	const [sure, setSure] = useState(false);
	// a refusal already showing when this opened was about something else
	const [stale] = useState(problem);
	const refusal = asked && problem && problem !== stale ? problem : null;
	const trimmed = name.trim();
	const saved = asked?.kind === 'name' && you.name !== asked.from;
	const nameRefusal = asked?.kind === 'name' ? refusal : null;
	const bankruptRefusal = asked?.kind === 'bankrupt' ? refusal : null;
	const debt = you.balance < 0;

	return (
		<DialogContent>
			<DialogHeader>
				<DialogTitle>Settings</DialogTitle>
			</DialogHeader>
			<form
				className="flex flex-col gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					if (!trimmed || trimmed === you.name) return;
					if (send({ type: 'name', name })) setAsked({ kind: 'name', from: you.name });
				}}
			>
				<label htmlFor={nameId} className="text-muted-foreground">
					Name
				</label>
				<div className="flex items-center gap-2">
					<Input
						id={nameId}
						value={name}
						maxLength={16}
						autoComplete="off"
						aria-invalid={nameRefusal ? true : undefined}
						aria-describedby={errorId}
						onChange={(event) => {
							setName(event.target.value);
							setAsked(null);
						}}
					/>
					<Button type="submit" variant="outline" disabled={!trimmed || trimmed === you.name}>
						Save
					</Button>
				</div>
				<p
					id={errorId}
					role="status"
					className={`min-h-4 text-xs leading-4 ${nameRefusal ? 'text-destructive' : 'text-muted-foreground'}`}
				>
					{nameRefusal ?? (saved ? 'Saved' : '')}
				</p>
			</form>
			<dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
				<dt className="text-muted-foreground">Balance</dt>
				<dd className={`text-right ${debt ? 'text-destructive' : ''}`}>{chips(you.balance)}</dd>
				{debt && (
					<>
						<dt className="text-muted-foreground">Credit left</dt>
						<dd className="text-right">{chips(you.balance + DEBT_CAP)}</dd>
					</>
				)}
				<dt className="text-muted-foreground">Bankruptcies</dt>
				<dd className="text-right">{you.bankruptcies}</dd>
			</dl>
			{debt && (
				<div className="flex flex-col gap-2">
					<p className="text-muted-foreground">
						Wipes your debt and puts you back to {chips(START)} chips. It is counted on the
						leaderboard.
					</p>
					{sure ? (
						<div className="flex items-center gap-2">
							<span className="font-medium">Are you sure?</span>
							<Button
								variant="destructive"
								onClick={() => {
									if (send({ type: 'bankrupt' })) setAsked({ kind: 'bankrupt' });
									setSure(false);
								}}
							>
								Confirm
							</Button>
							<Button variant="outline" onClick={() => setSure(false)}>
								Cancel
							</Button>
						</div>
					) : (
						<Button variant="destructive" className="self-start" onClick={() => setSure(true)}>
							Declare bankruptcy
						</Button>
					)}
					<p role="status" className="min-h-4 text-xs leading-4 text-destructive">
						{bankruptRefusal}
					</p>
				</div>
			)}
		</DialogContent>
	);
}
