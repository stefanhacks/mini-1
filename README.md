# eeiriee

Browser game client built with Vite, TypeScript and Pixi.js (the only runtime dependency).

## Requirements

Node 22 (see `.nvmrc`).

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build into `dist` |
| `npm run preview` | Serve the `dist` build locally |
| `npm run typecheck` | `tsc` |
| `npm run lint` | ESLint |
| `npm run check` | Typecheck, lint and build, in that order |

## Deploys

Netlify builds every branch and PR (`netlify.toml`):

- Production (`main`): https://eeiriee.netlify.app
- Branch preview: `https://<branch>--eeiriee.netlify.app`
- PR preview: `https://deploy-preview-<pr-number>--eeiriee.netlify.app`

## License

[Unlicense](LICENSE) (public domain).
