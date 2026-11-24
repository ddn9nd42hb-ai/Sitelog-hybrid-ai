# Publish: repo, hosting, and the license check

The repository is already committed locally (`work/buildhybridai_2026`, one commit, 40 tracked files, Apache-2.0).

## 1. Public GitHub repository (required by the rules)

GitHub must be connected in the Pickle app first (`gh` reports "GitHub is not connected" while the token is invalid).

```bash
cd work/buildhybridai_2026
gh repo create sitelog-hybrid-ai --public --source=. --remote=origin --push \
  --description "Hybrid field notes for construction sites: Gemini Nano on-device + Firebase AI Logic cloud fallback."
```

Then confirm the license badge, which the rules require to be visible in the repository's About panel:

```bash
gh repo view --json licenseInfo,visibility,url
# expect: {"licenseInfo":{"key":"apache-2.0", ...}, "visibility":"PUBLIC"}
```

If `licenseInfo` comes back empty, add it in the web UI: **repo → About (⚙) → License → Apache-2.0** (GitHub usually detects `LICENSE` on its own within a minute).

## 2. Hosted demo (strongly encouraged)

```bash
npm i -g firebase-tools
firebase login
firebase init hosting     # public directory: dist · single-page app: yes · no GitHub deploys
npm run build
firebase deploy --only hosting
```

Before deploying publicly, replace the App Check debug provider with reCAPTCHA v3 (`VITE_RECAPTCHA_SITE_KEY`) and rebuild — see `docs/firebase-setup.md` §7.

## 3. Point the submission at the published artifacts

Fill the three placeholders in `docs/devpost-submission.md`:

- `<GITHUB URL>`
- `<HOSTED URL>`
- `<YOUTUBE URL>` (record with `docs/video-script.md`)

## 4. Sanity checks before submitting

```bash
git grep -n "FIREBASE_APPCHECK_DEBUG_TOKEN" -- ':!*.example'   # must be empty
git grep -n "AIza" -- ':!.env.example'                          # must be empty (no apiKey committed)
gh repo view --json visibility                                  # PUBLIC
```

- [ ] repo public, license shown in About, `LICENSE` file present
- [ ] video on YouTube, public, English, ≤ 3:00
- [ ] App Check debug token never committed and never on camera
- [ ] project free to use until 2026-12-16
