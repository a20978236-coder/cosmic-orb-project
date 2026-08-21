# Cosmic Orb Project (NEXUS: Emergent Power by Wingman)

A high-performance, real-time 3D interactive web application combining autonomous agent intelligence, reactive 3D telemetry visualization, and serverless edge endpoints.

Connected to [Lovable](https://lovable.dev) for rapid iteration with full autonomous CI/CD verification.

---

## 🛠️ Tech Stack

- **Framework**: [TanStack Start](https://tanstack.com/start) with Nitro SSR
- **UI & Components**: React 19, Tailwind CSS v4, Radix UI primitives, Lucide Icons
- **3D Graphics**: Three.js, [@react-three/fiber](https://docs.pmnd.rs/react-three-fiber), [@react-three/drei](https://github.com/pmndrs/drei)
- **Runtime & Tooling**: Bun, TypeScript 5.8, Vite 8, ESLint 9, Prettier 3
- **Data & State**: TanStack React Query, Zod, React Hook Form

---

## 🧭 Architecture & Routing

The application utilizes TanStack Start file-based routing in `src/routes/`:

### Client Pages
- `/` (`src/routes/index.tsx`): Main 3D telemetry interface and interactive Cosmic Orb HUD.
- `/workflows` (`src/routes/workflows.tsx`): Autonomous pipeline management and telemetry console.
- `/coolmation` (`src/routes/coolmation.tsx`): Particle & shader animation laboratory.
- `/ghost-vision` (`src/routes/ghost-vision.tsx`): Neural vision and telemetry scanner.

### API Endpoints (`src/routes/api/`)
- `/api/chat`: Server-Sent Events (SSE) streaming chat endpoint with local fallback simulation.
- `/api/tts`: Text-to-speech audio synthesis with client Web Speech API fallback.
- `/api/stt`: Speech-to-text transcription service.
- `/api/simulate`: Real-time state and physics simulation calculation engine.
- `/api/vision`: Computer vision and image analysis endpoint.
- `/api/workflow`: Autonomous execution workflow orchestrator.
- `/api/search`: Neural search and context retrieval.
- `/api/coolmation` & `/api/image`: Visual generation and shader coordination.

### Core Modules (`src/lib/`)
- `engineering-parser.ts`: Diagnostics and 3D sub-component parser.
- `error-capture.ts`: Global exception interceptor and telemetry logger.
- `error-page.ts`: Fallback error page HTML renderer with interactive reload and navigation recovery actions.
- `lovable-error-reporting.ts`: Sync handler for Lovable integration.
- `utils.ts`: Tailwind class utility (`cn`).

---

## 🚀 Getting Started

### Prerequisites
- [Bun](https://bun.sh) (v1.1+) or Node.js (v20+)

### Installation
```bash
bun install
```

### Development
```bash
bun run dev
```

### Verification & Quality Gates
```bash
# Run unit test suite (15/15 tests)
bun test

# Run TypeScript typecheck
bun run typecheck

# Run ESLint linting
bun run lint

# Format code with Prettier
bun run format
```

---

## 🧪 Testing

The repository features 15 automated unit tests in `src/__tests__/app.test.ts` validating:
- API response contract and SSE streaming fallbacks (`/api/chat`, `/api/tts`)
- Engineering diagnostics and 3D sub-component parsing bounds (`[1, 12]`)
- Global error capture queue and telemetry integrity (`consumeLastCapturedError`, `globalThis` error events)
- Lovable error reporting and exception dispatch (`reportLovableError`, `window.__lovableEvents`)
- Fallback error page HTML structure with recovery actions (`renderErrorPage`)
- Styling and class name utility merging (`cn` utility with conflicting/conditional class resolution)
- File-based route definitions and integrity

For detailed quality verification and CI/CD status, refer to [docs/ci-cd-health.md](docs/ci-cd-health.md).

---

## ⚠️ Lovable Integration Rules

This repository is synchronized with Lovable.
- Avoid rewriting published Git history (`git push --force`, rebase/amend on synced branches).
- Ensure all commits pass `typecheck`, `lint`, and `test` to maintain a clean deployment branch.
