// Images imported with a vite-imagetools query (vite.config.ts)
declare module '*&as=srcset' {
	const srcset: string;
	export default srcset;
}

declare module '*&format=webp' {
	const src: string;
	export default src;
}
