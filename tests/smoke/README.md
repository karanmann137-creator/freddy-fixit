# Nightly smoke test

A headless browser that opens the live site every night at 06:30 Calgary time and
checks that every page still comes up. It reads only — it posts no request,
starts no job, and sends no email.

It exists to cover the one gap between the two checks that already run: the
typecheck reads the source tree, `platform_health_check()` reads the database,
and neither can see a **deployed bundle that is broken** or a **surface that has
gone missing**. That is the shape of every outage this platform has had.

## Run it yourself

```
cd ~/freddy-fixit/tests/smoke && npm install && npx playwright install chromium && npx playwright test
```

First run downloads a browser (~150MB, once). After that just:

```
cd ~/freddy-fixit/tests/smoke && npx playwright test
```

To see the failures as a web page:

```
cd ~/freddy-fixit/tests/smoke && npx playwright show-report playwright-report
```

To watch it click through in a visible window: add `--headed`.

To test a Vercel preview before promoting it:

```
FF_SMOKE_BASE_URL=https://your-preview.vercel.app npx playwright test
```

## Run it on GitHub

GitHub → **Actions** → **smoke** → **Run workflow**. It also runs itself nightly.

## The two optional secrets

The anonymous half of the suite needs no setup. The signed-in half — the only
part that can load the client dashboard chunk — skips itself until you add two
repository secrets:

GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Name | Value |
|---|---|
| `FF_SMOKE_EMAIL` | a throwaway **client** account's email |
| `FF_SMOKE_PASSWORD` | its password |

That account must be `role = client` and must **not** be enrolled in two-step
sign-in, or CI parks forever on a code it cannot read. The test fails fast with
that exact message if it ever does get enrolled.

The repo is public, so these can only live in Secrets — never in a file.

## What it proves, and what it does not

**Proves:** every public page's lazy chunk loads and renders real content; no
page throws during render; no asset 404s; the error boundary is not showing; the
three dashboards redirect an anonymous visitor to a working login form; every
URL in the live sitemap still routes somewhere real rather than silently
bouncing to the home page.

**Does not prove** that the pay/contract surface is mounted. `<ContractPanel/>`
only appears for a job at the agreement stage, and the test account has no jobs.
That gap is covered by `tools/check_mounts.py`, which reads the tree instead and
refuses a push where the mount has been dropped — the fault that once made every
job on the platform unpayable with no error anywhere.
