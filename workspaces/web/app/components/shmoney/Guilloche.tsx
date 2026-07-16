export function Guilloche({ className }: { className?: string }) {
	const rings = [
		{ count: 20, rx: 380, ry: 130, offset: 0 },
		{ count: 20, rx: 270, ry: 84, offset: 4.5 }
	];
	return (
		<svg viewBox="0 0 800 800" aria-hidden="true" className={className}>
			<g fill="none" stroke="currentColor" strokeWidth="0.7">
				{rings.map((ring, r) =>
					Array.from({ length: ring.count }, (_, i) => (
						<ellipse
							key={`${r}-${i}`}
							cx="400"
							cy="400"
							rx={ring.rx}
							ry={ring.ry}
							transform={`rotate(${(i * 180) / ring.count + ring.offset} 400 400)`}
						/>
					))
				)}
			</g>
		</svg>
	);
}
