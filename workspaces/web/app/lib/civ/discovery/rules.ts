// What happens when materials meet. Rules are written over properties where
// they can be (`#hard`, `#sharpbreak`, `#ore`), so combinations nobody listed
// still behave; exact ids are used where the story really is one thing.
//
// Slot words: `flint` exact material, `#hard` any with that property,
// `a|b` either, `~x` a tool that is used but kept. `needs` are extra things
// that must be in the mix (charcoal for smelting); the rule still matches
// without them, so the attempt fails with a reason instead of doing nothing.
// A more specific rule (exact ids) wins over a general one.

import type { KnowledgeId, Skill, Stack } from '../types';
import type { ActionId } from './actions';

export type Rule = {
	id: string;
	action: ActionId;
	inputs: string[];
	needs: string[];
	// least heat in °C; 0 when no fire is involved
	minHeat: number;
	// take the heat needed and the result from the material itself
	// (`smeltsAt` for ores, `firesAt` for shaped clay)
	byProperty?: 'smeltsAt' | 'firesAt';
	outputs: Stack[];
	// the know-how a success teaches (may come from the material instead)
	knowledge?: KnowledgeId;
	// a new heat source learned by this success, °C
	heat?: number;
	skill: Skill;
	// 0 trivial .. 1 nearly hopeless without practice
	difficulty: number;
	// a failed roll wastes the materials (pots crack, ore is lost)
	ruins?: boolean;
	text: string;
	failText?: string;
};

type Raw = {
	id: string;
	action: ActionId;
	in: string[];
	needs?: string[];
	heat?: number; // min heat
	by?: 'smeltsAt' | 'firesAt';
	out?: string[]; // 'flake*2'
	learns?: KnowledgeId;
	gives?: number; // new heat source
	skill: Skill;
	hard: number;
	ruins?: boolean;
	text: string;
	fail?: string;
};

function stacks(list: string[] = []): Stack[] {
	return list.map((entry) => {
		const [material, n] = entry.split('*');
		return { material, count: n ? Number(n) : 1 };
	});
}

