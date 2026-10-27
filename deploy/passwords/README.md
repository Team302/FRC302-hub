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
   git am /path/to/frc302-hub/deploy/passwords/patches/0001-team302-hardening.patch
   cp /path/to/frc302-hub/deploy/passwords/wrangler.toml wrangler.toml
   git commit -am "Team 302 configuration"
   git remote set-url origin https://github.com/zeraministries/302-passwords.git
   git push -u origin main
   ```
   The repo is now frozen at the reviewed version plus our fixes ([what they fix](#what-our-patch-fixes)). Updates
   only happen when someone merges them on purpose.
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
   - `ORG_CREATION_EMAILS`: the mentor email(s) allowed to create the organization, e.g. `coach@team302.org`. Added by
     our patch; without it nobody can create one. You can delete it once the organization exists.
   - Leave `ORIGIN_SHARED_SECRET` unset (it's for a proxy setup we don't use).
6. **Open the address** (`https://team302-passwords.<your-subdomain>.workers.dev`, shown on the Worker's page). You
   should see the Bitwarden sign-in page. If you get **error 1101**, the fork's advice is to use a custom domain instead:
   uncomment the `[[routes]]` block in `wrangler.toml` with a hostname on a Cloudflare domain, set `workers_dev = false`,
   push.
7. **Create your account** with the `ORG_CREATION_EMAILS` email and a long master password, and turn on two-step login
   (Settings → Security → Two-step login → Authenticator app). Then **New organization** → `Team 302`. Create a
   **collection** per subteam (Mechanical, Programming, CAD, Electrical, Outreach, Business…) plus `Leads`. Invite a
   second mentor as **Owner** so the team isn't locked out if you leave.
8. **Add people, in this order, in person** (at a meeting, on their own phone or laptop):
   1. Add their email to `ALLOWED_EMAILS`.
   2. They **create their account** at the address above while you watch. The server never checks that someone owns an
      email, so whoever registers an allowed email first gets it. Doing it in front of you is the check.
   3. Organization → Members → **Invite** them. No email is sent. Role **User**; their subteam's collection with
      **Can view**. Give **Can edit** only to the people who actually change those logins (leads).
   4. They accept the invite in the web vault.
   5. You **Confirm** them. Bitwarden shows a **fingerprint phrase**; they open Settings → My account and read theirs
      out. Confirm only if the words match. This is what proves you're giving the team's key to their device and not
      someone else's.
   6. When everyone is in, set `ALLOWED_EMAILS` to `closed@invalid` until the next person joins, so nobody can sign up.
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
read the changes to `src/handlers/organizations.rs`, `ciphers.rs` and `accounts.rs`, make the monthly export first, then
merge the new commit into your repo's `main` (our patch has to still apply) and rerun the [test](#end-to-end-test)
locally before pushing. The Build workflow deploys it. Don't follow the fork automatically.

## When someone leaves

1. Remove them from the organization (Members → Remove) **and** from `ALLOWED_EMAILS`. Our patch keeps the items they
   added when their account is deleted; without it, those items would be deleted with the account.
2. Change any shared password that matters which they could see. Removing access doesn't make them forget it.
3. Remove or deactivate them in the hub.

## Things to tell students on day one

- The master password can't be recovered by anyone. Forget it and you get a new account and a re-invite.
- Use the Bitwarden app: choose **Self-hosted** on the sign-in screen and enter the team's address.
- Never paste a team password into a group chat.

## Review of commit b83786f

Read in October 2026: the organization, collection, cipher, account and sign-in code
(`src/handlers/organizations.rs`, `ciphers.rs`, `accounts.rs`, `identity.rs`, `src/router.rs`, `sql/schema.sql`). Then
built and run locally with `wrangler dev` and tested end to end (below). This is one careful read plus a test, not an
audit.

### What our patch fixes

`patches/0001-team302-hardening.patch`, applied on top of b83786f in setup step 1:

