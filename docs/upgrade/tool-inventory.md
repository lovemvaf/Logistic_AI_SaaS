# Tool Inventory — 32 Local Reference Repositories

Audit Date: 2026-11-11  
Local Directory: `C:\Users\asus\.gemini\config\skills\_repos`  
Policy (`PROMPT §B.10, §M` and `AGENTS.md §1`): Reference tools only — **zero** production dependencies added to `package.json`, `pnpm-lock.yaml`, `go.mod`, or `Cargo.toml`; **zero** overlapping hook/memory daemons installed.

| # | Name | Local Commit | Origin URL | License | Has Skill | Selection Status | Rationale / Usage Scope |
|---|---|---|---|---|---|---|---|
| 1 | `repomix` | `d871704` | https://github.com/yamadashy/repomix.git | MIT | yes | `skipped` | Direct `read_file`/`run_command` reads target exact files faster without packing extra context |
| 2 | `codegraph` | `f72c9d2` | https://github.com/colbymchenry/codegraph.git | MIT | no | `skipped` | Cross-service NestJS/Go/Rust/TS edges traced directly from source and static verifier |
| 3 | `Understand-Anything` | `4e6d329` | https://github.com/Egonex-AI/Understand-Anything.git | MIT | no | `skipped` | Codebase already inventoried in `Ra_soat_SmartLogi_11-11-2026.md` and direct module reads |
| 4 | `t3code` | `3d369d55` | https://github.com/pingdotgg/t3code.git | MIT | no | `skipped` | Agent harness control surface, not a T3/Next library for SmartLogi |
| 5 | `firecrawl` | `16eab64` | https://github.com/firecrawl/firecrawl.git | AGPL-3.0 | yes | `skipped` | No web crawling required; AGPL incompatible with core bundling |
| 6 | `archify` | `a406594` | https://github.com/tt-a1i/archify.git | Custom | no | `skipped` | Architecture documented directly from verified NestJS/Go/Prisma code (`architecture-and-erd.md`) |
| 7 | `iFixAi` | `260550f` | https://github.com/ifixai-ai/iFixAi.git | Apache-2.0 | no | `skipped` | Manual root-cause review + regression specs preferred over third-party auto-fixers |
| 8 | `claude-code-best-practice` | `af99688` | https://github.com/shanraisshan/claude-code-best-practice.git | MIT | no | `skipped` | Workflow governed by `AGENTS.md` and `PROMPT_HOAN_THIEN_SMARTLOGI.md` |
| 9 | `andrej-karpathy-skills` | `2c60614` | https://github.com/multica-ai/andrej-karpathy-skills.git | none | yes | `selected (guideline)` | Surgical, scoped edits and verifying imports/types statically (`SKILL.md` reviewed) |
| 10 | `superpowers` | `2ce8aa1` | https://github.com/obra/superpowers.git | MIT | yes | `selected (guideline)` | Structured gate-by-gate root cause analysis -> patch -> regression test execution |
| 11 | `agent-skills` | `301b02b` | https://github.com/addyosmani/agent-skills.git | MIT | yes | `selected (guideline)` | Frontend TypeScript/Next.js review hygiene without adding dependencies |
| 12 | `skills` | `4ae2317` | https://github.com/mattpocock/skills.git | MIT | yes | `skipped` | Standard TS strict typing & Vitest/Jest patterns already native to SmartLogi |
| 13 | `system-prompts-and-models-of-ai-tools` | `162db92` | https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools.git | GPL | no | `skipped` | Prohibited by policy §B.10 / §M (no system prompt copying) |
| 14 | `claude-mem` | `02584c4` | https://github.com/thedotmack/claude-mem.git | Custom | no | `skipped` | File-backed state consolidated in `docs/upgrade/` per §C |
| 15 | `agentmemory` | `ce95e5e` | https://github.com/rohitg00/agentmemory.git | Apache-2.0 | no | `skipped` | Avoid parallel memory stores; state lives in `docs/upgrade/` |
| 16 | `elephant-goldfish-model` | `464db03` | https://github.com/google/elephant-goldfish-model.git | Apache/BSD | yes | `skipped` | Deep spec-drafting plugin not needed with pre-specified `Ra_soat` & `PROMPT` |
| 17 | `planning-with-files` | `0fa6c79` | https://github.com/OthmanAdi/planning-with-files.git | MIT | yes | `selected (pattern)` | File-backed plan, decisions, coverage CSV, and handoff logs in `docs/upgrade/` |
| 18 | `ECC` | `b38be6a` | https://github.com/affaan-m/ECC.git | MIT | yes | `skipped` | External harness hooks skipped per §B.10 / §M |
| 19 | `ui-ux-pro-max-skill` | `713eef5` | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git | MIT | no | `skipped` | Superseded by mandatory `AGENTS.md §5` warm-paper editorial design system |
| 20 | `impeccable` | `9fadc41` | https://github.com/pbakaus/impeccable.git | Apache-2.0 | no | `skipped` | Respecting `AGENTS.md §5–6` UI constraints and frozen `ui-kit`/`ui-components` |
| 21 | `diagram-design` | `e3cc4df` | https://github.com/cathrynlavery/diagram-design.git | MIT | yes | `selected (guideline)` | Clean as-is Mermaid & text architecture diagrams in `docs/` without shadow clutter |
| 22 | `taste-skill` | `12af471` | https://github.com/Leonxlnx/taste-skill.git | MIT | yes | `skipped` | Conflicts with non-marketing editorial UI rules in `AGENTS.md §5` |
| 23 | `hallmark` | `52328cb` | https://github.com/Nutlope/hallmark.git | MIT | yes | `skipped` | UI design skill skipped in favor of `AGENTS.md §5` |
| 24 | `vibe-kanban` | `08064e0` | https://github.com/BloopAI/vibe-kanban.git | Apache-2.0 | no | `skipped` | Task tracking unified inside `docs/upgrade/{plan.md,coverage.csv}` |
| 25 | `agent-desktop` | `93ae89e` | https://github.com/vercel-labs/agent-desktop.git | MIT | yes | `skipped` | Desktop GUI automation not applicable per `AGENTS.md §1` |
| 26 | `gstack` | `ade35bc` | https://github.com/garrytan/gstack.git | MIT | yes | `skipped` | QA checklist driven directly by `PROMPT §I` and CI workflows |
| 27 | `multica` | `7a12304` | https://github.com/multica-ai/multica.git | Multica License | no | `skipped` | Single-agent atomic edits in repository faster than multi-agent orchestration |
| 28 | `rea` | `6be6596` | https://github.com/morluto/rea.git | MIT | no | `skipped` | Not required for static/CI codebase remediation |
| 29 | `ponytail` | `96608e0` | https://github.com/DietrichGebert/ponytail.git | MIT | yes | `skipped` | Direct Python scripts in `scripts/` handle static verification cleanly |
| 30 | `security-audit-skill` | `c1c8a8c` | https://github.com/cloudflare/security-audit-skill.git | MIT | yes | `selected (active)` | Applied `SKILL.md` + `AI-AND-LLM.md` audit methodology for RBAC, IDOR, SSRF, RLS, CSV/SQLi, LLM prompt injection |
| 31 | `caveman` | `2e068f7` | https://github.com/JuliusBrussee/caveman.git | MIT | yes | `skipped` | Full technical clarity and Vietnamese documentation required over terse style |
| 32 | `humanizer` | `0ef9fe5` | https://github.com/blader/humanizer.git | MIT | yes | `selected (active)` | Applied prose de-AI cleanup rules to `docs/*` and Vietnamese portal UX copy (`C:\Users\asus\.gemini\config\skills\humanizer\SKILL.md`) |
