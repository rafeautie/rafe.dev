import type { Ask, Field, MindResult } from './reply';

// The speed check at /civ/bench: a fixed set of requests like the ones the
// simulation's people will make, all sharing one opening, each prompt about
// 250 tokens. How long they take says how many the simulation can afford.

// What every request starts with: the world, and how to reply
export const BENCH_SYSTEM = `This is the world of the Reed People, a band of about thirty who live where a slow river leaves the hills, long before writing, metal or the wheel. They know fire, flint and bone tools, baskets, hides, rope, a little planting and a herd of goats. The river floods in spring and runs low at the end of summer. Winters are short and wet. Wolves live in the hills, fish and reeds in the river, berries and deer at the forest edge.

What they have: clay, reeds, flint, stone, bone, antler, hides, wood, bark, ash, fat, river water, grass seed, berries, fish and goats. What they do not know: metal, kilns, writing, wheels, boats with sails, money or horses. They name things by what they look like or what they do.

The people are ordinary. They notice small things, remember what happened to them, worry about food, children and the weather, and argue and make up. They believe the river and the sky listen to them.

How to reply: you speak as the person you are told about, as they would, in plain short words. Never mention anything outside their world, and never explain the rules. When a line of your own is asked for, write it first: one short sentence in the person's voice. Then write each labelled line asked for on its own line, as LABEL: value, choosing the value only from the choices given.`;

// The fields, and how they're asked for at the end of a prompt
const fieldsAsk = (fields: Field[]) =>
	fields.map((field) => `${field.label} is one of: ${field.options.join(', ')}.`).join('\n');

export type BenchCase = {
	name: string;
	kind: 'Idea' | 'Prayer' | 'Council' | 'Talk';
	ask: Omit<Ask, 'id' | 'reuse'>;
};

const IDEA_FIELDS: Field[] = [
	{
		label: 'ACTION',
		options: ['heat', 'strike', 'soak', 'mix', 'grind', 'tie', 'dry', 'bury', 'carve']
	},
	{
		label: 'ITEM',
		options: ['clay', 'stone', 'reed', 'bone', 'hide', 'wood', 'ash', 'fat', 'seed', 'bark']
	},
	{ label: 'WITH', options: ['fire', 'water', 'sun', 'sand', 'stone', 'rope', 'nothing'] }
];

const NEED_FIELD: Field[] = [
	{
		label: 'NEED',
		options: ['rain', 'food', 'health', 'safety', 'children', 'guidance', 'forgiveness']
	}
];

function idea(name: string, person: string): BenchCase {
	return {
		name,
		kind: 'Idea',
		ask: {
			system: BENCH_SYSTEM,
			prompt: `${person}\n\nSomething has been turning over in your mind. Say the idea that comes to you, in one sentence. Then say what you would try first.\n${fieldsAsk(IDEA_FIELDS)}`,
			free: { maxTokens: 40 },
			fields: IDEA_FIELDS
		}
	};
}

function prayer(name: string, person: string): BenchCase {
	return {
		name,
		kind: 'Prayer',
		ask: {
			system: BENCH_SYSTEM,
			prompt: `${person}\n\nYou go down to the river alone at dusk and speak to it. Say your prayer in one sentence. Then say what you are asking for.\n${fieldsAsk(NEED_FIELD)}`,
			free: { maxTokens: 40 },
			fields: NEED_FIELD
		}
	};
}

function council(name: string, situation: string, options: string[]): BenchCase {
	const fields = [{ label: 'CHOICE', options }];
	return {
		name,
		kind: 'Council',
		ask: {
			system: BENCH_SYSTEM,
			prompt: `${situation}\n\nWhat do you say the band should do?\n${fieldsAsk(fields)}`,
			fields
		}
	};
}

function talk(name: string, person: string, to: string): BenchCase {
	return {
		name,
		kind: 'Talk',
		ask: {
			system: BENCH_SYSTEM,
			prompt: `${person}\n\n${to} Say one thing to them, in one sentence.`,
			free: { maxTokens: 30 }
		}
	};
}

const ASHA = `You are Asha, 19, curious and patient, a little stubborn. You make bowls and cups from wet clay dug at the bend of the river, and dry them in the sun, but they soften and crack when they hold water for long. Your mother taught you, and her mother taught her. Last night a bowl left by the fire came out hard and rang like stone when you tapped it, and this morning it held water from dawn until midday without softening. Toma laughed and said the fire spirit drank it. You are not so sure. You remember that the clay around the old hearth is hard too, and that the hearth never washes away in the spring rain. You have six good bowls drying now, and plenty of clay.`;

