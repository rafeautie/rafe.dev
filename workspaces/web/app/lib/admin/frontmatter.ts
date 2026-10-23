import { Document, parseDocument } from 'yaml';

// A post's index.md, split into its frontmatter and body. Editing goes through
// the parsed YAML document so keys the admin does not know about survive a save.
export type PostFields = {
	title: string;
	description: string;
	date: string;
	updated: string;
	draft: boolean;
};

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function splitPost(source: string) {
	const match = FRONTMATTER.exec(source);
	const yaml = match ? match[1] : '';
	const body = match ? source.slice(match[0].length) : source;
	return { yaml, body: body.replace(/^\n+/, '') };
}

export function readFields(yaml: string): PostFields {
	const data = (parseDocument(yaml).toJS() ?? {}) as Record<string, unknown>;
	const text = (value: unknown) => (value === undefined || value === null ? '' : String(value));
	return {
		title: text(data.title),
		description: text(data.description),
		date: text(data.date),
		updated: text(data.updated),
		draft: data.draft === true
	};
}

export function joinPost(yaml: string, fields: PostFields, body: string) {
	// a new Document rather than parsing '{}', which would stay a flow map
	const doc = yaml.trim() ? parseDocument(yaml) : new Document({});
	const set = (key: string, value: string | boolean) => {
		if (value === '' || value === false) doc.delete(key);
		else doc.set(key, value);
	};
	set('title', fields.title);
	set('description', fields.description);
	set('date', fields.date);
	set('updated', fields.updated);
	set('draft', fields.draft);
	const header = doc.toString({ lineWidth: 0 }).trimEnd();
	return `---\n${header}\n---\n\n${body.trim()}\n`;
}
