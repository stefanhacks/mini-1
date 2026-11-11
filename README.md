# mini-one

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
| `npm run anims -- <unity-checkout>` | Regenerate `src/assets/anims.ts` from the original Unity project's clips (`--check` only compares) |

## Deploys

Netlify builds every branch and PR (`netlify.toml`):

- Production (`main`): https://mini-one.netlify.app
- Branch preview: `https://<branch>--mini-one.netlify.app`
- PR preview: `https://deploy-preview-<pr-number>--mini-one.netlify.app`

## License

[Unlicense](LICENSE) (public domain).

The Josefin Slab font (`src/assets/fonts/`) is © Santiago Orozco and licensed under the SIL Open Font License 1.1
(see [`public/fonts/OFL.txt`](public/fonts/OFL.txt)), not under the Unlicense.
