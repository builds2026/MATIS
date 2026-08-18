import type { Context } from "hono"
import { Hono } from "hono"
import { type ZodType, z } from "zod"

import {
  CompleteSecretRequestSchema,
  CompleteTaskSchema,
  CreateAgentEventSchema,
  CreateIntegrationAnalysisSchema,
  CreateProjectSchema,
  CreateSecretRequestSchema,
  CreateTaskSchema,
  type ProjectId,
  ProjectIdSchema,
  type SecretRequestId,
  SecretRequestIdSchema,
  type TaskId,
  TaskIdSchema,
} from "./domain.js"
import { DependencyBlockedError, NotFoundError } from "./errors.js"
import { Orchestrator } from "./orchestrator.js"
import { AnalyzeProjectSchema } from "./project_analyzer.js"
import { MemoryStore } from "./store.js"

type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ErrorResponse }

type ErrorResponse = {
  readonly code: string
  readonly message: string
}

export function createApp(): Hono {
  const app = new Hono()
  const orchestrator = new Orchestrator(new MemoryStore())

  app.get("/health", (c) => c.json({ status: "ok" }))

  app.post("/api/projects", async (c) => {
    const input = await readJson(c, CreateProjectSchema)
    if (!input.ok) {
      return c.json(input.error, 400)
    }
    return c.json(orchestrator.createProject(input.value), 201)
  })

  app.get("/api/projects/:projectId", (c) => {
    const projectId = readProjectId(c)
    if (!projectId.ok) {
      return c.json(projectId.error, 400)
    }
    return c.json(orchestrator.getProject(projectId.value))
  })

  app.post("/api/projects/:projectId/analysis", async (c) => {
    const projectId = readProjectId(c)
    const input = await readJson(c, AnalyzeProjectSchema)
    if (!projectId.ok) {
      return c.json(projectId.error, 400)
    }
    if (!input.ok) {
      return c.json(input.error, 400)
    }
    return c.json(orchestrator.analyzeProject(projectId.value, input.value), 201)
  })

  app.post("/api/projects/:projectId/tasks", async (c) => {
    const projectId = readProjectId(c)
    const input = await readJson(c, CreateTaskSchema)
    if (!projectId.ok) {
      return c.json(projectId.error, 400)
    }
    if (!input.ok) {
      return c.json(input.error, 400)
    }
    return c.json(orchestrator.addTask(projectId.value, input.value), 201)
  })

  app.post("/api/projects/:projectId/tasks/:taskId/start", (c) => {
    const ids = readTaskRoute(c)
    if (!ids.ok) {
      return c.json(ids.error, 400)
    }
    return c.json(orchestrator.startTask(ids.value.projectId, ids.value.taskId))
  })

  app.post("/api/projects/:projectId/tasks/:taskId/complete", async (c) => {
    const ids = readTaskRoute(c)
    const input = await readJson(c, CompleteTaskSchema)
    if (!ids.ok) {
      return c.json(ids.error, 400)
    }
    if (!input.ok) {
      return c.json(input.error, 400)
    }
    return c.json(orchestrator.completeTask(ids.value.projectId, ids.value.taskId, input.value))
  })

  app.post("/api/projects/:projectId/events", async (c) => {
    const projectId = readProjectId(c)
    const input = await readJson(c, CreateAgentEventSchema)
    if (!projectId.ok) {
      return c.json(projectId.error, 400)
    }
    if (!input.ok) {
      return c.json(input.error, 400)
    }
    return c.json(orchestrator.ingestAgentEvent(projectId.value, input.value), 201)
  })

  app.post("/api/projects/:projectId/integrations", async (c) => {
    const projectId = readProjectId(c)
    const input = await readJson(c, CreateIntegrationAnalysisSchema)
    if (!projectId.ok) {
      return c.json(projectId.error, 400)
    }
    if (!input.ok) {
      return c.json(input.error, 400)
    }
    return c.json(orchestrator.analyzeIntegration(projectId.value, input.value), 201)
  })

  app.post("/api/projects/:projectId/secret-requests", async (c) => {
    const projectId = readProjectId(c)
    const input = await readJson(c, CreateSecretRequestSchema)
    if (!projectId.ok) {
      return c.json(projectId.error, 400)
    }
    if (!input.ok) {
      return c.json(input.error, 400)
    }
    return c.json(orchestrator.createSecretRequest(projectId.value, input.value), 201)
  })

  app.post("/api/projects/:projectId/secret-requests/:requestId/complete", async (c) => {
    const ids = readSecretRoute(c)
    const input = await readJson(c, CompleteSecretRequestSchema)
    if (!ids.ok) {
      return c.json(ids.error, 400)
    }
    if (!input.ok) {
      return c.json(input.error, 400)
    }
    return c.json(
      orchestrator.completeSecretRequest(ids.value.projectId, ids.value.requestId, input.value),
    )
  })

  app.notFound((c) => c.json({ code: "not_found", message: "route not found" }, 404))

  app.onError((error, c) => {
    if (error instanceof NotFoundError) {
      return c.json({ code: "not_found", message: error.message }, 404)
    }
    if (error instanceof DependencyBlockedError) {
      return c.json({ code: "dependency_blocked", message: error.message }, 409)
    }
    return c.json({ code: "internal_error", message: "internal server error" }, 500)
  })

  return app
}

async function readJson<T>(c: Context, schema: ZodType<T>): Promise<ParseResult<T>> {
  try {
    const raw: unknown = await c.req.json()
    const result = schema.safeParse(raw)
    if (!result.success) {
      return {
        ok: false,
        error: { code: "invalid_request", message: z.prettifyError(result.error) },
      }
    }
    return { ok: true, value: result.data }
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { ok: false, error: { code: "invalid_json", message: "invalid json body" } }
    }
    throw error
  }
}

function readProjectId(c: Context): ParseResult<ProjectId> {
  const result = ProjectIdSchema.safeParse(c.req.param("projectId"))
  if (!result.success) {
    return { ok: false, error: { code: "invalid_project_id", message: "invalid project id" } }
  }
  return { ok: true, value: result.data }
}

function readTaskRoute(
  c: Context,
): ParseResult<{ readonly projectId: ProjectId; readonly taskId: TaskId }> {
  const projectId = readProjectId(c)
  const taskId = TaskIdSchema.safeParse(c.req.param("taskId"))
  if (!projectId.ok) {
    return projectId
  }
  if (!taskId.success) {
    return { ok: false, error: { code: "invalid_task_id", message: "invalid task id" } }
  }
  return { ok: true, value: { projectId: projectId.value, taskId: taskId.data } }
}

function readSecretRoute(
  c: Context,
): ParseResult<{ readonly projectId: ProjectId; readonly requestId: SecretRequestId }> {
  const projectId = readProjectId(c)
  const requestId = SecretRequestIdSchema.safeParse(c.req.param("requestId"))
  if (!projectId.ok) {
    return projectId
  }
  if (!requestId.success) {
    return { ok: false, error: { code: "invalid_request_id", message: "invalid request id" } }
  }
  return { ok: true, value: { projectId: projectId.value, requestId: requestId.data } }
}
