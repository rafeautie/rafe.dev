# Protecting /admin with Cloudflare Access

The `/admin` route manages the photo gallery: order, metadata, uploads, deletes.
It has no login of its own. Cloudflare Access is the whole of its auth.

**Until the two steps below are done, `/admin` refuses every request in
production.** `requireAdmin()` treats unset config as "deny", not "allow".

## 1. Create the Access application

In the Cloudflare dashboard, under Zero Trust > Access > Applications, add a
self-hosted application:

- **Domain**: `rafe.dev`, path `admin`
- **Policy**: action Allow, rule `Emails` matching your own address

Once saved, copy the **Application Audience (AUD) Tag** from the application's
Overview tab, and note your team domain (`<team>.cloudflareaccess.com`, shown
under Zero Trust > Settings > Custom Pages, or in the dashboard URL).

## 2. Fill in the vars

In `wrangler.jsonc`:

```jsonc
"vars": {
  "CF_ACCESS_TEAM_DOMAIN": "<team>.cloudflareaccess.com",  // no https://
  "CF_ACCESS_AUD": "<the AUD tag>"
}
```

Then `pnpm gen` to regenerate types and `pnpm deploy`.

## Why the JWT is verified rather than trusted

Access does not protect a Worker, it protects a hostname. Requests arriving by
any other hostname reach the same Worker code with no Access policy in front of
them, and on those paths the `Cf-Access-Jwt-Assertion` header is just an
attacker-supplied string. Checking that the header exists would be no check at
all. So `require-admin.ts` verifies the token's signature against the team's
public keys and checks the `aud` claim against this specific application.

`workers_dev` and `preview_urls` are also off in `wrangler.jsonc`, which closes
the alternate hostnames rather than relying on the JWT check alone. The cost is
that preview URLs are no longer available for this Worker. Turning either back
on means `/admin` is reachable at a hostname Access does not cover, defended
only by the JWT check.

## Local development

Access never sees the dev server, so there is no token locally and
`requireAdmin()` returns a stub identity when `import.meta.env.DEV` is set. Vite
replaces that with a literal at build time, so the bypass is not present in the
deployed bundle.

`pnpm dev` binds the **live** `photos` R2 bucket (`"remote": true` in
`wrangler.jsonc`). Uploads and deletes in local dev hit real production data.
