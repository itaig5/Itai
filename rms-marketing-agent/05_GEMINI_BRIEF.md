# Gemini Briefing & Task Pack

**Purpose:** everything to point Gemini at this project — a reusable "Gem" persona, a learning curriculum, ready-to-run Deep Research prompts, and the Claude↔Gemini handoff protocol. Copy-paste the blocks as marked.

> **Note:** Claude cannot call Gemini directly (no connector in the build session). The bridge is this doc + the shared Drive folder / GitHub repo. You paste; Gemini reads.

---

## A. Create a Gemini "Gem" (paste as the Gem's instructions)

```
You are my "RMS Research Analyst" for a startup I'm building.

THE PRODUCT: a hybrid Revenue Management System (RMS) for short-term rentals
and small hotels, whose differentiator is an automated "marketing assistant."
The marketing assistant is the ACTION LAYER on top of an RMS brain: it turns
RMS findings (pace, pickup, occupancy vs. target, revenue vs. budget, comp
position) into concrete marketing moves — which OTA promotion/discount to run,
on which channel, at what depth — and executes them.

KEY DECISIONS (treat as fixed):
- The RMS is an ENGINE, not a product I sell. Keep it "good enough," don't
  compete with PriceLabs/Duetto on price optimization.
- My target customers are MANUAL-FIRST (they don't use an RMS today). I am
  their first RMS.
- v1 uses explainable RULES over pace/occupancy/targets; ML forecasting comes
  later (I capture the data now).
- I build solo with AI help, so favor lean, buy-vs-build, managed services.
- Integration path: build on Guesty's API first (it's the only channel manager
  that exposes OTA promotions via API), Hostaway second.
- Legal guardrail: pricing/promo recommendations stay ADVISORY and use PUBLIC/
  market data only — never pool confidential competitor pricing.

HOW TO HELP: When I ask you to research or explain, be concrete, cite sources
(prefer 2024-2026, official docs), flag uncertainty explicitly, and give me
structured, skimmable output. When I ask you to teach, build understanding from
first principles with worked examples. Assume I'm technical but new to hotel
revenue management.
```

---

## B. Learning curriculum (your Week-1 study path with Gemini + NotebookLM)

Study in this order — each maps to something you'll need to build the mini-RMS:

1. **Revenue management fundamentals** — RevPAR, ADR, occupancy, RevPAN (for rentals), booking pace, pickup, lead time, STLY (same-time-last-year). *Why: these are the mini-RMS signals.*
2. **Demand & pace analysis** — how "pace" and "pickup" are measured; on-the-books (OTB) vs. forecast; the booking curve. *Why: this is the core of your engine.*
3. **Pricing strategy** — length-of-stay pricing, booking-window pricing (early-bird/last-minute), comp-set analysis, price elasticity. *Why: the rules that turn signals into moves.*
4. **OTA mechanics** — how Booking.com Genius/deals, Airbnb discounts/ranking, Expedia promotions affect visibility and conversion. *Why: what the marketing layer actually pulls.*
5. **RMS landscape** — how PriceLabs/Beyond/Wheelhouse/Duetto work and what they do/don't expose. *Why: positioning + the InsightsProvider question.*

---

## C. Deep Research tasks (paste each into Gemini → Deep Research)

### Task 1 — Learn the domain (do this first)
```
Teach me the fundamentals of hotel & short-term-rental revenue management that
I need to design pricing and promotion logic. Cover: RevPAR, ADR, occupancy,
RevPAN; booking pace, pickup, on-the-books vs. forecast, the booking curve,
lead time, STLY; length-of-stay and booking-window pricing; comp-set analysis
and price elasticity. Produce a structured, beginner-to-intermediate learning
guide with worked numerical examples and cited sources (2024-2026 where
possible). End with a glossary.
```

### Task 2 — THE critical verification (highest priority)
```
I'm building a "marketing assistant" that turns RMS insights into OTA promotion
actions. It can either use my own mini-RMS or connect to a customer's existing
RMS. For that second option to work, existing RMS platforms would need to expose
their INSIGHTS via API — not just push a price.

Research precisely: for PriceLabs, Beyond, Wheelhouse, and Duetto — does each
one expose, via a public/partner API, any of: demand forecast, occupancy/pace,
pickup, recommended price with reasoning, or market/comp data? Or does the API
only PUSH a final price to a PMS/channel manager? For each vendor, give: what
their API actually exposes (endpoints/objects), whether "insights" are readable,
access/approval model, and source URLs. Flag uncertainty. Conclude with a clear
verdict: is "connect to an external RMS to reuse its insights" technically
viable today, and for which vendors?
```

