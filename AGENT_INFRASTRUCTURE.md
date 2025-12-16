# Agent Infrastructure for CodeMap

This document describes the Claude Code subagent infrastructure for executing CodeMap development tasks efficiently and cost-effectively.

## Overview

CodeMap uses a **dual-model strategy**:

1. **Sonnet** (main agent) - Planning, architecture decisions, complex reasoning
2. **Haiku** (executor agent) - Subtask implementation, routine coding, testing

This approach optimizes for both quality and cost:
- Sonnet handles high-level decisions that benefit from deeper reasoning
- Haiku executes well-defined subtasks at 3x lower cost and 2x faster speed

## Subagent: codemap-executor

**Location:** `.claude/agents/codemap-executor.md`

**Purpose:** Execute subtasks from DEVELOPMENT_PLAN.md with precision

**Model:** Claude Haiku 4.5

**Tools:** Read, Write, Edit, Bash, Glob, Grep, MultiEdit

### When It's Invoked

The executor agent is automatically invoked when:
- Working on numbered subtasks (X.Y.Z format)
- Asked to "implement", "build", or "code" features from the development plan
- Executing routine development tasks

### How to Use It

**Automatic invocation** (recommended):
```
Please implement subtask 1.2.1 from the development plan.
```

**Explicit invocation:**
```
Use the codemap-executor agent to implement subtask 1.2.1.
```

### What It Does

1. Reads CLAUDE.md and DEVELOPMENT_PLAN.md for context
2. Locates the specific subtask
3. Verifies prerequisites are complete
4. Implements all deliverables with checkboxes
5. Writes comprehensive tests (80%+ coverage)
6. Runs quality checks (ruff, mypy, pytest)
7. Updates completion notes in DEVELOPMENT_PLAN.md
8. Creates semantic git commit

## Workflow

### Standard Development Session

```
You: Please implement subtask 0.1.1

[Sonnet delegates to codemap-executor]

codemap-executor:
1. Reads project context
2. Implements deliverables
3. Writes tests
4. Runs quality checks
5. Updates completion notes
6. Commits changes

[Returns to Sonnet]

Sonnet: Subtask 0.1.1 complete. Ready for 0.1.2?
```

### When to Use Sonnet Directly

Keep these tasks on the main Sonnet agent:
- Architecture decisions
- Complex debugging
- Code review and quality assessment
- Planning new features
- Reviewing and approving completion notes

### When to Use Haiku Executor

Delegate these tasks to the executor:
- Implementing well-defined subtasks
- Writing boilerplate code
- Creating test files
- Running routine checks
- Updating documentation

## Cost Optimization

| Task Type | Model | Cost |
|-----------|-------|------|
| Planning & Architecture | Sonnet | $3/$15 per MTok |
| Subtask Implementation | Haiku | $1/$5 per MTok |
| Code Review | Sonnet | $3/$15 per MTok |
| Testing & Checks | Haiku | $1/$5 per MTok |

By routing ~70% of implementation work to Haiku, you can reduce costs by ~50% while maintaining quality through the paint-by-numbers subtask structure.

## Adding More Agents

You can create additional specialized agents in `.claude/agents/`:

**Example: Test Runner Agent**
```markdown
---
name: codemap-tester
description: Run tests and analyze coverage for CodeMap
model: haiku
tools: Read, Bash, Glob, Grep
---

You are a testing specialist for the CodeMap project...
```

**Example: Documentation Agent**
```markdown
---
name: codemap-docs
description: Generate and update documentation for CodeMap
model: haiku
tools: Read, Write, Edit, Glob, Grep
---

You are a technical writer for the CodeMap project...
```

## File Locations

```
codemap/
├── .claude/
│   └── agents/
│       └── codemap-executor.md    # Main executor agent
├── CLAUDE.md                      # Project rules
├── DEVELOPMENT_PLAN.md            # Paint-by-numbers plan
├── PROJECT_BRIEF.md               # Requirements
└── AGENT_INFRASTRUCTURE.md        # This file
```

## Troubleshooting

### Agent Not Being Invoked

1. Ensure `.claude/agents/codemap-executor.md` exists
2. Check YAML frontmatter is valid
3. Verify the description matches your request

### Agent Using Wrong Model

1. Check the `model: haiku` field in frontmatter
2. Ensure no environment variable is overriding it

### Agent Missing Context

1. Ensure CLAUDE.md and DEVELOPMENT_PLAN.md are in project root
2. Agent should read these files at start of each task

## References

- [Claude Code Subagents Documentation](https://docs.anthropic.com/en/docs/claude-code/sub-agents)
- [Claude Code Agent SDK](https://docs.anthropic.com/en/docs/agent-sdk/subagents)
- [DevPlanBuilder Methodology](https://github.com/mmorris35/ClaudeCode-DevPlanBuilder)