const RAW: Raw[] = [
	// ---------------------------------------------------------- strike
	{
		id: 'knap-flake',
		action: 'strike',
		in: ['#sharpbreak', '~#hard'],
		out: ['flake*2'],
		learns: 'knapping',
		skill: 'crafting',
		hard: 0.3,
		text: 'struck sharp flakes off the stone',
		fail: 'the stone shattered without a good edge'
	},
	{
		id: 'hand-axe',
		action: 'strike',
		in: ['#sharpbreak', '#sharpbreak', '~#hard'],
		out: ['hand-axe'],
		learns: 'hand-axe',
		skill: 'crafting',
		hard: 0.5,
		ruins: true,
		text: 'worked a heavy stone into a hand axe',
		fail: 'the stone split the wrong way'
	},
	{
		id: 'retouch-scraper',
		action: 'strike',
		in: ['flake', '~#hard'],
		out: ['scraper'],
		learns: 'retouching',
		skill: 'crafting',
		hard: 0.4,
		text: 'chipped a flake into a scraper',
		fail: 'the flake snapped'
	},
	{
		id: 'flint-sparks',
		action: 'strike',
		in: ['flint', '~#hard', 'dry-grass'],
		learns: 'fire-making',
		gives: 600,
		skill: 'crafting',
		hard: 0.8,
		text: 'sparks caught the dry grass and a fire took',
		fail: 'the sparks died in the grass'
	},
	{
		id: 'hammer-sky-iron',
		action: 'strike',
		in: ['meteorite-iron', '~#hard'],
		out: ['iron-blade'],
		learns: 'cold-hammering',
		skill: 'crafting',
		hard: 0.5,
		text: 'beat the sky iron cold into a blade',
		fail: 'the iron would not take an edge yet'
	},
	{
		id: 'hammer-copper',
		action: 'strike',
		in: ['native-copper', '~#hard'],
		out: ['copper-blade'],
		learns: 'cold-hammering',
		skill: 'crafting',
		hard: 0.35,
		text: 'beat the copper cold into a blade',
		fail: 'the copper cracked'
	},
	{
		id: 'hammer-bloom',
		action: 'strike',
		in: ['iron-bloom', '~#hard'],
		heat: 800,
		out: ['wrought-iron'],
		learns: 'ironworking',
		skill: 'crafting',
		hard: 0.6,
		text: 'hammered the hot bloom until the slag flew out and iron was left',
		fail: 'the bloom crumbled under the hammer'
	},
	{
		id: 'hammer-wrought-iron',
		action: 'strike',
		in: ['wrought-iron', '~#hard'],
		heat: 800,
		out: ['iron-blade'],
		learns: 'smithing',
		skill: 'crafting',
		hard: 0.6,
		text: 'drew the hot iron out into a blade',
		fail: 'the iron cooled before it took shape'
	},

	// ----------------------------------------------------------- grind
	{
		id: 'friction-fire',
		action: 'grind',
		in: ['~wood', 'branch', 'dry-grass'],
		learns: 'fire-making',
		gives: 600,
		skill: 'crafting',
		hard: 0.75,
		text: 'spun the stick in the log until the dry grass smoked and caught',
		fail: 'it smoked but never caught'
	},
	{
		id: 'grind-flour',
		action: 'grind',
		in: ['wild-grain', '~river-stone|granite'],
		out: ['flour'],
		learns: 'milling',
		skill: 'foraging',
		hard: 0.3,
		text: 'ground the grain to flour between stones'
	},
	{
		id: 'grind-ochre',
		action: 'grind',
		in: ['ochre', '~river-stone|granite'],
		out: ['ochre-powder'],
		learns: 'pigment',
		skill: 'crafting',
		hard: 0.2,
		text: 'ground the ochre to a red powder'
	},
	{
		id: 'grind-awl',
		action: 'grind',
		in: ['bone', '~river-stone|granite'],
		out: ['awl'],
		learns: 'bone-working',
		skill: 'crafting',
		hard: 0.35,
		text: 'ground a bone to a sharp point',
		fail: 'the bone split'
	},

	// ------------------------------------------------------------ soak
	{
		id: 'wet-clay',
		action: 'soak',
		in: ['clay', 'water'],
		out: ['wet-clay'],
		learns: 'clay-working',
		skill: 'crafting',
		hard: 0.15,
		text: 'soaked the clay until it was soft and sticky'
	},
	{
		id: 'ret-flax',
		action: 'soak',
		in: ['flax', 'water'],
		out: ['retted-flax'],
		learns: 'retting',
		skill: 'crafting',
		hard: 0.3,
		text: 'soaked the flax until the fibres came loose'
	},
	{
		id: 'soak-grain',
		action: 'soak',
		in: ['wild-grain', 'water'],
		out: ['soaked-grain'],
		learns: 'soaking',
		skill: 'foraging',
		hard: 0.15,
		text: 'soaked the grain soft'
	},

	// ------------------------------------------------------------- dry
	{
		id: 'dry-meat',
		action: 'dry',
		in: ['raw-meat'],
		out: ['dried-meat'],
		learns: 'drying',
		skill: 'hunting',
		hard: 0.25,
		text: 'dried the meat in sun and wind so it keeps',
		fail: 'the meat went bad before it dried'
	},
	{
		id: 'dry-fish',
		action: 'dry',
		in: ['fish'],
		out: ['dried-fish'],
		learns: 'drying',
		skill: 'foraging',
		hard: 0.2,
		text: 'dried the fish so it keeps'
	},
	{
		id: 'dry-berries',
		action: 'dry',
		in: ['berries'],
		out: ['dried-berries'],
		learns: 'drying',
		skill: 'foraging',
		hard: 0.15,
		text: 'dried the berries so they keep'
	},
	{
		id: 'dry-hide',
		action: 'dry',
		in: ['hide'],
		out: ['dried-hide'],
		learns: 'hide-drying',
		skill: 'crafting',
		hard: 0.2,
		text: 'stretched and dried the hide until it was stiff'
	},
	{
		id: 'dry-grass',
		action: 'dry',
		in: ['grass'],
		out: ['dry-grass'],
		learns: 'tinder',
		skill: 'crafting',
		hard: 0.1,
		text: 'dried the grass until it was good tinder'
	},
	{
		id: 'dry-pot',
		action: 'dry',
		in: ['wet-pot'],
		out: ['dried-pot'],
		learns: 'drying',
		skill: 'crafting',
		hard: 0.2,
		text: 'left the pot to dry slowly in the shade',
		fail: 'the pot cracked as it dried'
	},

	// ------------------------------------------------------------ heat
	{
		id: 'smelt-ore',
		action: 'heat',
		in: ['#ore'],
		// ore is smelted in a kiln, on charcoal: metal comes after the kiln, not before it
		needs: ['charcoal', '~kiln'],
		by: 'smeltsAt',
		skill: 'crafting',
		hard: 0.5,
		ruins: true,
		text: 'the ore sweated out metal in the charcoal fire',
		fail: 'the ore only crumbled into slag'
	},
	{
		id: 'fire-clay',
		action: 'heat',
		in: ['#unfired'],
		by: 'firesAt',
		skill: 'crafting',
		hard: 0.33,
		ruins: true,
		text: 'the fire hardened the clay',
		fail: 'the clay cracked in the fire'
	},
	{
		id: 'cook-meat',
		action: 'heat',
		in: ['raw-meat'],
		// cooking is worked out at a kept fire, so it comes after the hearth
		needs: ['~hearth'],
		heat: 300,
		out: ['cooked-meat', 'fat'],
		learns: 'cooking',
		skill: 'foraging',
		hard: 0.1,
		text: 'roasted the meat over the fire',
		fail: 'the meat burned black'
	},
	{
		id: 'cook-fish',
		action: 'heat',
		in: ['fish'],
		needs: ['~hearth'],
		heat: 300,
		out: ['cooked-fish'],
		learns: 'cooking',
		skill: 'foraging',
		hard: 0.1,
		text: 'cooked the fish on hot stones'
	},
	{
		id: 'bake-roots',
		action: 'heat',
		in: ['roots'],
		needs: ['~hearth'],
		heat: 300,
		out: ['baked-roots'],
		learns: 'cooking',
		skill: 'foraging',
		hard: 0.1,
		text: 'baked the roots in the embers'
	},
	{
		id: 'cook-porridge',
		action: 'heat',
		in: ['wild-grain|flour', 'water', '~#holdswater'],
		heat: 300,
		out: ['porridge'],
		learns: 'porridge',
		skill: 'foraging',
		hard: 0.3,
		text: 'boiled grain in the pot until it was thick porridge',
		fail: 'the porridge scorched'
	},
	{
		id: 'bake-bread',
		action: 'heat',
		in: ['dough'],
		heat: 300,
		out: ['bread'],
		learns: 'baking',
		skill: 'farming',
		hard: 0.4,
		text: 'baked the dough into bread',
		fail: 'the dough burned outside and stayed raw within'
	},
	{
		id: 'make-charcoal',
		action: 'heat',
		in: ['wood', 'earth', '~pit'],
		heat: 800,
		out: ['charcoal*2'],
		learns: 'charcoal',
		gives: 900,
		skill: 'crafting',
		hard: 0.5,
		ruins: true,
		text: 'buried burning wood under earth and it turned to charcoal',
		fail: 'the wood burned to ash for want of cover'
	},
	{
		id: 'cast-bronze',
		action: 'heat',
		in: ['bronze', '~mould'],
		heat: 1100,
		out: ['bronze-axe'],
		learns: 'casting',
		skill: 'crafting',
		hard: 0.6,
		ruins: true,
		text: 'poured melted bronze into the mould',
		fail: 'the metal ran cold before it filled the mould'
	},
	{
		id: 'cast-copper',
		action: 'heat',
		in: ['copper', '~mould'],
		heat: 1100,
		out: ['copper-axe'],
		learns: 'casting',
		skill: 'crafting',
		hard: 0.55,
		ruins: true,
		text: 'poured melted copper into the mould',
		fail: 'the metal ran cold before it filled the mould'
	},

	// ------------------------------------------------------------- mix
	{
		id: 'knead-dough',
		action: 'mix',
		in: ['flour', 'water'],
		out: ['dough'],
		learns: 'dough',
		skill: 'foraging',
		hard: 0.2,
		text: 'worked flour and water into dough'
	},
	{
		id: 'make-paint',
		action: 'mix',
		in: ['ochre-powder', 'fat'],
		out: ['paint'],
		learns: 'painting',
		skill: 'crafting',
		hard: 0.25,
		text: 'worked ochre into fat to make red paint'
	},
	{
		id: 'tan-leather',
		action: 'mix',
		in: ['hide|dried-hide', 'fat'],
		out: ['leather'],
		learns: 'tanning',
		skill: 'crafting',
		hard: 0.4,
		text: 'worked fat into the hide until it was soft leather',
		fail: 'the hide stayed stiff'
	},
	{
		id: 'alloy-bronze',
		action: 'mix',
		in: ['copper', 'tin'],
		heat: 1100,
		out: ['bronze*2'],
		learns: 'bronze',
		skill: 'crafting',
		hard: 0.6,
		ruins: true,
		text: 'melted tin into the copper and it ran together as bronze',
		fail: 'the metals would not run together'
	},
	{
		id: 'salt-meat',
		action: 'mix',
		in: ['raw-meat', 'salt'],
		out: ['salted-meat'],
		learns: 'salting',
		skill: 'hunting',
		hard: 0.25,
		text: 'rubbed salt into the meat so it keeps'
	},
	{
		id: 'salt-fish',
		action: 'mix',
		in: ['fish', 'salt'],
		out: ['salted-fish'],
		learns: 'salting',
		skill: 'foraging',
		hard: 0.25,
		text: 'rubbed salt into the fish so it keeps'
	},

	// ----------------------------------------------------------- build
	{
		id: 'build-hearth',
		action: 'build',
		in: ['river-stone|granite', 'river-stone|granite', 'wood|charcoal'],
		heat: 600,
		out: ['hearth'],
		learns: 'fire-keeping',
		skill: 'building',
		hard: 0.3,
		text: 'ringed the fire with stones so it can be kept alight'
	},
	{
		id: 'build-lean-to',
		action: 'build',
		in: ['~#sharp', 'branch', 'branch', 'grass|reed|bark|hide'],
		out: ['lean-to'],
		learns: 'shelter',
		skill: 'building',
		hard: 0.2,
		text: 'leaned branches together and covered them for shelter'
	},
	{
		id: 'pit-fire',
		action: 'build',
		in: ['~pit', 'wood', 'earth'],
		heat: 600,
		learns: 'pit-fire',
		gives: 800,
		skill: 'building',
		hard: 0.45,
		text: 'burned wood in a covered pit and the heat held in',
		fail: 'the pit smothered the fire'
	},
	{
		id: 'build-kiln',
		action: 'build',
		in: ['wet-clay|brick', 'wet-clay|brick', 'wood|charcoal'],
		heat: 800,
		out: ['kiln'],
		learns: 'kiln',
		gives: 1100,
		skill: 'building',
		hard: 0.5,
		ruins: true,
		text: 'built clay walls around the fire and it burned far hotter',
		fail: 'the clay walls cracked and fell in'
	},
	{
		id: 'build-furnace',
		action: 'build',
		in: ['kiln', 'brick', 'brick', 'bellows'],
		heat: 1300,
		out: ['furnace'],
		learns: 'furnace',
		gives: 1500,
		skill: 'building',
		hard: 0.7,
		ruins: true,
		text: 'stacked the kiln higher and drove air in from below',
		fail: 'the stack slumped'
	},
	{
		id: 'store-seed',
		action: 'build',
		in: ['pot', 'wild-grain'],
		out: ['seed-store'],
		learns: 'seed-saving',
		skill: 'farming',
		hard: 0.3,
		text: 'sealed seed grain in a pot to keep for sowing'
	},
	{
		id: 'build-fence',
		action: 'build',
		in: ['~#sharp', 'branch', 'branch', 'branch', '#strongfiber'],
		out: ['fence'],
		learns: 'fencing',
		skill: 'building',
		hard: 0.25,
		text: 'lashed branches into a fence'
	},

	// ----------------------------------------------------- plant, tame
	{
		id: 'sow-field',
		action: 'plant',
		in: ['wild-grain|roots', 'earth', '~digging-stick'],
		// seed goes into a dug hole, so planting comes after digging
		needs: ['~pit'],
		out: ['field'],
		learns: 'planting',
		skill: 'farming',
		hard: 0.45,
		text: 'pressed seed into bare earth to grow',
		fail: 'the seed rotted in the ground'
	},
	{
		id: 'tame-goat',
		action: 'tame',
		in: ['kid', 'grass|roots'],
		out: ['tame-goat'],
		learns: 'herding',
		skill: 'herding',
		hard: 0.4,
		text: 'fed the kid until it followed along',
		fail: 'the kid bolted'
	},
	{
		id: 'tame-dog',
		action: 'tame',
		in: ['pup', 'raw-meat|cooked-meat|fish'],
		out: ['dog'],
		learns: 'dog-taming',
		skill: 'herding',
		hard: 0.35,
		text: 'fed the pup scraps until it stayed by the camp',
		fail: 'the pup snapped and ran'
	},
	{
		id: 'tame-aurochs',
		action: 'tame',
		in: ['calf', 'grass|wild-grain'],
		out: ['tame-aurochs'],
		learns: 'cattle-keeping',
		skill: 'herding',
		hard: 0.55,
		text: 'raised the calf by hand until it was gentle',
		fail: 'the calf would not be led'
	},

	// ---------------------------------------------------------- dig, cut
	{
		id: 'dig-pit',
		action: 'dig',
		in: ['~digging-stick', 'earth'],
		out: ['pit'],
		learns: 'digging',
		skill: 'building',
		hard: 0.15,
		text: 'dug a pit in the ground'
	},
	{
		id: 'dig-roots',
		action: 'dig',
		in: ['~digging-stick', 'grass'],
		out: ['roots*2'],
		learns: 'digging-roots',
		skill: 'foraging',
		hard: 0.2,
		text: 'dug roots out from under the grass'
	},
	{
		id: 'cut-digging-stick',
		action: 'cut',
		in: ['~#sharp', 'branch'],
		out: ['digging-stick'],
		learns: 'woodworking',
		skill: 'crafting',
		hard: 0.15,
		text: 'trimmed a branch into a digging stick'
	},
	{
		id: 'cut-thong',
		action: 'cut',
		in: ['~#sharp', 'dried-hide'],
		out: ['thong*3'],
		learns: 'thongs',
		skill: 'crafting',
		hard: 0.25,
		text: 'cut the dry hide into strips'
	},
	{
		id: 'tally-bone',
		action: 'cut',
		in: ['~#sharp', 'bone'],
		out: ['tally-bone'],
		learns: 'tally',
		skill: 'crafting',
		hard: 0.3,
		text: 'cut notches in a bone to keep count'
	},

	// ------------------------------------------------------------ bind
	{
		id: 'bind-spear',
		action: 'bind',
		in: ['branch', 'flake', '#strongfiber'],
		out: ['spear'],
		learns: 'hafting',
		skill: 'crafting',
		hard: 0.4,
		text: 'lashed a sharp flake to a branch as a spear',
		fail: 'the lashing came loose'
	},
	{
		id: 'bind-axe',
		action: 'bind',
		in: ['branch', 'hand-axe', '#strongfiber'],
		out: ['stone-axe'],
		learns: 'hafted-axe',
		skill: 'crafting',
		hard: 0.5,
		text: 'lashed the hand axe to a handle',
		fail: 'the head slipped out of the lashing'
	},
	{
		id: 'bind-knife',
		action: 'bind',
		in: ['bone', 'flake', '#strongfiber'],
		out: ['knife'],
		learns: 'hafting',
		skill: 'crafting',
		hard: 0.35,
		text: 'bound a flake into a bone handle'
	},
	{
		id: 'sew-clothing',
		action: 'bind',
		in: ['leather|dried-hide', '~awl', 'sinew|thong'],
		out: ['clothing'],
		learns: 'sewing',
		skill: 'crafting',
		hard: 0.45,
		text: 'stitched hide into clothing'
	},
	{
		id: 'make-bellows',
		action: 'bind',
		in: ['dried-hide|leather', 'reed', 'cord'],
		out: ['bellows'],
		learns: 'bellows-making',
		skill: 'crafting',
		hard: 0.5,
		text: 'tied a hide bag to a reed pipe'
	},

	// ----------------------------------------------------------- shape
	{
		id: 'twist-cord',
		action: 'shape',
		in: ['#strongfiber', '#strongfiber'],
		out: ['cord'],
		learns: 'cordage',
		skill: 'crafting',
		hard: 0.25,
		text: 'twisted strong fibres into cord'
	},
	{
		id: 'make-rope',
		action: 'shape',
		in: ['cord', 'cord'],
		out: ['rope'],
		learns: 'ropemaking',
		skill: 'crafting',
		hard: 0.35,
		text: 'twisted two cords into rope'
	},
	{
		id: 'knot-net',
		action: 'shape',
		in: ['cord', 'cord', 'cord'],
		out: ['net'],
		learns: 'netting',
		skill: 'crafting',
		hard: 0.4,
		text: 'knotted cord into a net'
	},
	{
		id: 'weave-basket',
		action: 'shape',
		in: ['reed', 'reed', 'reed'],
		out: ['basket'],
		learns: 'weaving',
		skill: 'crafting',
		hard: 0.3,
		text: 'wove reeds into a basket'
	},
	{
		id: 'weave-mat',
		action: 'shape',
		in: ['grass', 'grass', 'grass'],
		out: ['mat'],
		learns: 'weaving',
		skill: 'crafting',
		hard: 0.2,
		text: 'wove grass into a mat'
	},
	{
		id: 'shape-pot',
		action: 'shape',
		in: ['wet-clay'],
		out: ['wet-pot'],
		learns: 'clay-shaping',
		skill: 'crafting',
		hard: 0.25,
		text: 'pressed wet clay into a pot',
		fail: 'the clay slumped'
	},
	{
		id: 'shape-bricks',
		action: 'shape',
		in: ['wet-clay', 'wet-clay'],
		out: ['wet-brick*2'],
		learns: 'brick-making',
		skill: 'building',
		hard: 0.25,
		text: 'pressed wet clay into bricks'
	},
	{
		id: 'shape-mould',
		action: 'shape',
		in: ['wet-clay', '~stone-axe|hand-axe|copper-axe|bronze-axe'],
		out: ['wet-mould'],
		learns: 'moulds',
		skill: 'crafting',
		hard: 0.4,
		text: 'pressed the axe into wet clay to leave its shape',
		fail: 'the clay stuck to the axe'
	},
	{
		id: 'mark-clay',
		action: 'shape',
		in: ['wet-clay', '~#sharp', '~tally-bone'],
		// Marks are worth the clay only in a settled village: a seed store to count,
		// and a kiln to fire the record hard. That puts writing behind farming and pottery.
		needs: ['~seed-store', '~kiln'],
		out: ['wet-tablet'],
		learns: 'marks',
		skill: 'crafting',
		hard: 0.3,
		text: 'copied the notches of a tally bone as marks in a flat of wet clay'
	},

	// ------------------------------------------------------------ blow
	{
		id: 'blow-pipe',
		action: 'blow',
		in: ['~reed', 'charcoal'],
		heat: 900,
		learns: 'blowpipe',
		gives: 1300,
		skill: 'crafting',
		hard: 0.5,
		text: 'blew through a reed onto the charcoal and it glowed white',
		fail: 'the reed charred through'
	},
	{
		id: 'blow-bellows',
		action: 'blow',
		in: ['~bellows', 'charcoal'],
		heat: 900,
		learns: 'bellows',
		gives: 1300,
		skill: 'crafting',
		hard: 0.4,
		text: 'worked the bellows and the charcoal roared white'
	}
];

export const RULES: Rule[] = RAW.map((r) => ({
	id: r.id,
	action: r.action,
	inputs: r.in,
	needs: r.needs ?? [],
	minHeat: r.heat ?? 0,
	byProperty: r.by,
	outputs: stacks(r.out),
	knowledge: r.learns,
	heat: r.gives,
	skill: r.skill,
	difficulty: r.hard,
	ruins: r.ruins,
	text: r.text,
	failText: r.fail
}));
