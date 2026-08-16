import { describe, expect, it } from "vitest"

import { createApp } from "../src/app.js"

async function readJson(response: Response): Promise<unknown> {
  return response.json()
}

describe("MATIS Integration Agent API", () => {
  it("creates an auto integration candidate for low-risk changes", async () => {
    // Given
    const app = createApp()
    const created = await app.request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Integration Demo", idea: "Merge safe docs changes" }),
    })
    const project = await readJson(created)
    const projectId = readProjectId(project)

    // When
    const response = await app.request(`/api/projects/${projectId}/integrations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceAgentIds: ["docs-agent"],
        summary: "Update README usage notes",
        changedFiles: ["README.md"],
        apiChanged: false,
        schemaChanged: false,
        testsPassed: true,
        conflicts: [],
      }),
    })

    // Then
    expect(response.status).toBe(201)
    expect(await readJson(response)).toMatchObject({
      action: "auto_integrate",
      risk: "low",
      approvalRequired: false,
      instructions: "Integration candidate is safe to apply automatically.",
    })
  })

  it("requires human approval when integration changes contracts or has conflicts", async () => {
    // Given
    const app = createApp()
    const created = await app.request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Risk Demo", idea: "Merge backend and frontend work" }),
    })
    const project = await readJson(created)
    const projectId = readProjectId(project)

    // When
    const response = await app.request(`/api/projects/${projectId}/integrations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceAgentIds: ["backend-agent", "frontend-agent"],
        summary: "Change auth API response and login form",
        changedFiles: ["src/api/auth.ts", "src/app/login.tsx"],
        apiChanged: true,
        schemaChanged: true,
        testsPassed: false,
        conflicts: ["src/api/auth.ts"],
      }),
    })
    const body = await readJson(response)

    // Then
    expect(response.status).toBe(201)
    expect(body).toMatchObject({
      action: "human_approval",
      risk: "high",
      approvalRequired: true,
      instructions: "Request human approval before applying this integration candidate.",
    })
    expect(readIntegrationAnalyses(body).length).toBe(1)
  })
})

function readProjectId(value: unknown): string {
  if (isRecord(value) && typeof value["id"] === "string") {
    return value["id"]
  }
  throw new Error("missing project id")
}

function readIntegrationAnalyses(value: unknown): readonly unknown[] {
  if (!isRecord(value) || !isRecord(value["project"])) {
    throw new Error("missing project")
  }
  const project = value["project"]
  if (!Array.isArray(project["integrationAnalyses"])) {
    throw new Error("missing integration analyses")
  }
  return project["integrationAnalyses"]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
