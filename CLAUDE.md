# eeiriee

Browser game client. Vite + TypeScript + Pixi.js (`pixi.js` is the only runtime dependency).

## Commands

- `npm run dev`: local dev server
- `npm run typecheck`: `tsc`
- `npm run lint`: eslint
- `npm run build`: Vite build into `dist`
- `npm run preview`: serve the `dist` build locally
- `npm run check`: `typecheck`, `lint`, and `build` in sequence

If `node_modules` is missing, install with `npm ci`. Run `npm run check` (`typecheck`, `lint`, and `build`) before every push (`build` is `vite build`, which doesn't typecheck, and it's what Netlify runs). If they can't run (no network for installs), say so in the report instead of skipping silently.

## Ask, don't assume

- If a request is ambiguous or can be read two ways, ask before acting. Don't guess scope, names, or intent.
- The owner's first language is PT-BR and their English can slip. If wording is unclear, ask instead of interpreting.
- Don't assume state you haven't checked: build status, whether a branch or PR exists, what is on `main`.

## Git workflow

- Never commit or push to `main`. Always work on a branch.
- Branch names are flat, lowercase, hyphenated, with no slashes, and start with `cl-`: `cl-fix-spin-button`, not `fix/spin-button`. Netlify turns the branch name into the preview URL.
- If the session or harness assigns a branch that breaks this rule (e.g. `claude/<something>`), don't push to it. Use a `cl-<task-name>` branch instead.
- Create new branches from a freshly fetched `origin/main`, never from whatever is checked out, unless the user says otherwise.
- Push after each requested change.
- Never force-push or rewrite history that is already pushed. Never delete remote branches. GitHub deletes head branches automatically after a merge.
- Never commit secrets: `.env` files, tokens, keys.
- Never open a branch on your own initiative. Keep working on the current branch unless the user asks for a new one. If it is unclear whether a request counts as a "new feature", ask.
- Exception: once the last task's PR is merged, a new request starts a new task. Create a new `cl-<task-name>` branch and draft PR for it without asking.

## Pull request lifecycle

| The user says | You do |
|---|---|
| "new branch" or "new feature" | Create the branch, push it, and immediately open a PR from it flagged as **draft**. |
| "ready to merge" | Remove the draft flag. Then wait. Don't merge. |
| An explicit instruction to merge | Check first, then squash-merge and report the production URL. Confirm GitHub auto-deleted the branch; if it didn't, tell the user. Without the instruction, the user merges manually. |

- Before merging, confirm the PR has no conflicts and its Netlify deploy preview is `ready`. If either check fails, don't merge. Report it instead.
- Always squash-merge.
- `main` is protected on GitHub and only changes through PRs. Never try to push to it directly.
- Every PR description is one condensed paragraph, shortened as much as possible, saying what was done. Update it after each push so it stays accurate.
- If the user's wording doesn't clearly match a row above (for example "approved" or "looks good"), ask what they mean.

## Netlify

- Site: `eeiriee`. Config lives in `netlify.toml` (build `npm run build`, publish `dist`, Node 22).
- Branch preview: `https://<branch>--eeiriee.netlify.app`
- PR preview: `https://deploy-preview-<pr-number>--eeiriee.netlify.app`
- Production (builds from `main`): `https://eeiriee.netlify.app`
- Start every answer with a header: the task name and the branch preview link of the current branch, then the GitHub PR link, then a horizontal rule. The task name is the branch name without `cl-`, in title case. Omit the PR line if no PR is open. With no working branch, use the production link. Nothing else in the header: no notes on build status.

  ```md
  Auto Delete Branches: https://cl-auto-delete-branches--eeiriee.netlify.app

  PR: https://github.com/stefanhacks/eeiriee/pull/3

  ---
  ```

  Keep the blank lines: without them Markdown merges the two link lines into one, and turns the line above `---` into a heading.
- If the user pastes a failed build log, find the cause first, then fix it.

## Working rules

- Show only changed code unless asked for the full file. Flag risks: performance, breaking changes, browser compatibility.
- Match the existing code style. This codebase is shared by engineers of different levels, so when styles conflict, ask, and prefer the style written by Stefan (the owner, `stefanhacks`).
- Don't invent APIs, config options, or library functions. If unsure something exists, say so.
- Don't add dependencies without stating the trade-off first. Prefer not adding any.
- Watch for machine-written code in the repo; it may be outdated or written under weak instructions. Verify before building on it.
- Never write or sign anything as the user. Every GitHub action runs through the owner's account, so mark Claude's work as Claude's.
  - Commits carry the Claude `Co-Authored-By` line.
  - PR descriptions, comments, and reviews written by Claude say so (e.g. the Claude Code footer).

## Commit messages

- About 60 characters, lowercase, in the form `<prefix>: <message>`. Example: `wip: adding files to repository`.
- Prefix every commit with one of these contexts:
  - `wip:` commits while the PR is a draft.
  - `add:` commits after the PR leaves draft that fit none of the prefixes below.
  - `fix:` commits focused only on hotfixes and tests.
  - `pcr:` commits added after a review (post code review).
