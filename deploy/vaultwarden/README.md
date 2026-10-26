# Team passwords: Vaultwarden

The hub doesn't store passwords. The team uses **Vaultwarden**, a free, open-source server for the
official **Bitwarden** apps and browser extensions. Passwords are encrypted on each person's device
with their master password, so the server (and whoever runs it) can't read them. Organizations and
collections are free, which gives each subteam its own set of logins.

This folder runs it with Docker and puts it online through a free **Cloudflare Tunnel**: the computer
running it needs no open ports, no public IP and no certificate setup.

It was tested here: the server starts from this compose file, the admin page accepts the right
password and refuses a wrong one, strangers can't sign up while invited people can, and a backup
made while running restores cleanly. The tunnel itself needs your Cloudflare account, so that part
is untested.

## What you need

- A computer that stays on: an old laptop/PC or a Raspberry Pi 4/5 (64-bit OS), at school or at a
  mentor's house, with Docker installed. Or a free cloud VM (e.g. Oracle Cloud "Always Free").
- A domain on Cloudflare (the free plan is fine), e.g. `vault.team302.org`. If the hub already uses
  a team domain on Cloudflare, use a subdomain of it.
- One mentor who owns this: updates, backups, and the admin password.

## Set up (about 30 minutes)

1. **Copy this folder** to the computer and open a terminal in it.
2. **Make the admin password hash** (for the admin page at `/admin`):
   ```bash
   docker run --rm -it vaultwarden/server:1.37.4 /vaultwarden hash --preset owasp
   ```
   Type a long password twice and copy the `$argon2id$...` line it prints.
3. **Create the tunnel:** Cloudflare dashboard → Zero Trust → Networks → Tunnels → Create a tunnel →
   Cloudflared → name it `team302-vault` → choose Docker and copy the token from the command shown.
   Then add a **public hostname**: `vault.team302.org` → Service type `HTTP`, URL `vaultwarden:80`.
4. **Fill in `.env`:**
   ```bash
   cp .env.example .env
   ```
   Set `DOMAIN` (https://vault.team302.org), `ADMIN_EMAILS`, `ADMIN_TOKEN` (the hash, inside the
   single quotes) and `TUNNEL_TOKEN`. Optional: copy `smtp.env.example` to `smtp.env` for email.
5. **Start it:** `docker compose up -d`. Open https://vault.team302.org; you should see the Bitwarden
   sign-in page.
6. **Invite yourself:** open `https://vault.team302.org/admin`, sign in with the admin password,
   Users → invite your email. Then on the main page choose **Create account** with that email.
   (Without email set up, invited people just register with the invited address; nobody else can.)
7. **Make the team organization:** in the web vault, New organization → `Team 302`. Create a
   **collection** per subteam (Mechanical, Programming, CAD, Electrical, Outreach, Business…) plus
   `Leads` and `Mentors`. Add logins to the right collections.
8. **Invite the team:** invite each person (admin page or Organization → Members → Invite), and give
   them access to their subteam's collection, **read-only** ("Can view") unless they need to edit.
9. **Link it from the hub:** set `PASSWORDS_URL = "https://vault.team302.org"` in `wrangler.toml` and
   deploy. The hub's Passwords page then links there and explains how to install the apps.
10. **Lock down the admin page:** after setup, you can disable it entirely by removing `ADMIN_TOKEN`
    from `.env` and running `docker compose up -d` (add it back when you need it).

## Backups (do this the same day)

```bash
crontab -e
# add:
15 3 * * *  cd /path/to/deploy/vaultwarden && ./backup.sh >> backup.log 2>&1
```

`backup.sh` makes a consistent copy while the server runs and keeps 30 days in `./backups`. **Copy
backups off this computer** (a USB drive, another machine, or encrypted cloud storage), or a dead
disk takes every password with it. To restore: `docker compose stop vaultwarden`, empty `./data`,
extract a backup into it (`tar -xzf backups/vaultwarden-….tar.gz -C data`), `docker compose start
vaultwarden`.

If the computer is off, people's Bitwarden apps keep working from their offline copy; they just
can't save changes or sync until it's back.

## Updates (monthly)

Read the release notes at https://github.com/dani-garcia/vaultwarden/releases, change the version in
`docker-compose.yml`, then:

```bash
./backup.sh && docker compose pull && docker compose up -d
```

## When someone leaves

Remove them from the organization (Organization → Members). They lose access to the shared
collections at their next sync, but **anything they already saw they may still have**: change the
passwords that matter (FIRST dashboard, social accounts, Onshape) after a student or mentor leaves
on bad terms. Also remove or deactivate them in the hub.

## Things that can go wrong

- **Forgotten master passwords can't be recovered**, by design. The person gets a new account and is
  re-invited; anything only in their personal vault is gone. Tell students this on day one.
- **The admin token is powerful** (it can invite and delete users, though not read passwords). Keep
  it in the mentor's own password manager, and disable the admin page when not in use.
- **This is a server the team now runs.** If nobody updates it, it falls behind on security fixes.
  Put the monthly update on the mentor calendar.