const TOMA = `You are Toma, 34, cheerful and quick to boast, the best fisher in the band. You catch fish with your hands in the shallows and with a sharpened stick, and on a good day you bring home four or five. Your wife Ren is tired of hearing about the big one that got away. Last week you left a bundle of reeds in the river overnight, and in the morning they were swollen, heavy and so tight that water could not pass between them. Two small fish were trapped inside the bundle where the reeds had folded over. You have been thinking about it since. The river is high and full of fish this month, and the children are always hungry. You are good with your hands but you get bored quickly, and you have never made anything that took longer than a day.`;

const KESI = `You are Kesi, 52, careful and kind, the one people come to when they are sick or hurt. You know which leaves calm a cough and which roots ease a belly. You keep your remedies in small hide bags hanging from the roof of your shelter. Yesterday, while cleaning a pot where goat fat had cooked over the fire, you scrubbed it with wet ash, and the fat and ash turned slippery and frothed in your hands. Afterwards your hands were cleaner than they had been in a long time, and a cut on your thumb did not swell. Many in the band have sores that will not heal this season. Your own mother died of a wound that went bad, and since then you have watched every cut and burn closely. You are slow to try new things, but when something works you remember it for the rest of your life.`;

const REN = `You are Ren, 27, warm and anxious, married to Toma, mother of two. Your youngest, Pim, has had a fever for three days. He will not eat, he sleeps too much, and his skin is hot and dry. Kesi has given him bitter leaves and told you to keep him cool with river water, and you have done everything she said. Last spring a child of the hill people died of a fever like this one, and you cannot stop thinking about it. Your mother used to say that the river takes sickness away if you ask it properly and give it something you love. You have a necklace of shells that Toma made you before you were married. Tonight the sky is clear and the river is quiet.`;

const OKU = `You are Oku, 61, the oldest of the band, slow to speak and listened to when you do. You have seen forty summers by this river. This year the rain has not come for a full moon. The river is lower than you have ever seen it, the grass is brown, the goats give little milk, and the seed the young ones planted in the spring has dried in the ground. Some of the young people say the band should leave. You remember a summer like this when you were a boy, and how your father gathered everyone at the water to sing for rain, and how the rain came two days later. You are not sure anymore if the singing did it. Your knees hurt when you walk down to the water now, and you wonder how many more summers you will see.`;

const LIA = `You are Lia, 15, brave and restless, the one who watches the goats. You like the hills more than the camp, and you know every path the goats take. Three nights ago you heard wolves howling close to the high pasture, closer than ever before, and yesterday one of the young goats was missing. You found tufts of its hair caught on a thornbush and nothing else. You have not told anyone that you fell asleep while watching them. Your father says wolves only come close when they are hungry, and that a hungry wolf does not stop at one goat. You still have to take the herd up the hill tomorrow. You are frightened, and you do not want anyone to know it, least of all your father.`;

const FLOOD = `The whole band sits around the fire after the evening meal, and Oku asks everyone to speak in turn. The spring flood is coming, and the elders say it will be high this year, because the snow in the hills was deep. Last year the water reached the edge of the camp and spoiled the stored seed, and two shelters were washed away. The high ground behind the camp is dry and safe, but far from the fishing places and exposed to the wind. Some want to pile stones along the bank. Some want to send young people upriver to see how high the water is already. Some say the hill people will trade a place on their slope for hides and dried fish. Everyone is tired and a little afraid, and the children have been sent to sleep. It is your turn to speak. You are Toma, 34, the best fisher in the band, and you care most about staying close to the fish.`;

const STRANGER = `A stranger walked into the camp at midday: a tall man with a bone knife and a bag of strange red stones, who speaks only a few words the band understands. He points at the river, then at the hills, and makes the sign for sleeping. The children are curious and keep following him. Some of the men say he could be a scout for the hill people, who took two goats last autumn. Kesi says he looks hungry and has a wound on his leg. He has sat down by the edge of the camp and is waiting, his hands open on his knees. The band gathers to decide what to do with him before night falls. Oku says that strangers have brought both good and bad to the band before. You are Lia, 15, the goat girl. You watched him come down the goat path, and he was alone, and he stopped to let the goats pass.`;

