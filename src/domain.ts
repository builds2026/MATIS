import { z } from "zod"

export const ProjectIdSchema = z.string().uuid().brand("ProjectId")
export const TaskIdSchema = z.string().uuid().brand("TaskId")
export const HandoffIdSchema = z.string().uuid().brand("HandoffId")
export const SecretRequestIdSchema = z.string().uuid().brand("SecretRequestId")
export const AgentEventIdSchema = z.string().uuid().brand("AgentEventId")
export const DecisionIdSchema = z.string().uuid().brand("DecisionId")

export type ProjectId = z.infer<typeof ProjectIdSchema>
export type TaskId = z.infer<typeof TaskIdSchema>
export type HandoffId = z.infer<typeof HandoffIdSchema>
export type SecretRequestId = z.infer<typeof SecretRequestIdSchema>
export type AgentEventId = z.infer<typeof AgentEventIdSchema>
export type DecisionId = z.infer<typeof DecisionIdSchema>

export const ProjectStatus = {
  Planning: "planning",
  Running: "running",
  Done: "done",
} as const

export const TaskStatus = {
  Pending: "pending",
  Running: "running",
  Blocked: "blocked",
  Done: "done",
} as const

export const TaskKind = {
  Planning: "planning",
  Backend: "backend",
  Frontend: "frontend",
  Review: "review",
  Test: "test",
  Docs: "docs",
} as const

export const SecretRequestStatus = {
  Pending: "pending",
  Completed: "completed",
} as const

export const AgentEventType = {
  TaskProgress: "task_progress",
  Discovery: "discovery",
  CodeChanged: "code_changed",
  ApiChanged: "api_changed",
  Blocked: "blocked",
  Conflict: "conflict",
  TestFailed: "test_failed",
} as const

export const DecisionAction = {
  None: "none",
  UpdateTask: "update_task",
  CreateTask: "create_task",
  Replan: "replan",
} as const

export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus]
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus]
export type TaskKind = (typeof TaskKind)[keyof typeof TaskKind]
export type SecretRequestStatus = (typeof SecretRequestStatus)[keyof typeof SecretRequestStatus]
export type AgentEventType = (typeof AgentEventType)[keyof typeof AgentEventType]
export type DecisionAction = (typeof DecisionAction)[keyof typeof DecisionAction]

export type Project = {
  readonly id: ProjectId
  readonly name: string
  readonly idea: string
  readonly status: ProjectStatus
  readonly tasks: readonly Task[]
  readonly secretRequests: readonly SecretRequest[]
  readonly events: readonly AgentEvent[]
  readonly decisions: readonly Decision[]
}

export type Task = {
  readonly id: TaskId
  readonly projectId: ProjectId
  readonly title: string
  readonly kind: TaskKind
  readonly status: TaskStatus
  readonly dependsOn: readonly TaskId[]
  readonly handoff?: Handoff
}

export type Handoff = {
  readonly id: HandoffId
  readonly taskId: TaskId
  readonly summary: string
  readonly changedFiles: readonly string[]
  readonly tests: string
  readonly remainingIssues: string
  readonly nextSteps: string
}

export type SecretRequest = {
  readonly id: SecretRequestId
  readonly projectId: ProjectId
  readonly agentId: string
  readonly keyName: string
  readonly reason: string
  readonly targetFile: string
  readonly status: SecretRequestStatus
  readonly envName?: string
}

export type AgentEvent = {
  readonly id: AgentEventId
  readonly projectId: ProjectId
  readonly agentId: string
  readonly type: AgentEventType
  readonly summary: string
  readonly taskId?: TaskId
  readonly taskStatus?: TaskStatus
  readonly createdAt: string
}

export type Decision = {
  readonly id: DecisionId
  readonly projectId: ProjectId
  readonly eventId: AgentEventId
  readonly action: DecisionAction
  readonly reason: string
  readonly instructions: string
  readonly createdTaskId?: TaskId
  readonly updatedTaskId?: TaskId
}

export const CreateProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  idea: z.string().trim().min(1).max(4000),
})

export const CreateTaskSchema = z.object({
  title: z.string().trim().min(1).max(160),
  kind: z.enum(TaskKind),
  dependsOn: z.array(TaskIdSchema).default([]),
})

export const CompleteTaskSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  changedFiles: z.array(z.string().trim().min(1)).default([]),
  tests: z.string().trim().min(1).max(2000),
  remainingIssues: z.string().trim().min(1).max(2000),
  nextSteps: z.string().trim().min(1).max(2000),
})

export const CreateSecretRequestSchema = z.object({
  agentId: z.string().trim().min(1).max(80),
  keyName: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]*$/u),
  reason: z.string().trim().min(1).max(1000),
  targetFile: z.string().trim().min(1).max(200),
})

export const CompleteSecretRequestSchema = z.object({
  envName: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]*$/u),
})

export const CreateAgentEventSchema = z.object({
  agentId: z.string().trim().min(1).max(80),
  type: z.enum(AgentEventType),
  summary: z.string().trim().min(1).max(1200),
  taskId: TaskIdSchema.optional(),
  taskStatus: z.enum(TaskStatus).optional(),
})

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>
export type CompleteTaskInput = z.infer<typeof CompleteTaskSchema>
export type CreateSecretRequestInput = z.infer<typeof CreateSecretRequestSchema>
export type CompleteSecretRequestInput = z.infer<typeof CompleteSecretRequestSchema>
export type CreateAgentEventInput = z.infer<typeof CreateAgentEventSchema>

export function newProjectId(): ProjectId {
  return ProjectIdSchema.parse(crypto.randomUUID())
}

export function newTaskId(): TaskId {
  return TaskIdSchema.parse(crypto.randomUUID())
}

export function newHandoffId(): HandoffId {
  return HandoffIdSchema.parse(crypto.randomUUID())
}

export function newSecretRequestId(): SecretRequestId {
  return SecretRequestIdSchema.parse(crypto.randomUUID())
}

export function newAgentEventId(): AgentEventId {
  return AgentEventIdSchema.parse(crypto.randomUUID())
}

export function newDecisionId(): DecisionId {
  return DecisionIdSchema.parse(crypto.randomUUID())
}