| # | Problem in b83786f | Fix |
|---|---|---|
| H1 | **Deleting an account deletes the shared items that person created.** The code deletes only personal items, but the database's `ON DELETE CASCADE` on `ciphers.user_id` then removes their organization items too. A student who deletes their account silently takes the Wi-Fi login they added with them. | Detach organization items from the account before deleting it. |
| L1 | The only owner can delete their account, leaving an organization nobody can manage. | Refused while you're the only confirmed owner. |
| L2 | An admin can confirm a member who never accepted the invite. With the next problem (H2) this makes it easier to hand the team key to the wrong account. | Only members who accepted can be confirmed. |
| M1 | Any signed-in user can create organizations. | Only emails in `ORG_CREATION_EMAILS`. |

### What the patch doesn't fix, and how we work around it

Found by reading the code; the test below doesn't exercise these.

| # | Problem | What we do |
|---|---|---|
| H2 | **No email verification.** Whoever registers an allowed email first owns that account, and inviting an email that has no account yet creates a placeholder the first registrant takes over. | Register before invite, in person; check the fingerprint phrase before confirming; `ALLOWED_EMAILS` exact and closed (`closed@invalid`) between intakes. Setup step 8. |
| M2 | **Can edit** includes permanent delete (not just trash). | Students get **Can view**. Monthly export plus 7-day D1 Time Travel. |
| M3 | **Hide passwords** is only enforced by the app. The password is still sent to the device, and anyone with the key can read it with a script. That's how Bitwarden works too. | Don't rely on it. If someone mustn't see a password, don't put it in their collection. |
| L3 | A member who accepted but isn't confirmed can download the organization's *encrypted* private key. Useless without the organization key, which they get only on confirm. | Nothing needed. |
| L4 | An Admin can replace the organization's key pair. | Nobody gets **Admin**: Owners (mentors) and Users only. |
| L5 | Item lists reveal the IDs of collections an item is in, including ones you can't see. | IDs only, no names or contents. Accepted. |
| L7 | "Log in with device" approval looked broken in the code. Not tested. | Use the master password. |
| L9 | Sign-in tokens appear in some URLs (live-sync connection), and the config keeps Cloudflare request logs. | Only people with access to the Cloudflare account can see the logs, and they control the server anyway. Keep that account to mentors, with two-factor on. |
| L10 | The sign-in limit (5 a minute) counts per email, so someone can keep a person locked out by failing on purpose. | Annoyance, not a leak. Watch for it. |

Everything else that matters held up: the server only stores encrypted data, members can only read or change items in
collections they've been given, and role changes need an Owner.

### End-to-end test

`test/e2e.mjs` creates four accounts with Bitwarden's real encryption (PBKDF2 600,000, AES-CBC + HMAC, RSA-OAEP), an
organization with Mechanical and Electrical collections, then tries to break it. Run against b83786f with and without
the patch:

| Check | b83786f | Patched |
|---|---|---|
| Email not in `ALLOWED_EMAILS` can't register | pass | pass |
| Student can create an organization | **yes** | no |
| Member confirmed without accepting | **yes** | no |
| Can't accept someone else's invite | pass | pass |
| Server returns each person's real public key (what the fingerprint check compares) | pass | pass |
| Mechanical member sees Mechanical items only; Electrical member Electrical only | pass | pass |
| Member can't read, edit, trash, delete or move another collection's item by ID (404) | pass | pass |
| **Can view** member can't edit, delete or add items (403) | pass | pass |
| Member can't make themselves owner, grant themselves a collection, invite, create collections, replace the org keys or rename the org (403) | pass | pass |
| Item survives its creator deleting their account | **deleted** | kept |
| Removed member sees nothing and can't fetch items by ID | pass | pass |
| Only owner can't delete their account | **allowed** | refused |
| | 46 pass, 2 fail | **51 pass, 0 fail** |

Then the official Bitwarden web vault (2026.6.4, the one this server serves) logged in to the patched server and
decrypted the shared items and collection names. So the server works with Bitwarden's own apps, not just the test.

To rerun after an update: build the server, run it with `wrangler dev` on a fresh local database loaded from
`sql/schema.sql`, with `ALLOWED_EMAILS=coach@team302.test,ava@team302.test,marcus@team302.test,sam@team302.test` and
`ORG_CREATION_EMAILS=coach@team302.test` in `.dev.vars`, then `node test/e2e.mjs http://127.0.0.1:8787 patched`.
Everything should pass.
