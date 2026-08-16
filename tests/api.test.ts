import { describe, expect, it } from "vitest"

import { createApp } from "../src/app.js"

async function readJson(response: Response): Promise<unknown> {
  return response.json()
}

describe("MATIS API", () => {
  it("creates a project and decomposes the initial idea into seed tasks", async () => {
    // Given
    const app = createApp()

    // When
    const response = await app.request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Demo SaaS",
        idea: "Build login, dashboard, tests, and deployment workflow",
      }),
    })

    // Then
    expect(response.status).toBe(201)
    const body = await readJson(response)
    expect(body).toMatchObject({
      name: "Demo SaaS",
      status: "planning",
    })
    expect(readTask(body, 0)).toMatchObject({ title: "Clarify requirements", status: "done" })
    expect(readTask(body, 1)).toMatchObject({
      title: "Design backend foundation",
      status: "pending",
    })
  })

  it("blocks a task run until dependencies are done", async () => {
    // Given
    const app = createApp()
    const created = await app.request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Blocked Demo", idea: "Build auth" }),
    })
    const project = await readJson(created)
    const projectId = readProjectId(project)
    const taskId = readTaskId(project, 1)

    // When
    const response = await app.request(`/api/projects/${projectId}/tasks/${taskId}/start`, {
      method: "POST",
    })

    // Then
    expect(response.status).toBe(409)
    expect(await readJson(response)).toMatchObject({
      code: "dependency_blocked",
    })
  })

  it("completes a task and stores handoff without leaking secret values", async () => {
    // Given
    const app = createApp()
    const created = await app.request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Handoff Demo", idea: "Build orchestration" }),
    })
    const project = await readJson(created)
    const projectId = readProjectId(project)
    const firstTaskId = readTaskId(project, 0)
    await app.request(`/api/projects/${projectId}/tasks/${firstTaskId}/start`, { method: "POST" })

    // When
    const response = await app.request(`/api/projects/${projectId}/tasks/${firstTaskId}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        summary: "Implemented the intake slice",
        changedFiles: ["src/app.ts"],
        tests: "vitest passed",
        remainingIssues: "none",
        nextSteps: "Start backend foundation",
      }),
    })
    const secretResponse = await app.request(`/api/projects/${projectId}/secret-requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId: "codex",
        keyName: "OPENAI_API_KEY",
        reason: "Need model access",
        targetFile: ".env.local",
      }),
    })

    // Then
    expect(response.status).toBe(200)
    expect(await readJson(response)).toMatchObject({
      status: "done",
      handoff: {
        summary: "Implemented the intake slice",
        changedFiles: ["src/app.ts"],
      },
    })
    expect(JSON.stringify(await readJson(secretResponse))).not.toContain("sk-")
  })

  it("updates project state and returns new agent instructions from progress events", async () => {
    // Given
    const app = createApp()
    const created = await app.request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Event Demo", idea: "Coordinate backend agents" }),
    })
    const project = await readJson(created)
    const projectId = readProjectId(project)
    const taskId = readTaskId(project, 2)

    // When
    const response = await app.request(`/api/projects/${projectId}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId: "backend-agent",
        type: "task_progress",
        summary: "Started execution backend selection",
        taskId,
        taskStatus: "running",
      }),
    })

    // Then
    expect(response.status).toBe(201)
    expect(await readJson(response)).toMatchObject({
      decision: {
        action: "update_task",
        updatedTaskId: taskId,
      },
      instructions: "Continue the current task and report the next material change.",
      project: {
        events: [{ type: "task_progress", agentId: "backend-agent" }],
      },
    })
  })

  it("creates a follow-up task and instruction when an agent reports a blocker", async () => {
    // Given
    const app = createApp()
    const created = await app.request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Blocked Event Demo", idea: "Coordinate blockers" }),
    })
    const project = await readJson(created)
    const projectId = readProjectId(project)
    const beforeCount = readTasks(project).length

    // When
    const response = await app.request(`/api/projects/${projectId}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId: "codex",
        type: "blocked",
        summary: "JWT middleware contract changed and tests need new fixtures",
      }),
    })
    const body = await readJson(response)

    // Then
    expect(response.status).toBe(201)
    expect(body).toMatchObject({
      decision: {
        action: "create_task",
        reason: "Agent reported a blocker that needs separate resolution.",
      },
      instructions: "Pause the blocked path and switch to the newly created unblock task.",
    })
    expect(readProjectTasks(body).length).toBe(beforeCount + 1)
  })
})

function readProjectId(value: unknown): string {
  if (isRecord(value) && typeof value["id"] === "string") {
    return value["id"]
  }
  throw new Error("missing project id")
}

function readTaskId(value: unknown, index: number): string {
  const task = readTask(value, index)
  if (typeof task["id"] === "string") {
    return task["id"]
  }
  throw new Error("missing task id")
}

function readTask(value: unknown, index: number): Record<string, unknown> {
  const task = readTasks(value)[index]
  if (isRecord(task)) {
    return task
  }
  throw new Error("missing task")
}

function readTasks(value: unknown): readonly unknown[] {
  if (!isRecord(value) || !Array.isArray(value["tasks"])) {
    throw new Error("missing tasks")
  }
  return value["tasks"]
}

function readProjectTasks(value: unknown): readonly unknown[] {
  if (!isRecord(value) || !isRecord(value["project"])) {
    throw new Error("missing project")
  }
  return readTasks(value["project"])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