### Task 3 — Replicate pace/pickup methodology (so I can build it)
```
Explain, in enough detail to implement in code, how revenue management systems
compute booking PACE and PICKUP and compare them to STLY (same time last year).
Include: the exact definitions, what data is needed (reservation timestamps,
daily on-the-books snapshots), how to build a "booking curve," how to detect
"ahead/behind pace," and common pitfalls. Give formulas and a worked example
with sample numbers. Cite sources.
```

### Task 4 — Competitor teardown of the marketing angle
```
Has any RMS, channel manager, or hospitality tool shipped automated CROSS-
CHANNEL OTA PROMOTION management (detecting, recommending, and executing
promotions across Booking.com/Airbnb/Expedia based on revenue signals)? Survey
PriceLabs, Beyond, Wheelhouse, Guesty, Hostaway, Duetto, and any startup in this
space (2024-2026). For each: do they do promotions at all, and is it automated
or manual? Identify the genuine white space and any direct competitor to a
"marketing assistant on top of an RMS." Cite sources.
```

---

## D. NotebookLM setup (for durable learning + Q&A)

1. notebooklm.google.com → New notebook.
2. Add sources: the 4 project docs (from Drive), Gemini's Task 1 output, plus 3-5 primer URLs (PriceLabs blog, a revenue-management 101 article, Booking.com partner help on promotions).
3. Generate an **Audio Overview** (a ~10-min podcast that teaches the space).
4. Use it for cited Q&A ("Explain pace vs pickup", "How does Genius affect ranking?").

---

## E. Claude ↔ Gemini handoff protocol

1. **Gemini** runs a research/learning task → **export the result** to the shared Drive folder (or paste it back to me / drop it in the repo).
2. Tell **Claude**: *"read the new Gemini output"* (paste it, or point me at the repo file) → Claude turns it into specs/code/decisions → writes back to the repo.
3. Repeat. The repo (reliable) or the Drive folder (when the connector is stable) is the shared memory.

**Output format to request from Gemini** (so Claude ingests cleanly): ask Gemini to end every research task with a short **"Key facts (bulleted, with source URLs)"** section and a **"Open questions"** section. That's the part Claude acts on.

---

## F. Deeper-learning tasks — algorithms, prompts, skills, agents (round 2)

Run these in your Gem with Deep Research. Claude is researching the same topics in parallel; compare notes.

### Task 5 — Learn the best pricing / revenue-management algorithms
```
Teach me the best algorithms for dynamic pricing and revenue management in
hotels and short-term rentals, from simple to advanced, for a solo founder
building rules-first then ML. Cover: pace/occupancy-trigger rules, orphan-gap
and length-of-stay logic, booking-curve/pickup forecasting, unconstrained
demand, price elasticity and expected-revenue maximization, and advanced
methods (reinforcement learning, contextual bandits, MDP) with an honest note
on whether they're worth it at small scale. For each: what it is, the math,
data needed, complexity, and when to use it. Recommend a concrete v1 (rules)
and v2 (ML) algorithm stack. Cite sources; end with Key facts + Open questions.
```

### Task 6 — Learn the best LLM prompt & agent patterns for an analytical pricing agent
```
Teach me the best prompt-engineering patterns and agent architectures for an
AI assistant that reasons over revenue metrics (pace, occupancy, comp position)
and recommends/executes OTA promotions. Cover: agent patterns (ReAct, planner-
executor, reflection/critique, multi-agent, human-in-the-loop); prompting for
numeric/analytical reasoning (structured JSON output, grounding the model in
computed metrics so it never invents numbers, self-consistency, LLM-as-judge);
tool/function design and MCP tool best practices; and guardrails (advisory-only,
no fabrication, uncertainty reporting, audit-friendly output). Prefer
Anthropic/Claude guidance (this project uses Claude). Give concrete adaptable
examples. Cite sources; end with Key facts + Open questions.
```

### Task 7 — Survey the best existing skills, agents, MCP servers, and tools
```
Survey the best existing tools for building a hospitality revenue-management +
OTA-promotion automation product (2024-2026): MCP servers in hospitality/pricing
(Beyond, PriceLabs "Revenue Management Skill Tree", Apaleo, Agentic Hospitality),
reusable Claude/agent skills, open-source RMS/dynamic-pricing GitHub projects,
useful libraries (forecasting: Prophet, Nixtla, Darts, sktime; optimization:
OR-Tools, PuLP), channel-manager SDKs (Guesty, Hostaway), public hospitality
demand/pricing datasets, and agent frameworks (LangGraph, Anthropic Agent SDK).
For each: what it does, link, maturity, and how to use/adapt it. Flag directly
reusable vs. instructive. End with a shortlist of top picks, Key facts + Open
questions.
```

