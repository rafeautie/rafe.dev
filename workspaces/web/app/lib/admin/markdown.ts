// A fenced code block: closed by the same fence it opened with, which may be
// indented (inside a list item). Kept apart from frontmatter.ts, which brings
// the YAML parser, so the writing list can count a post's words without it.
export const FENCED_CODE = /^[ \t]*(`{3,}|~{3,})[\s\S]*?^[ \t]*\1/gm;
