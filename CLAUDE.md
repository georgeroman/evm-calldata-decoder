# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EVM Calldata Decoder is a vanilla JavaScript web application for decoding Ethereum calldata using the 4byte.directory API. The live app is at https://calldata.georgeroman.dev.

## Development

**No build tools required** - this is a static website with vanilla HTML, CSS, and JavaScript.

To develop locally, serve the `src/` directory with any static file server:
```bash
python3 -m http.server 8000 -d src
# or
npx serve src
```

Deployment happens automatically via GitHub Actions on push to main (SSH-based SCP to server).

## Architecture

The entire application is three files in `src/`:

- **index.html** - Page structure with input textarea, output sections (placeholder/result/error/loading states)
- **script.js** - Core logic (~580 lines):
  - `decode()` - Main entry point: validates input, extracts 4-byte selector, fetches signatures, displays results
  - `fetchSignatures(selector)` - Queries 4byte.directory API
  - `decodeParams(types, data)` / `decodeParam(type, data, offset, baseOffset)` - Recursive ABI decoder supporting all Solidity types including nested tuples and arrays
  - `isDynamicType(type)` / `getStaticSize(type)` - ABI encoding helpers for dynamic vs static type handling
  - Display functions for rendering decoded parameters with collapsible complex types
- **style.css** - Dark theme styling with CSS variables (`--bg-primary`, `--accent`, etc.)

## Key Technical Details

- Implements full Solidity ABI encoding spec (dynamic types use offset pointers, static types inline)
- Handles: address, bool, uint*/int* (with two's complement), bytes*, string, fixed/dynamic arrays, tuples (structs), arbitrary nesting
- No external dependencies - pure browser JavaScript
- XSS protection via `escapeHtml()` for all user-provided data
