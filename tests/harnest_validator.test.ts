import { describe, expect, it } from "vitest"

import { createApp } from "../src/app.js"

async function readJson(response: Response): Promise<unknown> {
  return response.json()
}

describe("Harnest v0.4 Validator API", () => {
  it("accepts a valid component and connection graph", async () => {
    // Given
    const app = createApp()

    // When
    const response = await app.request("/api/harnest-specs/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        version: "0.1",
        components: {
          model: { type: "model", provider: "openai", model: "gpt-5" },
          prompt: { type: "prompt", template: "Answer with citations." },
          agent: { type: "agent" },
          answer: { type: "output", schema: { type: "object" } },
        },
        connections: [
          {
            from: { component: "model", port: "output" },
            to: { component: "agent", port: "model" },
          },
          {
            from: { component: "prompt", port: "output" },
            to: { component: "agent", port: "prompt" },
          },
          {
            from: { component: "agent", port: "output" },
            to: { component: "answer", port: "input" },
          },
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
        componentCount: 4,
        connectionCount: 3,
        startComponentIds: ["model", "prompt"],
        terminalComponentIds: ["answer"],
      },
    })
  })

  it("rejects missing components and invalid typed ports", async () => {
    // Given
    const app = createApp()

    // When
    const response = await app.request("/api/harnest-specs/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        version: "0.1",
        components: {
          agent: { type: "agent" },
          answer: { type: "output", schema: { type: "object" } },
        },
        connections: [
          {
            from: { component: "missingModel", port: "output" },
            to: { component: "agent", port: "model" },
          },
          {
            from: { component: "agent", port: "model" },
            to: { component: "answer", port: "input" },
          },
        ],
      }),
    })

    // Then
    expect(response.status).toBe(200)
    expect(await readJson(response)).toMatchObject({
      valid: false,
      errors: [
        {
          code: "missing_connection_source",
          path: "connections[0].from.component",
        },
        {
          code: "invalid_source_port",
          path: "connections[1].from.port",
        },
      ],
    })
  })
})
