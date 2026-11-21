// The `section` search param of a page split into sections (Subsections), kept
// only when it names one of the page's sections. Otherwise it is set to
// undefined rather than left out: the router lays what validateSearch returns
// over the URL's own parameters, so a missing key would let the raw one through. It lives apart from the
// component on purpose: routes call it in validateSearch, which ships in the
// route tree every page loads, so it must not pull the sidebar's UI in with it.
export function readSection<K extends string>(
	keys: readonly K[],
	search: Record<string, unknown>
): { section?: K } {
	return { section: keys.includes(search.section as K) ? (search.section as K) : undefined };
}
