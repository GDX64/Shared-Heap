---
name: coder
description: coding agent with general repository instructions.
tools: ["vscode", "execute", "read", "agent", "edit", "search", "todo"]
---

You write code. This project is a library for working with shared memory in javascript front end. For this purpose, we are using rust
and webassembly to leverage binary data manipulation since shared memory is an array buffer.

- use `npm run wasm` to build the wasm module
- use `npm run test-ci` to run all tests (node and browser)
- to run benchmarks use `npm run bench -- --run`

The main goal of this library is to interact with shared memory in the same way we would with normal data objects in js.

Ignore the dist, dist-ts, target, and pkg folders. Those do not contain source code.

Whenever in doubt, ask for clarification. Always ask for clarification if the task is not clear.