const WINTER = `It is the middle of the short winter, and the stores are lower than they should be. The dried fish will last perhaps half a moon, the berries are gone, and the goats are thin. The seed grain kept for planting would feed everyone for a few days, but then there would be nothing to plant in spring. Deer have been seen in the hills, but the paths are slippery and Toma's brother broke his leg there last winter. The hill people have grain to spare, and they have always wanted good hides. The band has twelve good hides, and it will need some of them for the spring. Nobody has eaten well for days, and the young ones are short with each other. You are Oku, 61, and you have seen hungry winters before. The band waits to hear what the oldest of them thinks.`;

export const BENCH_CASES: BenchCase[] = [
	idea('Asha: the hard bowl', ASHA),
	prayer('Ren: the fever', REN),
	council('Flood', FLOOD, [
		'move to the high ground',
		'pile stones along the bank',
		'send scouts upriver',
		'trade with the hill people'
	]),
	talk(
		'Asha to Toma',
		ASHA,
		'Toma walks past you on his way to the river, laughing at your hard bowl again and calling it a stone that thinks it is a bowl. Some of the children laugh with him.'
	),
	idea('Toma: the swollen reeds', TOMA),
	prayer('Oku: no rain', OKU),
	council('Stranger', STRANGER, [
		'welcome the stranger',
		'send the stranger away',
		'watch the stranger for a moon',
		'take his red stones'
	]),
	talk(
		'Kesi to Ren',
		KESI,
		'Ren comes to your shelter crying, holding her youngest, Pim, who has been hot with fever for three days and will not eat. She asks if he is going to die.'
	),
	idea('Kesi: slippery ash', KESI),
	prayer('Lia: wolves', LIA),
	council('Winter stores', WINTER, [
		'hunt deer in the hills',
		'eat the seed grain',
		'trade hides for grain',
		'eat less and wait'
	]),
	talk(
		'Oku to Lia',
		OKU,
		'Lia, the goat girl, sits down next to you at the fire, quiet and pale. A young goat went missing from the high pasture, and wolves have been heard close by.'
	)
];

// One request of the bench as it went
export type BenchRow = {
	case: BenchCase;
	// whether it could start from the kept reading of the opening
	reuse: boolean;
	result?: MindResult;
	error?: string;
	// as the page saw it: from asking to the answer
	totalMs: number;
};

export function median(values: number[]): number {
	if (!values.length) return NaN;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = sorted.length >> 1;
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export type BenchSummary = { calls: number; medianMs: number; perMinute: number };

// The typical call, by its median time, and how many such calls fit in a
// minute one after another
export function summarize(rows: BenchRow[], reuse: boolean): BenchSummary | undefined {
	const times = rows.filter((row) => row.reuse === reuse && row.result).map((row) => row.totalMs);
	if (!times.length) return undefined;
	const medianMs = median(times);
	return { calls: times.length, medianMs, perMinute: 60_000 / medianMs };
}

const ms = (value: number) => `${Math.round(value)} ms`;

// What the "Copy results" button copies: plain text, to paste anywhere
export function benchText(about: string[], rows: BenchRow[]): string {
	const lines = [...about, ''];
	for (const reuse of [true, false]) {
		const summary = summarize(rows, reuse);
		if (!summary) continue;
		lines.push(
			`${reuse ? 'With' : 'Without'} prompt-start reuse: median ${ms(summary.medianMs)} per call, about ${Math.floor(summary.perMinute)} calls a minute (${summary.calls} calls)`
		);
	}
	lines.push('', 'reuse | case | prompt | reused | read | written | write | total | reply');
	for (const row of rows) {
		const speed = row.result?.speed;
		const reply = row.result ? replyText(row.result) : `error: ${row.error}`;
		lines.push(
			[
				row.reuse ? 'yes' : 'no',
				`${row.case.kind}: ${row.case.name}`,
				speed?.promptTokens ?? '-',
				speed?.reusedTokens ?? '-',
				speed ? ms(speed.readMs) : '-',
				speed?.writtenTokens ?? '-',
				speed ? ms(speed.writeMs) : '-',
				ms(row.totalMs),
				reply
			].join(' | ')
		);
	}
	return lines.join('\n');
}

// A reply as one line: the free text, then each field
export const replyText = (result: MindResult) =>
	[result.text, ...Object.entries(result.fields).map(([label, value]) => `${label}: ${value}`)]
		.filter(Boolean)
		.join(' / ');
