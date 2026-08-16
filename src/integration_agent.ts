import {
  type CreateIntegrationAnalysisInput,
  IntegrationAction,
  type IntegrationAnalysis,
  IntegrationRisk,
  newIntegrationAnalysisId,
  type Project,
  type ProjectId,
} from "./domain.js"
import type { MemoryStore } from "./store.js"

export type IntegrationEvaluation = IntegrationAnalysis & {
  readonly project: Project
}

export class IntegrationAgent {
  readonly #store: MemoryStore

  constructor(store: MemoryStore) {
    this.#store = store
  }

  analyze(projectId: ProjectId, input: CreateIntegrationAnalysisInput): IntegrationEvaluation {
    this.#store.getProject(projectId)
    const risk = classifyRisk(input)
    const action = chooseAction(risk, input.testsPassed)
    const analysis = this.#store.addIntegrationAnalysis(projectId, {
      id: newIntegrationAnalysisId(),
      projectId,
      sourceAgentIds: input.sourceAgentIds,
      summary: input.summary,
      changedFiles: input.changedFiles,
      apiChanged: input.apiChanged,
      schemaChanged: input.schemaChanged,
      testsPassed: input.testsPassed,
      conflicts: input.conflicts,
      risk,
      action,
      approvalRequired: action !== IntegrationAction.AutoIntegrate,
      instructions: instructionsFor(action),
    })
    return {
      ...analysis,
      project: this.#store.getProject(projectId),
    }
  }
}

function classifyRisk(input: CreateIntegrationAnalysisInput): IntegrationRisk {
  if (input.conflicts.length > 0 || input.apiChanged || input.schemaChanged) {
    return IntegrationRisk.High
  }
  if (!input.testsPassed || input.changedFiles.length > 6) {
    return IntegrationRisk.Medium
  }
  return IntegrationRisk.Low
}

function chooseAction(risk: IntegrationRisk, testsPassed: boolean): IntegrationAction {
  switch (risk) {
    case IntegrationRisk.Low:
      return IntegrationAction.AutoIntegrate
    case IntegrationRisk.Medium:
      return testsPassed ? IntegrationAction.HumanApproval : IntegrationAction.ReworkRequired
    case IntegrationRisk.High:
      return IntegrationAction.HumanApproval
    default:
      return assertNever(risk)
  }
}

function instructionsFor(action: IntegrationAction): string {
  switch (action) {
    case IntegrationAction.AutoIntegrate:
      return "Integration candidate is safe to apply automatically."
    case IntegrationAction.HumanApproval:
      return "Request human approval before applying this integration candidate."
    case IntegrationAction.ReworkRequired:
      return "Return this candidate to the responsible agents for rework before integration."
    default:
      return assertNever(action)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled integration value: ${value}`)
}
