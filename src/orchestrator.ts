import {
  type AgentEvent,
  type CompleteSecretRequestInput,
  type CompleteTaskInput,
  type CreateAgentEventInput,
  type CreateProjectInput,
  type CreateSecretRequestInput,
  type CreateTaskInput,
  newAgentEventId,
  newHandoffId,
  newProjectId,
  newSecretRequestId,
  newTaskId,
  type Project,
  type ProjectId,
  ProjectStatus,
  type SecretRequest,
  type SecretRequestId,
  SecretRequestStatus,
  type Task,
  type TaskId,
  TaskKind,
  TaskStatus,
} from "./domain.js"
import { DependencyBlockedError } from "./errors.js"
import { type EventEvaluation, EventEvaluator } from "./event_evaluator.js"
import type { MemoryStore } from "./store.js"

export class Orchestrator {
  readonly #events: EventEvaluator
  readonly #store: MemoryStore

  constructor(store: MemoryStore) {
    this.#store = store
    this.#events = new EventEvaluator(store)
  }

  createProject(input: CreateProjectInput): Project {
    const id = newProjectId()
    const executionTaskId = newTaskId()
    const backendTaskId = newTaskId()
    const project: Project = {
      id,
      name: input.name,
      idea: input.idea,
      status: ProjectStatus.Planning,
      tasks: [
        seedTask({
          projectId: id,
          title: "Clarify requirements",
          kind: TaskKind.Planning,
          status: TaskStatus.Done,
        }),
        seedTask({
          projectId: id,
          title: "Design backend foundation",
          kind: TaskKind.Backend,
          status: TaskStatus.Pending,
          dependsOn: [executionTaskId],
        }),
        seedTask({
          id: executionTaskId,
          projectId: id,
          title: "Select execution backend",
          kind: TaskKind.Backend,
          status: TaskStatus.Pending,
        }),
        seedTask({
          id: backendTaskId,
          projectId: id,
          title: "Implement orchestration API",
          kind: TaskKind.Backend,
          status: TaskStatus.Pending,
          dependsOn: [executionTaskId],
        }),
      ],
      secretRequests: [],
      events: [],
      decisions: [],
    }
    return this.#store.createProject(project)
  }

  getProject(projectId: ProjectId): Project {
    return this.#store.getProject(projectId)
  }

  addTask(projectId: ProjectId, input: CreateTaskInput): Task {
    return this.#store.addTask(projectId, {
      id: newTaskId(),
      projectId,
      title: input.title,
      kind: input.kind,
      status: TaskStatus.Pending,
      dependsOn: input.dependsOn,
    })
  }

  startTask(projectId: ProjectId, taskId: TaskId): Task {
    const project = this.#store.getProject(projectId)
    const task = this.#store.getTask(projectId, taskId)
    const unfinished = task.dependsOn.some((dependencyId) =>
      project.tasks.some(
        (candidate) => candidate.id === dependencyId && candidate.status !== TaskStatus.Done,
      ),
    )
    if (unfinished) {
      throw new DependencyBlockedError(taskId)
    }
    return this.#store.updateTask(projectId, { ...task, status: TaskStatus.Running })
  }

  completeTask(projectId: ProjectId, taskId: TaskId, input: CompleteTaskInput): Task {
    const task = this.#store.getTask(projectId, taskId)
    return this.#store.updateTask(projectId, {
      ...task,
      status: TaskStatus.Done,
      handoff: {
        id: newHandoffId(),
        taskId,
        summary: input.summary,
        changedFiles: input.changedFiles,
        tests: input.tests,
        remainingIssues: input.remainingIssues,
        nextSteps: input.nextSteps,
      },
    })
  }

  createSecretRequest(projectId: ProjectId, input: CreateSecretRequestInput): SecretRequest {
    return this.#store.addSecretRequest(projectId, {
      id: newSecretRequestId(),
      projectId,
      agentId: input.agentId,
      keyName: input.keyName,
      reason: input.reason,
      targetFile: input.targetFile,
      status: SecretRequestStatus.Pending,
    })
  }

  completeSecretRequest(
    projectId: ProjectId,
    requestId: SecretRequestId,
    input: CompleteSecretRequestInput,
  ): SecretRequest {
    const request = this.#store.getSecretRequest(projectId, requestId)
    return this.#store.updateSecretRequest(projectId, {
      ...request,
      status: SecretRequestStatus.Completed,
      envName: input.envName,
    })
  }

  ingestAgentEvent(projectId: ProjectId, input: CreateAgentEventInput): EventEvaluation {
    this.#store.getProject(projectId)
    const event = this.#store.addEvent(
      projectId,
      compactAgentEvent({
        id: newAgentEventId(),
        projectId,
        agentId: input.agentId,
        type: input.type,
        summary: input.summary,
        createdAt: new Date().toISOString(),
        ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
        ...(input.taskStatus === undefined ? {} : { taskStatus: input.taskStatus }),
      }),
    )
    return this.#events.apply(projectId, event)
  }
}

function seedTask(input: TaskSeed): Task {
  return {
    id: input.id ?? newTaskId(),
    projectId: input.projectId,
    title: input.title,
    kind: input.kind,
    status: input.status,
    dependsOn: input.dependsOn ?? [],
  }
}

function compactAgentEvent(event: AgentEventDraft): AgentEvent {
  return {
    id: event.id,
    projectId: event.projectId,
    agentId: event.agentId,
    type: event.type,
    summary: event.summary,
    createdAt: event.createdAt,
    ...(event.taskId === undefined ? {} : { taskId: event.taskId }),
    ...(event.taskStatus === undefined ? {} : { taskStatus: event.taskStatus }),
  }
}

type AgentEventDraft = Required<
  Pick<AgentEvent, "agentId" | "createdAt" | "id" | "projectId" | "summary" | "type">
> & {
  readonly taskId?: TaskId
  readonly taskStatus?: TaskStatus
}

type TaskSeed = {
  readonly id?: TaskId
  readonly projectId: ProjectId
  readonly title: string
  readonly kind: TaskKind
  readonly status: TaskStatus
  readonly dependsOn?: readonly TaskId[]
}
