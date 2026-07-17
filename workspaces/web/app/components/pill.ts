// Glass pill: translucent fill, blurred backdrop, hairline border. Shared by
// the shmoney screenshot caption and the photography lightbox caption so the
// two cannot drift apart.
//
// A class rather than a component because the callers need different elements:
// shmoney's caption is a motion.p (it animates on layout) and the lightbox
// caption is a figcaption. Compose it with cn() and add padding and text
// styling at the call site.
export const PILL_CLASS =
	'rounded-full border border-border bg-background/60 shadow-lg backdrop-blur-md';
