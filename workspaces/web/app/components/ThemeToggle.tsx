import { cn } from '~/lib/utils';
import { setWritingTheme, useWritingTheme } from '~/lib/writing-theme';

// Each part of the icon eases to its dark pose with a slight overshoot.
const part =
	'origin-center transform-fill transition-[scale,translate,rotate,opacity] duration-750 ease-[cubic-bezier(0.34,1.3,0.64,1)] motion-reduce:transition-none';

// Dark mode switch for /writing. The icon is drawn from the `dark` class on
// <html> rather than from state, so it is right from the first paint, before
// hydration. The sun's rays spin away while a shadow slides across it, leaving
// a crescent.
export function ThemeToggle({ className }: { className?: string }) {
	const dark = useWritingTheme();

	return (
		<button
			type="button"
			aria-label="Dark mode"
			aria-pressed={dark}
			onClick={() => setWritingTheme(!dark)}
			className={cn(
				'theme-toggle -m-1.5 cursor-pointer rounded-md p-1.5 transition-[scale] duration-400 ease-out hover:scale-101',
				className
			)}
		>
			<svg
				viewBox="0 0 24 24"
				aria-hidden="true"
				className={cn(part, 'size-[18px] dark:rotate-40')}
			>
				<mask
					id="theme-toggle-eclipse"
					maskUnits="userSpaceOnUse"
					x="0"
					y="0"
					width="24"
					height="24"
				>
					<rect width="24" height="24" fill="#fff" />
					<circle
						cx="24"
						cy="4"
						r="8"
						className={cn(part, 'dark:translate-x-[-7px] dark:translate-y-[3px]')}
					/>
				</mask>
				{/* the mask sits on an untransformed group, so it does not grow with the sun */}
				<g mask="url(#theme-toggle-eclipse)">
					<circle
						cx="12"
						cy="12"
						r="5"
						fill="currentColor"
						className={cn(part, 'dark:scale-180')}
					/>
				</g>
				<g
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					className={cn(part, 'dark:scale-30 dark:-rotate-90 dark:opacity-0')}
				>
					<path d="M12 4V2M17.66 6.34l1.41-1.41M20 12h2M17.66 17.66l1.41 1.41M12 20v2M6.34 17.66l-1.41 1.41M4 12H2M6.34 6.34 4.93 4.93" />
				</g>
			</svg>
		</button>
	);
}
