import { describe, expect, it } from "vitest"

import { createApp } from "../src/app.js"

async function readJson(response: Response): Promise<unknown> {
  return response.json()
}

describe("MATIS Project Analyzer API", () => {
  it("detects framework, package manager, commands, and project structures", async () => {
    // Given
    const app = createApp()
    const created = await app.request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Analyzer Demo", idea: "Analyze a Next.js app" }),
    })
    const project = await readJson(created)
    const projectId = readProjectId(project)

    // When
    const response = await app.request(`/api/projects/${projectId}/analysis`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        files: [
          "package.json",
          "pnpm-lock.yaml",
          "src/app/api/auth/route.ts",
          "src/app/page.tsx",
          "src/lib/db.ts",
          "src/db/schema.ts",
          "tests/auth.test.ts",
        ],
        packageJson: {
          scripts: {
            build: "next build",
            test: "vitest run",
            dev: "next dev",
          },
          dependencies: {
            next: "16.0.0",
            drizzle: "latest",
          },
          devDependencies: {
            vitest: "latest",
          },
        },
      }),
    })

    // Then
    expect(response.status).toBe(201)
    expect(await readJson(response)).toMatchObject({
      framework: "nextjs",
      packageManager: "pnpm",
      commands: {
        build: "next build",
        test: "vitest run",
        dev: "next dev",
      },
      structures: {
        api: true,
        database: true,
        tests: true,
      },
      confidence: "high",
    })
  })

  it("falls back to unknown values for sparse projects", async () => {
    // Given
    const app = createApp()
    const created = await app.request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Sparse Demo", idea: "Analyze a tiny project" }),
    })
    const project = await readJson(created)
    const projectId = readProjectId(project)

    // When
    const response = await app.request(`/api/projects/${projectId}/analysis`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ files: ["README.md"] }),
    })

    // Then
    expect(response.status).toBe(201)
    expect(await readJson(response)).toMatchObject({
      framework: "unknown",
      packageManager: "unknown",
      commands: {},
      confidence: "low",
    })
  })
})

function readProjectId(value: unknown): string {
  if (isRecord(value) && typeof value["id"] === "string") {
    return value["id"]
  }
  throw new Error("missing project id")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
