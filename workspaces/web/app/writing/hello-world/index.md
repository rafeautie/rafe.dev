---
title: Hello, world
description: rafe.dev has room for longer writing now. What it's for, and what's coming first.
date: 2026-09-27
---

Until now, this site has been a business card and a photo gallery. It has room for longer writing now, and this is the first post.

## What goes here

Mostly the things I build, and how they work underneath: the decisions that don't fit in a commit message, and the details that turned out more interesting than the feature they were for.

## Coming first

The first two posts are about [shmoney](/shmoney), a personal finance app that runs entirely on your computer. Everything lives in one SQLite file, with no account and no cloud.

1. **Exact answers from a small model.** shmoney's chat runs a small model on your own machine, and small models can't be trusted with arithmetic. So instead of doing the math, it calls tools that do it in code, and answers with the exact numbers they return.
2. **The real app in a browser tab.** The live demo on the shmoney page isn't a mockup. It's the Electron app's real backend, running in your browser on sql.js with a few module redirects. That post covers how.

## How this page got here

Posts are Markdown files in this site's repo, compiled at build time into plain HTML with the code highlighted and the images sized. The page you're reading ships no Markdown parser and no highlighter. Each post starts with a little frontmatter, like this:

```md
---
title: Hello, world
date: 2026-09-27
---
```

## Follow along

There's an [Atom feed](/writing/feed.xml) for your reader of choice, and shmoney's source is on [GitHub](https://github.com/rafeautie/shmoney). If something here is wrong or could be better, [email me](mailto:rafe@rafe.dev).

When I'm not behind a screen, I'm usually out with a camera, so it seems right to end the first post with a photo. There are more on the [photography](/photography) page.

![Yosemite Valley](../../photos/DSCF0740.jpg)
