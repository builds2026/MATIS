import type {
  AgentEvent,
  Decision,
  IntegrationAnalysis,
  Project,
  ProjectId,
  SecretRequest,
  SecretRequestId,
  Task,
  TaskId,
} from "./domain.js"
import { NotFoundError } from "./errors.js"

export class MemoryStore {
  readonly #projects = new Map<ProjectId, Project>()

  createProject(project: Project): Project {
    this.#projects.set(project.id, project)
    return project
  }

  getProject(projectId: ProjectId): Project {
    const project = this.#projects.get(projectId)
    if (project === undefined) {
      throw new NotFoundError("project")
    }
    return project
  }

  addTask(projectId: ProjectId, task: Task): Task {
    const project = this.getProject(projectId)
    this.#projects.set(projectId, {
      ...project,
      tasks: [...project.tasks, task],
    })
    return task
  }

  updateTask(projectId: ProjectId, task: Task): Task {
    const project = this.getProject(projectId)
    const tasks = project.tasks.map((candidate) => (candidate.id === task.id ? task : candidate))
    this.#projects.set(projectId, { ...project, tasks })
    return task
  }

  addEvent(projectId: ProjectId, event: AgentEvent): AgentEvent {
    const project = this.getProject(projectId)
    this.#projects.set(projectId, {
      ...project,
      events: [...project.events, event],
    })
    return event
  }

  addDecision(projectId: ProjectId, decision: Decision): Decision {
    const project = this.getProject(projectId)
    this.#projects.set(projectId, {
      ...project,
      decisions: [...project.decisions, decision],
    })
    return decision
  }

  addIntegrationAnalysis(projectId: ProjectId, analysis: IntegrationAnalysis): IntegrationAnalysis {
    const project = this.getProject(projectId)
    this.#projects.set(projectId, {
      ...project,
      integrationAnalyses: [...project.integrationAnalyses, analysis],
    })
    return analysis
  }

  getTask(projectId: ProjectId, taskId: TaskId): Task {
    const task = this.getProject(projectId).tasks.find((candidate) => candidate.id === taskId)
    if (task === undefined) {
      throw new NotFoundError("task")
    }
    return task
  }

  addSecretRequest(projectId: ProjectId, request: SecretRequest): SecretRequest {
    const project = this.getProject(projectId)
    this.#projects.set(projectId, {
      ...project,
      secretRequests: [...project.secretRequests, request],
    })
    return request
  }

  updateSecretRequest(projectId: ProjectId, request: SecretRequest): SecretRequest {
    const project = this.getProject(projectId)
    const secretRequests = project.secretRequests.map((candidate) =>
      candidate.id === request.id ? request : candidate,
    )
    this.#projects.set(projectId, { ...project, secretRequests })
    return request
  }

  getSecretRequest(projectId: ProjectId, requestId: SecretRequestId): SecretRequest {
    const request = this.getProject(projectId).secretRequests.find(
      (candidate) => candidate.id === requestId,
    )
    if (request === undefined) {
      throw new NotFoundError("secret request")
    }
    return request
  }
}
