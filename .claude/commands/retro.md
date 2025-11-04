---
description: Analyze session to optimize prompts and reduce trial-and-error
---

# Retrospective: Session Optimization

Analyze this session to optimize future Claude Code behavior and reduce unnecessary trial-and-error.

## Analysis Scope
- Session conversation history
- Trial-and-error patterns
- Repeated clarifications
- Instructions that could be codified

## Target Documents (3-Layer Architecture)

### Layer 1: Always-loaded Context
- [CLAUDE.md](../../CLAUDE.md) - Default project instructions
- [.kiro/steering/*.md](../../.kiro/steering/) - Core steering docs (product, tech, structure, testing)

### Layer 2: On-demand References
- [.kiro/steering/references/*.md](../../.kiro/steering/references/) - Implementation patterns and best practices

### Layer 3: Feature-specific
- [.kiro/specs/[feature]/NOTES.md](../../.kiro/specs/) - Feature-specific learnings

## Process
1. **Identify improvement opportunities**:
   - Missing context that caused confusion
   - Repeated user corrections
   - Unclear/conflicting instructions
   - Workflow inefficiencies

2. **Categorize by context scope** (CRITICAL):
   - **Always-needed**: Core principles, project-wide rules → steering
   - **Situation-specific**: Implementation patterns, code examples → references
   - **Feature-specific**: Feature learnings → spec notes

3. **Evaluate reference extraction criteria**:
   - ✅ Prompt file becoming bloated (>500 lines)
   - ✅ Context not universally applicable (specific to certain tasks)
   - ✅ Detailed code examples or long patterns
   - ❌ Core project principles (keep in steering)
   - ❌ Short, universally-needed rules (keep in steering)

4. **Propose concrete changes**:
   - Show specific text additions/modifications
   - Highlight redundant/outdated content to remove
   - **Suggest reference extraction** when criteria met
   - Explain rationale briefly

5. **Get approval**: Present proposals and wait for user confirmation before editing

## Output Format
```markdown
## Proposed Changes

### Layer 1: Steering Updates (Always-loaded)

#### CLAUDE.md
**Add**: [new instruction - ultra-concise]
**Remove**: [redundant section]
**Reason**: [1 sentence]

#### .kiro/steering/tech.md
**Modify**: [existing section]
**From**: [old text]
**To**: [new text - ultra-concise]
**Reason**: [1 sentence]

### Layer 2: Reference Extraction (On-demand)

#### NEW: .kiro/steering/references/[pattern-name].md
**Content**: [brief description of pattern]
**Trigger**: [when to reference this - e.g., "エラーハンドリング実装時"]
**Reason**: [why extract - bloat/non-universal/detailed examples]
**Extracted from**: [source document if moving existing content]

### Layer 3: Spec Notes (Feature-specific)

#### .kiro/specs/[feature]/NOTES.md
**Add**: [feature-specific learning]
**Reason**: [1 sentence]
```

## Constraints
- **Be extremely concise** - optimize for token efficiency, not human readability
- **Remove aggressively** - delete outdated/unnecessary items
- **No fluff** - no changelog, diagrams, examples unless critical
- **No duplication** - consolidate overlapping instructions

## Reference Extraction Guidelines

### When to Extract to References

Create `.kiro/steering/references/[pattern-name].md` when:
- ✅ Steering file >500 lines
- ✅ Content only needed for specific tasks (not universally applicable)
- ✅ Detailed code examples/patterns (>50 lines)

Keep in steering when:
- ❌ Core principles (always needed)
- ❌ Short rules (<10 lines)
- ❌ Project-wide conventions

### Reference Linking Pattern

Always link directly from CLAUDE.md or steering files:
```markdown
[reference-name](.kiro/steering/references/pattern-name.md)
```

Never use intermediate README.md for navigation.

Execute analysis now.
