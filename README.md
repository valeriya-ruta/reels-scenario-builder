# Reel Planner

A shot list and scene planning tool purpose-built for short-form video (Instagram Reels). Plan your reel scene by scene, then share frozen read-only links with actors (shoot mode) and editors (edit mode).

## Tech Stack

- **Next.js 16** (App Router) with TypeScript
- **Tailwind CSS** for styling
- **Supabase** for database, authentication, and snapshot storage
- **@dnd-kit** for drag-and-drop scene reordering

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Get your project URL and anon key from Project Settings > API
3. Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Run Database Migration

The database schema needs to be created in your Supabase project. You can either:

- Use the Supabase MCP tools (if configured) to run the migration
- Or manually run the SQL migration from the plan file in your Supabase SQL editor

The migration creates:
- Enum types for all the scene/transition options
- Tables: `projects`, `scenes`, `transitions`, `snapshots`
- Row Level Security (RLS) policies
- Indexes for performance

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Features

### Build Mode (`/project/[id]`)

- Create and edit projects with scene-by-scene planning
- Drag-and-drop scene reordering
- Configure framing, pose, arm state, facing, and more
- Add actor and editor notes
- Toggle between "Solo shoot" and "With crew" modes
- Generate shareable snapshot links

### Shoot Mode (`/share/[token]/actor`)

- Read-only checklist view for actors
- Check off completed scenes (local state only)
- Focus on actor-relevant information
- Mobile-friendly interface

### Edit Mode (`/share/[token]/editor`)

- Read-only view for editors
- Prominent transition visualization
- Editor notes highlighted
- Camera motion and shot size details (when crew mode is enabled)

### Claude / MCP (`/api/mcp`)

The app is its own MCP server, so content can be created by talking to Claude
instead of typing into the app. It is hosted by this Next.js deployment — there
is no second service and no second bill.

**Transport.** Streamable HTTP, stateless: the client POSTs JSON-RPC 2.0 and
gets JSON back. `GET` with `Accept: text/event-stream` answers `405` (no
server→client stream); a plain `GET` returns a small "yes, this is the server"
document.

**Auth.** A per-user token, HMAC-signed with `MCP_TOKEN_SECRET` — no key table,
no migration. Two ways to present it, because the two clients differ:

| Client | How |
| --- | --- |
| claude.ai / Claude app | Paste the whole URL as a custom connector: `https://<app>/api/mcp/<token>` |
| Claude Code | `claude mcp add --transport http ruta https://<app>/api/mcp --header "Authorization: Bearer <token>"` |

Each user's URL is on **Профіль → Claude**, masked until revealed. It *is* the
account credential, so it is treated like a password. Rotating
`MCP_TOKEN_SECRET` invalidates every issued token at once (there is no
per-token revocation — that is the trade for having no key storage).

**Tools:** `list_content`, `get_content`, `create_reel`, `create_story`,
`create_carousel`, `create_idea`, `schedule_content`, `set_content_status`.

**Env required:**

```env
MCP_TOKEN_SECRET=<any long random string>   # unset ⇒ the endpoint is closed
SUPABASE_SERVICE_ROLE_KEY=<service role>    # rows are read/written per user_id
NEXT_PUBLIC_APP_URL=https://app.example.com # used to build the connector URL
```

With no `MCP_TOKEN_SECRET` the endpoint fails closed (`503`) and the Профіль card
says the feature is off — a missing env var never reads as "no auth required".

The wire protocol, the token rules and the argument validation are pure modules
under `lib/mcp/` and are covered by `e2e/mcp.logic.spec.ts`.

## Project Structure

```
reels-planner/
├── app/
│   ├── page.tsx              # Landing/login page
│   ├── projects/              # Projects list
│   ├── project/[id]/          # Project builder
│   └── share/[token]/          # Share views (actor/editor)
├── components/                # React components
├── lib/                       # Utilities and types
│   ├── auth.ts                # Auth helpers
│   ├── domain.ts              # TypeScript types
│   ├── supabaseClient.ts     # Client-side Supabase
│   └── supabaseServer.ts     # Server-side Supabase
└── app/actions.ts             # Server actions
```

## Database Schema

- **projects**: User's reel projects
- **scenes**: Individual scenes within a project
- **transitions**: Transitions between consecutive scenes
- **snapshots**: Frozen copies of projects for sharing

All tables have Row Level Security (RLS) enabled. Projects and scenes are only accessible by their owner. Snapshots are publicly readable by token.

## Development

The app uses:
- Server components for data fetching
- Server actions for mutations
- Client components for interactive UI (drag-and-drop, forms)
- Supabase SSR for authentication

## License

Private project.
