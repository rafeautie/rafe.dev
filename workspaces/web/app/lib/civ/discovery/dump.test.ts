import { it } from 'vitest';
import { ruleDepths } from './depth';
it('dump', () => {
	const e = [...ruleDepths().entries()].sort((a, b) => a[1] - b[1]);
	console.log(e.filter(x=>x[1]>=3).map(([k, v]) => `${v} ${k}`).join(', '));
});
