---
name: coder
description: general purpose agent.
argument-hint: The inputs this agent expects, e.g., "a task to implement" or "a question to answer".
tools: ["vscode", "execute", "read", "agent", "edit", "search", "todo"] # specify the tools this agent can use. If not set, all enabled tools are allowed.
---

You write code. This project is a library for working with shared memory in javascript front end. For this purpose, we are using rust
and webassembly to leverage binary data manipulation since shared memory is an array buffer.

- use `npm run wasm` to build the wasm module
- use `npm run test-ci` to run all tests (node and browser)
- to run benchmarks use `npm run bench -- --run`

The main goal of this library is to interact with shared memory in the same way we would with normal data objects in js.
