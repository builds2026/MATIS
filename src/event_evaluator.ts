import {
  type AgentEvent,
  AgentEventType,
  type Decision,
  DecisionAction,
  newDecisionId,
  newTaskId,
  type Project,
  type ProjectId,
  type TaskId,
  TaskKind,
  TaskStatus,
} from "./domain.js"
import type { MemoryStore } from "./store.js"

export type EventEvaluation = {
  readonly event: AgentEvent
  readonly decision: Decision
  readonly instructions: string
  readonly project: Project
}

export class EventEvaluator {
  readonly #store: MemoryStore

  constructor(store: MemoryStore) {
    this.#store = store
  }

  apply(projectId: ProjectId, event: AgentEvent): EventEvaluation {
    const decision = this.decide(projectId, event)
    return {
      event,
      decision,
      instructions: decision.instructions,
      project: this.#store.getProject(projectId),
    }
  }

  private decide(projectId: ProjectId, event: AgentEvent): Decision {
    switch (event.type) {
      case AgentEventType.TaskProgress:
        return this.updateTaskFromEvent(projectId, event)
      case AgentEventType.Blocked:
        return this.createFollowUpTask(
          projectId,
          event,
          "Agent reported a blocker that needs separate resolution.",
        )
      case AgentEventType.TestFailed:
        return this.createFollowUpTask(projectId, event, "Test failure needs an isolated fix task.")
      case AgentEventType.Conflict:
      case AgentEventType.ApiChanged:
        return this.storeDecision(projectId, event, {
          action: DecisionAction.Replan,
          reason: "Event can affect dependent work, so the plan needs review.",
          instructions: "Stop dependent work and wait for the updated project plan.",
        })
      case AgentEventType.Discovery:
      case AgentEventType.CodeChanged:
        return this.storeDecision(projectId, event, {
          action: DecisionAction.None,
          reason: "Event was recorded without requiring task changes.",
          instructions: "Continue the current task and report the next material change.",
        })
      default:
        return assertNever(event.type)
    }
  }

  private updateTaskFromEvent(projectId: ProjectId, event: AgentEvent): Decision {
    if (event.taskId === undefined || event.taskStatus === undefined) {
      return this.storeDecision(projectId, event, {
        action: DecisionAction.None,
        reason: "Progress event did not include enough task state to update.",
        instructions: "Continue the current task and include taskId plus taskStatus next time.",
      })
    }
    const task = this.#store.getTask(projectId, event.taskId)
    this.#store.updateTask(projectId, { ...task, status: event.taskStatus })
    return this.storeDecision(projectId, event, {
      action: DecisionAction.UpdateTask,
      reason: "Agent progress changed the tracked task status.",
      instructions: "Continue the current task and report the next material change.",
      updatedTaskId: event.taskId,
    })
  }

  private createFollowUpTask(projectId: ProjectId, event: AgentEvent, reason: string): Decision {
    const task = this.#store.addTask(projectId, {
      id: newTaskId(),
      projectId,
      title: `Resolve event from ${event.agentId}: ${event.summary}`,
      kind: TaskKind.Backend,
      status: TaskStatus.Pending,
      dependsOn: event.taskId === undefined ? [] : [event.taskId],
    })
    return this.storeDecision(projectId, event, {
      action: DecisionAction.CreateTask,
      reason,
      instructions: "Pause the blocked path and switch to the newly created unblock task.",
      createdTaskId: task.id,
    })
  }

  private storeDecision(projectId: ProjectId, event: AgentEvent, input: DecisionInput): Decision {
    return this.#store.addDecision(
      projectId,
      compactDecision({
        id: newDecisionId(),
        projectId,
        eventId: event.id,
        action: input.action,
        reason: input.reason,
        instructions: input.instructions,
        ...(input.createdTaskId === undefined ? {} : { createdTaskId: input.createdTaskId }),
        ...(input.updatedTaskId === undefined ? {} : { updatedTaskId: input.updatedTaskId }),
      }),
    )
  }
}

type DecisionInput = {
  readonly action: DecisionAction
  readonly reason: string
  readonly instructions: string
  readonly createdTaskId?: TaskId
  readonly updatedTaskId?: TaskId
}

type DecisionDraft = Required<
  Pick<Decision, "action" | "eventId" | "id" | "instructions" | "projectId" | "reason">
> & {
  readonly createdTaskId?: TaskId
  readonly updatedTaskId?: TaskId
}

function compactDecision(decision: DecisionDraft): Decision {
  return {
    id: decision.id,
    projectId: decision.projectId,
    eventId: decision.eventId,
    action: decision.action,
    reason: decision.reason,
    instructions: decision.instructions,
    ...(decision.createdTaskId === undefined ? {} : { createdTaskId: decision.createdTaskId }),
    ...(decision.updatedTaskId === undefined ? {} : { updatedTaskId: decision.updatedTaskId }),
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled event type: ${value}`)
}
