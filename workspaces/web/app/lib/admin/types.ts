// Shapes shared by the server functions and the admin pages.
export type Commit = { sha: string; message: string; date: string; author: string };

export type BuildState = 'pending' | 'building' | 'live' | 'failed' | 'unknown';
export type Build = { state: BuildState; url: string };
