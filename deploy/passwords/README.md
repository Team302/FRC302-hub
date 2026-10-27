# Team passwords on Cloudflare Workers

Team 302's shared logins run on **warden-worker**, an open-source server for the official Bitwarden apps that runs on
Cloudflare Workers + D1, the same free account as the hub. We use the
[Stepping Stones Group fork](https://github.com/The-Stepping-Stones-Group/warden-worker) because it's the only Workers
version with **organizations and collections** (shared logins per subteam), **pinned to commit `b83786f`**
(Oct 6, 2026, which includes the original project's v0.7.2).

How safe this is, plainly:
- Passwords are encrypted **on each person's device** by Bitwarden's official apps, with their master password. The
  server only stores encrypted data. A server bug can lose data or lock people out; it can't hand out readable
  passwords.
- The server code is a small community project with no security audit, and the sharing feature exists only in this
  fork. See [the review](#review-of-commit-b83786f) below. That's why the team's most important logins **don't** go
  here (next section).

## What goes where

| Kind of login | Where it lives |
|---|---|
| Money and identity: FIRST dashboard, bank / booster club, school accounts | **Mentors only**, in their own free personal [Bitwarden](https://bitwarden.com) accounts. Bitwarden's free plan includes a 2-person organization with 2 collections: enough for two mentors to share these. |
| Services that give everyone their own account: Onshape (education plan), GitHub (organization), Instagram/Facebook (Meta Business Suite roles) | **Individual accounts.** No shared password; removing someone removes one account. |
| Truly shared, lower-stakes logins: shop Wi-Fi, vendor accounts, tool licences | **This server**, one collection per subteam. |

## Set it up (about an hour, once)

You need: the Cloudflare account the hub uses, and a GitHub account. No software on your computer besides git.

1. **Make the team's copy of the code, pinned to the reviewed commit.** Create an empty **private** repository on GitHub,
   e.g. `zeraministries/302-passwords`, then:
   ```bash
   git clone https://github.com/The-Stepping-Stones-Group/warden-worker.git 302-passwords
   cd 302-passwords
   git checkout -B main b83786f
   cp /path/to/frc302-hub/deploy/passwords/wrangler.toml wrangler.toml
   git commit -am "Team 302 configuration"
   git remote set-url origin https://github.com/zeraministries/302-passwords.git
   git push -u origin main
   ```
   The repo is now frozen at the reviewed version. Updates only happen when someone merges them on purpose.
2. **Create the database:** Cloudflare dashboard → Storage & databases → D1 → Create → name it **`vault1`** (the name
   matters). Copy its ID.
3. **Create a Cloudflare API token:** My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template, add
   Account → D1 → Edit. Copy the token and your Account ID (dashboard sidebar).
4. **Add GitHub secrets** (repo → Settings → Secrets and variables → Actions): `CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID`. Then **Actions → Build → Run workflow**. It builds the server, downloads
   the web vault, sets up the database and deploys `team302-passwords`.
5. **Set the server's secrets:** Cloudflare dashboard → Workers → `team302-passwords` → Settings → Variables and secrets,
   all as **Secret**:
   - `JWT_SECRET` and `JWT_REFRESH_SECRET`: two *different* long random values (`openssl rand -base64 48`).
   - `ALLOWED_EMAILS`: the exact email of everyone allowed an account, comma-separated, e.g.
     `coach@team302.org,ava@school.org,marcus@school.org`. **Don't use a pattern like `*@school.org`**: that lets every
     student at the school sign up. Add people here when they join and remove them when they leave.
6. **Open the address** (`https://team302-passwords.<your-subdomain>.workers.dev`, shown on the Worker's page). You
   should see the Bitwarden sign-in page. If you get **error 1101**, the fork's advice is to use a custom domain instead:
   uncomment the `[[routes]]` block in `wrangler.toml` with a hostname on a Cloudflare domain, set `workers_dev = false`,
   push.
7. **Create your account** with an allowed email and a long master password. Then **New organization** → `Team 302`.
   Create a **collection** per subteam (Mechanical, Programming, CAD, Electrical, Outreach, Business…) plus `Leads`.
8. **Invite people:** Organization → Members → Invite. No email is sent. Tell them to create an account at the address
   above with that email, then accept the invite in the web vault; you then **Confirm** them. Give each person access
   to their subteam's collection, **Can view** unless they need to edit.
9. **Link it from the hub:** set `PASSWORDS_URL` in the hub's `wrangler.toml` to the address and deploy. The hub's
   Passwords page links there and shows students how to set up the app.

## Backups

- **D1 Time Travel** (free): the database can be restored to any minute in the last 7 days (dashboard → D1 → `vault1` →
  Time Travel, or `wrangler d1 time-travel restore vault1 --timestamp=…`). This covers "something broke yesterday".
- **Monthly export** (free, does not depend on the server working): a mentor opens the web vault → the Team 302
  organization → Export vault → format **.json (Password protected)**, and keeps the file offline (a USB drive in the
  coach's office). It can be imported into any Bitwarden-compatible service if this server ever has to be abandoned.
- Everyone's Bitwarden app also keeps an encrypted offline copy of what they can see.

The fork also has a daily backup workflow to S3 or WebDAV storage; it's optional and needs storage you'd pay for or
already have.

## Updating

Once a term (or right away if the Bitwarden apps stop syncing): look at what changed in the fork since the commit in use,
read the changes to `src/handlers/organizations.rs` and `src/handlers/ciphers.rs`, make the monthly export first, then
merge the new commit into your repo's `main`. The Build workflow deploys it. Don't follow the fork automatically.

## When someone leaves

1. Remove them from the organization (Members → Remove) **and** from `ALLOWED_EMAILS`.
2. Change any shared password that matters which they could see. Removing access doesn't make them forget it.
3. Remove or deactivate them in the hub.

## Things to tell students on day one

- The master password can't be recovered by anyone. Forget it and you get a new account and a re-invite.
- Use the Bitwarden app: choose **Self-hosted** on the sign-in screen and enter the team's address.
- Never paste a team password into a group chat.

## Review of commit b83786f

_Filled in from the code review (see below)._
