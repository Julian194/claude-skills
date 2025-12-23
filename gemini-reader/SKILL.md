---
name: gemini-reader
description: Read and analyze documents using Gemini 3 Flash. Use when you need to extract data, summarize, or analyze large documents (PDFs, text files, etc.) to save context. Delegates document processing to Gemini's 1M token context window.
compatibility: Requires gemini-cli (npm install -g @google/gemini-cli)
metadata:
  author: kaiserlich
  version: "1.0"
---

# Gemini Document Reader

Delegate document reading and analysis to Gemini 3 Flash to save Claude context. Useful for:
- Extracting specific data from large documents
- Summarizing lengthy PDFs or text files
- Analyzing documents that would consume too much context

## Usage

### Basic document analysis (via stdin)
```bash
cat "<file_path>" | gemini "<your_prompt>"
```

### For files anywhere under ~/ (using @ syntax)
```bash
gemini "<your_prompt> @<file_path>"
```

**Note:** The `@` syntax works for any file under your home directory (`~/`), including subdirectories like `~/Downloads`, `~/Documents`, `~/code`, etc. For files outside your home directory (e.g., `/tmp`, `/var`), use the stdin approach instead.

### Examples

**Extract key data from a PDF:**
```bash
cat ~/Documents/contract.pdf | gemini "Extract all dates, monetary amounts, and party names from this contract. Return as JSON."
```

**Summarize a long document:**
```bash
cat ~/Downloads/report.pdf | gemini "Provide a concise executive summary of this document in 3-5 bullet points."
```

**Answer questions about a document:**
```bash
cat ~/code/project/README.md | gemini "What are the main dependencies and how do I set up this project?"
```

**Analyze with @ syntax (home dir files only):**
```bash
gemini "What are the key findings? @~/Documents/research.pdf"
```

## Model

Uses `gemini-3-flash-preview` by default (configured in `~/.gemini/settings.json`).

To use a different model:
```bash
cat "<file_path>" | gemini --model gemini-2.5-pro "<your_prompt>"
```

## Output Formats

Request structured output in your prompt:
- `"Return as JSON"` - for structured data extraction
- `"Return as markdown"` - for formatted text
- `"Return as a bullet list"` - for summaries

## When to Use

Use this skill when:
- Document is large and would consume significant Claude context
- You need to extract specific data from a document
- You want to summarize before deciding what to focus on
- Processing multiple documents in sequence

## Limitations

- Files outside `~/` must use stdin (cat | gemini)
- Binary files (images, audio) should use the @ syntax with files in ~/
- Very large outputs may need `--output-format json` for parsing
