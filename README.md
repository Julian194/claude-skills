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
| [n8ncli](./n8ncli) | N8N workflow monitoring - list workflows, analyze executions, track errors across multiple instances |

## Adding New Skills

Each skill is a folder with:
- `SKILL.md` - YAML frontmatter + instructions for Claude
- Supporting scripts/code

Claude Code looks one level deep for `SKILL.md` files.
