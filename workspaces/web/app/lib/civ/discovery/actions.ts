// The fourteen things a person can try with materials in their hands. The
// list is closed on purpose: new content is new materials and new rules, not
// new verbs, so the model only ever has to pick from this short menu.

export const ACTIONS = {
	strike: { description: 'hit one thing with another: knapping, hammering, sparks' },
	heat: { description: 'put something in or on a fire: cook, fire, smelt, melt' },
	soak: { description: 'leave something in water to soften or change' },
	dry: { description: 'leave something in sun and air until the water is gone' },
	grind: { description: 'rub or crush against stone or wood: flour, powder, friction' },
	mix: { description: 'work two or more things together into something else' },
	shape: { description: 'form, twist or weave soft things into a new form' },
	bind: { description: 'tie or lash things together with fibre or thong' },
	cut: { description: 'work something with a sharp edge' },
	dig: { description: 'dig into the ground with a tool' },
	build: { description: 'put things together into something that stands' },
	plant: { description: 'put seed or root in the ground to grow' },
	tame: { description: 'win over a young animal with food and patience' },
	blow: { description: 'force air at a fire or through a pipe' }
} as const;

export type ActionId = keyof typeof ACTIONS;
export const ACTION_IDS = Object.keys(ACTIONS) as ActionId[];

export function isAction(id: string): id is ActionId {
	return Object.hasOwn(ACTIONS, id);
}
