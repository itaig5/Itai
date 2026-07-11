# Deploying RevPilot

## The dashboard (Vercel — ~3 minutes to a permanent URL)

1. Go to **vercel.com/new** and import the repo `itaig5/Itai`
   (Add New → Project → Import Git Repository; connect GitHub if asked).
2. **Root Directory:** click *Edit* and set it to `rms-marketing-agent/app`.
   Leave "Include files outside the Root Directory" **enabled** (default) — the app
   depends on the `@revpilot/core` workspace one level up.
3. Framework preset: **Next.js** (auto-detected; `app/vercel.json` pins the install
   command to the workspace root).
4. **Production branch:** in Project → Settings → Git, set it to
   `claude/rms-marketing-agent-build-i5rwqz` (or merge to main first).
5. Deploy. No environment variables are needed for the seed-data demo.

Optional env vars (Project → Settings → Environment Variables): the same flags as
`.env.example` — `GUESTY_*`, `HOSTAWAY_*`, `BOOKING_INSIGHTS_*`, `ML_SERVICE_URL`,
`NIXTLA_API_KEY`.

**Demo-state caveat (by design):** on Vercel the JSON demo store lives in `/tmp`,
which is per-instance and ephemeral — the world can reset between visits or differ
across concurrent instances. Fine for showing the product; real persistence is the
Supabase/Postgres step (the `Store` port + `mvp/src/db/schema.sql` are ready).

## Real persistence + login (Supabase, ~10 minutes)

1. Create a free project at **supabase.com** → copy the **Transaction pooler** connection
   string (Settings → Database → Connection string → *Transaction*, port 6543).
2. Set env vars (Vercel → Project → Settings → Environment Variables, or `.env.local`):
   ```
   DATABASE_URL=postgresql://postgres.xxxx:PASSWORD@aws-0-...pooler.supabase.com:6543/postgres
   REVPILOT_AUTH=local
   REVPILOT_AUTH_SECRET=<long random string>
   REVPILOT_ADMIN_EMAIL=itai@dconsult.me
   REVPILOT_ADMIN_PASSWORD=<your password>
   ```
3. Redeploy. The store bootstraps its own tables (`revpilot_world` + append-only
   `revpilot_audit_events` / `revpilot_outcomes` mirrors) on first boot and the world now
   survives restarts and instances. The audit/outcome mirrors are plain SQL — query them
   directly in Supabase for reporting.
4. Sign in with the admin credentials. On the **Clients** page, *Create login* issues a
   read-only login per client — client users see ONLY their own portfolio (enforced
   server-side, not just in the UI) and cannot approve/change anything.

Without these vars nothing changes: auth stays off and the demo store persists as JSON —
the one-command demo keeps working.

## The ML service (Fly.io / Railway / Render)

Any Python host works; the service is a single FastAPI app:

```bash
cd ml-service
pip install -r requirements.txt
python3 -m uvicorn main:app --host 0.0.0.0 --port 8787
```

Point the dashboard at it with `ML_SERVICE_URL=https://<your-host>`. Without it the
TS fallback bandit runs in-process — everything still works.

## The MCP server

- **Local (Claude Desktop / Claude Code):** `npm run mcp` — stdio; config template
  in `mcp.example.json`.
- **Remote (external products):** `npm run mcp:http` — Streamable-HTTP on port 8788,
  Bearer-key auth via `REVPILOT_API_KEYS` (comma-separated). Deploy it like any small
  Node service (Fly/Railway); it shares the same env flags as the app.
