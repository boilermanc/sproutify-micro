# Sproutify Micro – Web Admin

Modern React + TypeScript + Vite dashboard for operators. The UI layer now runs on Tailwind CSS with the shadcn/ui component primitives so that we can iterate on the visual system quickly.

## Stack

- React 19 + Vite 7 with strict ESLint config
- Tailwind CSS + custom design tokens in `src/index.css`
- shadcn/ui components generated via `components.json`
- Supabase client shared via `@/lib/supabaseClient`

## Development

```bash
npm install
npm run dev
npm run lint
```

The dev server mounts at `http://localhost:5173`. Tailwind is configured in `tailwind.config.ts` and PostCSS via `postcss.config.cjs`.

## Styling System

- Global CSS variables (colors, radii, font stacks) live in `src/index.css`.
- `Space Grotesk` is the default sans font (`--font-sans`) and can be swapped centrally.
- Utility classes come from Tailwind; semantic tokens (`bg-background`, `text-foreground`, etc.) keep things consistent between light/dark themes.
- Reuse tokens in legacy CSS modules via the `var(--token)` / `hsl(var(--token))` pattern while the rest of the app moves to Tailwind.

## Using shadcn/ui

`components.json` is already configured for this Vite workspace. Generate new primitives with:

```bash
npx shadcn@latest add button
```

The CLI writes files under `src/components/ui` and uses the `@/lib/utils` alias for helpers such as `cn`. Feel free to customize generated styles—Tailwind variants live inside each component.

## Path Aliases

- `@/` → `src/`
- `@shared/` → shared package (`../shared`)

Update `tsconfig.app.json` and `vite.config.ts` if more aliases are required.
