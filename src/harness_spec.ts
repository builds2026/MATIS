import { z } from "zod"

export const HarnessNodeType = {
  Input: "input",
  Agent: "agent",
  Tool: "tool",
  Mcp: "mcp",
  Command: "command",
  Condition: "condition",
  Router: "router",
  Parallel: "parallel",
  Approval: "approval",
  Evaluator: "evaluator",
  Output: "output",
} as const

export const HarnessIssueSeverity = {
  Error: "error",
  Warning: "warning",
} as const

export type HarnessNodeType = (typeof HarnessNodeType)[keyof typeof HarnessNodeType]
export type HarnessIssueSeverity = (typeof HarnessIssueSeverity)[keyof typeof HarnessIssueSeverity]

export type HarnessValidationIssue = {
  readonly severity: HarnessIssueSeverity
  readonly code: string
  readonly path: string
  readonly message: string
}

export type HarnessValidationSummary = {
  readonly nodeCount: number
  readonly edgeCount: number
  readonly startNodeIds: readonly string[]
  readonly terminalNodeIds: readonly string[]
}

export type HarnessValidationResult = {
  readonly valid: boolean
  readonly errors: readonly HarnessValidationIssue[]
  readonly warnings: readonly HarnessValidationIssue[]
  readonly summary: HarnessValidationSummary
}

export const HarnessNodeSchema = z.object({
  type: z.enum(HarnessNodeType),
  model: z.string().trim().min(1).optional(),
  prompt: z.string().trim().min(1).optional(),
  tools: z.array(z.string().trim().min(1)).optional(),
  run: z.string().trim().min(1).optional(),
})

export const HarnessEdgeSchema = z.object({
  from: z.string().trim().min(1),
  to: z.string().trim().min(1),
  when: z.string().trim().min(1).optional(),
})

export const HarnessSpecSchema = z.object({
  version: z.literal("0.1"),
  nodes: z.record(z.string().trim().min(1), HarnessNodeSchema),
  edges: z.array(HarnessEdgeSchema).default([]),
})

export type HarnessSpec = z.infer<typeof HarnessSpecSchema>

export function validateHarnessSpec(spec: HarnessSpec): HarnessValidationResult {
  const nodeIds = Object.keys(spec.nodes)
  const nodeIdSet = new Set(nodeIds)
  const errors = [
    ...findMissingEdgeNodes(spec, nodeIdSet),
    ...findMissingNodeConfiguration(spec),
    ...findMissingFlowBoundaries(spec, nodeIds),
  ]
  const summary = summarizeHarnessSpec(spec, nodeIds)
  return {
    valid: errors.length === 0,
    errors,
    warnings: [],
    summary,
  }
}

function findMissingEdgeNodes(
  spec: HarnessSpec,
  nodeIds: ReadonlySet<string>,
): readonly HarnessValidationIssue[] {
  return spec.edges.flatMap((edge, index) => {
    const issues: HarnessValidationIssue[] = []
    if (!nodeIds.has(edge.from)) {
      issues.push({
        severity: HarnessIssueSeverity.Error,
        code: "missing_edge_source",
        path: `edges[${index}].from`,
        message: `Edge source "${edge.from}" does not exist.`,
      })
    }
    if (!nodeIds.has(edge.to)) {
      issues.push({
        severity: HarnessIssueSeverity.Error,
        code: "missing_edge_target",
        path: `edges[${index}].to`,
        message: `Edge target "${edge.to}" does not exist.`,
      })
    }
    return issues
  })
}

function findMissingNodeConfiguration(spec: HarnessSpec): readonly HarnessValidationIssue[] {
  return Object.entries(spec.nodes).flatMap(([nodeId, node]) => {
    switch (node.type) {
      case HarnessNodeType.Agent:
        return agentConfigurationIssues(nodeId, node)
      case HarnessNodeType.Command:
        return commandConfigurationIssues(nodeId, node)
      case HarnessNodeType.Input:
      case HarnessNodeType.Tool:
      case HarnessNodeType.Mcp:
      case HarnessNodeType.Condition:
      case HarnessNodeType.Router:
      case HarnessNodeType.Parallel:
      case HarnessNodeType.Approval:
      case HarnessNodeType.Evaluator:
      case HarnessNodeType.Output:
        return []
      default:
        return assertNever(node.type)
    }
  })
}

function assertNever(value: never): never {
  throw new Error(`Unexpected HarnessNodeType: ${String(value)}`)
}

function agentConfigurationIssues(
  nodeId: string,
  node: HarnessSpec["nodes"][string],
): readonly HarnessValidationIssue[] {
  const issues: HarnessValidationIssue[] = []
  if (node.model === undefined) {
    issues.push(requiredNodeFieldIssue(nodeId, "model"))
  }
  if (node.prompt === undefined) {
    issues.push(requiredNodeFieldIssue(nodeId, "prompt"))
  }
  return issues
}

function commandConfigurationIssues(
  nodeId: string,
  node: HarnessSpec["nodes"][string],
): readonly HarnessValidationIssue[] {
  if (node.run !== undefined) {
    return []
  }
  return [requiredNodeFieldIssue(nodeId, "run")]
}

function requiredNodeFieldIssue(nodeId: string, field: string): HarnessValidationIssue {
  return {
    severity: HarnessIssueSeverity.Error,
    code: "missing_node_config",
    path: `nodes.${nodeId}.${field}`,
    message: `Node "${nodeId}" is missing required field "${field}".`,
  }
}

function findMissingFlowBoundaries(
  spec: HarnessSpec,
  nodeIds: readonly string[],
): readonly HarnessValidationIssue[] {
  if (nodeIds.length === 0) {
    return [
      {
        severity: HarnessIssueSeverity.Error,
        code: "missing_nodes",
        path: "nodes",
        message: "HarnessSpec must define at least one node.",
      },
    ]
  }
  const summary = summarizeHarnessSpec(spec, nodeIds)
  const issues: HarnessValidationIssue[] = []
  if (summary.startNodeIds.length === 0) {
    issues.push({
      severity: HarnessIssueSeverity.Error,
      code: "missing_start_node",
      path: "edges",
      message: "HarnessSpec must contain at least one start node.",
    })
  }
  if (summary.terminalNodeIds.length === 0) {
    issues.push({
      severity: HarnessIssueSeverity.Error,
      code: "missing_terminal_node",
      path: "edges",
      message: "HarnessSpec must contain at least one terminal node.",
    })
  }
  return issues
}

function summarizeHarnessSpec(
  spec: HarnessSpec,
  nodeIds: readonly string[],
): HarnessValidationSummary {
  const sources = new Set(spec.edges.map((edge) => edge.from))
  const targets = new Set(spec.edges.map((edge) => edge.to))
  return {
    nodeCount: nodeIds.length,
    edgeCount: spec.edges.length,
    startNodeIds: nodeIds.filter((nodeId) => !targets.has(nodeId)),
    terminalNodeIds: nodeIds.filter((nodeId) => !sources.has(nodeId)),
  }
}
