// ─────────────────────────────────────────────────────────────────────────────
// src/components/ui — the shared dashboard primitives.
//
// WHY THIS FOLDER EXISTS. There are three dashboards (Client, Contractor,
// Admin) and until now they shared nothing but a copy-pasted `.ffdash` style
// block. Every row, button, pill and card was re-derived in each file, so a
// change to "how a row looks" was three edits in three ~200KB files, and the
// three copies had already drifted. These primitives are the single
// implementation. Porting Contractor and Admin onto them is the payoff.
//
// WHAT BELONGS HERE. A thing that looks the same on all three dashboards and
// carries no business logic. Anything that knows about jobs, money or roles
// belongs in a page or a feature component — a primitive that knows what
// `fully_funded` means is not a primitive.
//
// WHAT DOES NOT BELONG HERE. Framer Motion. Only Home.tsx, ClientSuccess.tsx
// and ContractorSuccess.tsx import it and CLAUDE.md requires that stay true;
// the motion in this folder is CSS transitions and keyframes, which is all a
// dashboard needs and costs nothing in bundle size.
//
// THE RULES THE SET ENCODES, in one place so they survive the next session:
//   · The pass answers "is this on me or on them" before anything scrolls.
//   · Orange appears exactly once per screen, and only when the answer is you.
//   · Every value comes from the --ff-* tokens in main.tsx. No literals.
//   · One --ff-gut, shared by a row's icon column and its separator, so a
//     hairline can never disagree with the column above it.
// ─────────────────────────────────────────────────────────────────────────────

export { ensureUiStyles, cx } from "./uiStyles";
export { Mark } from "./Mark";
export { Pass, PassTop, IconButton } from "./Pass";
export { StateLine, type State } from "./StateLine";
export { Hero, HeroSub, PassMeta, PassMetaItem } from "./Hero";
export { JobSwitcher, type SwitcherJob } from "./JobSwitcher";
export { Group, Sheet, Row, type RowTone } from "./Sheet";
export { Stepper, type Step, type StepState } from "./Stepper";
export { Pill, type PillTone } from "./Pill";
export { Button, ButtonRow, Stack } from "./Button";
export { AttentionCard, TrustLine } from "./AttentionCard";
