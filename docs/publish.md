# Publish: repo, hosting, and the license check

## 1. Public GitHub repository (required by the rules) — done

The repository is already public: **<https://github.com/ddn9nd42hb-ai/Sitelog-hybrid-ai>**
(branch `main`, Apache-2.0 detected by GitHub, 42 tracked files; history author/committer is
`Kim Yumin <360579284+ddn9nd42hb-ai@users.noreply.github.com>`, the account noreply address).

Nothing to create: the remote already exists and `origin` points at it.

```bash
cd work/buildhybridai_2026
git remote -v          # origin = https://github.com/ddn9nd42hb-ai/Sitelog-hybrid-ai.git
git push origin main
```

Then confirm the license badge, which the rules require to be visible in the repository's About panel:

```bash
gh api /repos/ddn9nd42hb-ai/Sitelog-hybrid-ai --jq '{visibility:.private, license:.license.spdx_id, description, topics}'
# expect: private=false, license="Apache-2.0", description and six topics filled
```

Repository metadata is set with:

```bash
gh api -X PATCH /repos/ddn9nd42hb-ai/Sitelog-hybrid-ai \
  -f description "SiteLog — hybrid field notes for construction sites: Gemini Nano on-device + Firebase AI Logic cloud fallback (#BuildHybridAI 2026)" \
  -f homepage ""
gh api -X PUT /repos/ddn9nd42hb-ai/Sitelog-hybrid-ai/topics \
  -f 'names[]=firebase' -f 'names[]=gemini-nano' -f 'names[]=hybrid-ai' \
  -f 'names[]=pwa' -f 'names[]=typescript' -f 'names[]=construction'
```

If `license` ever comes back empty, add it in the web UI: **repo → About (⚙) → License → Apache-2.0** (GitHub usually detects `LICENSE` on its own within a minute).

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

`docs/devpost-submission.md` now carries the repository URL. Two placeholders are still open
because those artifacts do not exist yet:

- `<HOSTED URL>` — fill after the `firebase deploy` above
- `<YOUTUBE URL>` (record with `docs/video-script.md`)

## 4. Sanity checks before submitting

```bash
git grep -n "FIREBASE_APPCHECK_DEBUG_TOKEN" -- ':!*.example'   # must be empty
git grep -n "AIza" -- ':!.env.example'                          # must be empty (no apiKey committed)
gh api /repos/ddn9nd42hb-ai/Sitelog-hybrid-ai --jq .private      # false
```

- [x] repo public, license shown in About, `LICENSE` file present
- [ ] hosted demo deployed and `<HOSTED URL>` filled in the submission
- [ ] video on YouTube, public, English, ≤ 3:00
- [ ] App Check debug token never committed and never on camera
- [ ] project free to use until 2026-12-16
