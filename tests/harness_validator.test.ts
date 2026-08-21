import { describe, expect, it } from "vitest"

import { createApp } from "../src/app.js"

async function readJson(response: Response): Promise<unknown> {
  return response.json()
}

describe("MATIS HarnessSpec Validator API", () => {
  it("accepts a valid sequential harness spec", async () => {
    // Given
    const app = createApp()

    // When
    const response = await app.request("/api/harness-specs/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        version: "0.1",
        nodes: {
          input: { type: "input" },
          planner: { type: "agent", model: "openai/gpt-5", prompt: "./prompts/planner.md" },
          test: { type: "command", run: "pnpm test" },
          output: { type: "output" },
        },
        edges: [
          { from: "input", to: "planner" },
          { from: "planner", to: "test" },
          { from: "test", to: "output", when: "passed" },
        ],
      }),
    })

    // Then
    expect(response.status).toBe(200)
    expect(await readJson(response)).toMatchObject({
      valid: true,
      errors: [],
      warnings: [],
      summary: {
        nodeCount: 4,
        edgeCount: 3,
        startNodeIds: ["input"],
        terminalNodeIds: ["output"],
      },
    })
  })

  it("rejects a harness spec with a missing edge target before execution", async () => {
    // Given
    const app = createApp()

    // When
    const response = await app.request("/api/harness-specs/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        version: "0.1",
        nodes: {
          planner: { type: "agent", model: "openai/gpt-5", prompt: "./prompts/planner.md" },
          output: { type: "output" },
        },
        edges: [
          { from: "planner", to: "developer" },
          { from: "developer", to: "output" },
        ],
      }),
    })

    // Then
    expect(response.status).toBe(200)
    expect(await readJson(response)).toMatchObject({
      valid: false,
      errors: [
        {
          code: "missing_edge_target",
          path: "edges[0].to",
          message: 'Edge target "developer" does not exist.',
        },
        {
          code: "missing_edge_source",
          path: "edges[1].from",
          message: 'Edge source "developer" does not exist.',
        },
      ],
    })
  })
})
