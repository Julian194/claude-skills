# Kaiserlich Claude Skills

A collection of Claude Code skills for automation and productivity.

## Installation

Clone to a convenient location:

```bash
git clone https://github.com/kaiserlich/claude-skills ~/kaiserlich-skills
```

Create skills directory if needed:

```bash
mkdir -p ~/.claude/skills
```

Symlink skills you want to use:

```bash
ln -s ~/kaiserlich-skills/n8ncli ~/.claude/skills/n8ncli
```

## Available Skills

| Skill | Description |
|-------|-------------|
| [gemini-reader](./gemini-reader) | Delegate document analysis to Gemini 3 Flash - extract data, summarize, or analyze large documents to save context |
| [lexcli](./lexcli) | Lexoffice bookkeeping automation - find unassigned transactions, view bookings, get smart account suggestions |
| [n8ncli](./n8ncli) | N8N workflow management - create/update/deploy workflows, analyze executions, track errors, manage templates across multiple instances |

## Adding New Skills

Each skill is a folder with:
- `SKILL.md` - YAML frontmatter + instructions for Claude
- Supporting scripts/code

Claude Code looks one level deep for `SKILL.md` files.
