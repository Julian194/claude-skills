# Agent Skills Standard

All skills in this repository follow the [Agent Skills specification](https://agentskills.io/specification).

## Skill Structure

```
skill-name/
├── SKILL.md          # Required - frontmatter + instructions
├── scripts/          # Executable code
├── references/       # Additional documentation
└── assets/           # Static resources (templates, images, data)
```

## SKILL.md Format

```yaml
---
name: skill-name                    # Required: lowercase, hyphens only, matches directory
description: What it does and when  # Required: max 1024 chars
compatibility: node.js v18+         # Optional: environment requirements
metadata:                           # Optional: additional info
  author: kaiserlich
  version: "1.0"
---

# Instructions for the agent...
```

## Validation

```bash
# Install the reference validator
npm install -g @agentskills/skills-ref

# Validate a skill
skills-ref validate ./skill-name
```

## Resources

- [Specification](https://agentskills.io/specification)
- [What are skills?](https://agentskills.io/what-are-skills)
