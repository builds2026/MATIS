import {
  type HarnestComponent,
  HarnestComponentType,
  HarnestIssueSeverity,
  type HarnestRequiredField,
  type HarnestSpec,
  HarnestSpecSchema,
  type PortDirection,
  portsFor,
} from "./harnest_spec_model.js"

export { HarnestSpecSchema }

export type HarnestValidationIssue = {
  readonly severity: typeof HarnestIssueSeverity.Error
  readonly code: string
  readonly path: string
  readonly message: string
}

export type HarnestValidationSummary = {
  readonly componentCount: number
  readonly connectionCount: number
  readonly startComponentIds: readonly string[]
  readonly terminalComponentIds: readonly string[]
}

export type HarnestValidationResult = {
  readonly valid: boolean
  readonly errors: readonly HarnestValidationIssue[]
  readonly warnings: readonly HarnestValidationIssue[]
  readonly summary: HarnestValidationSummary
}

export function validateHarnestSpec(spec: HarnestSpec): HarnestValidationResult {
  const componentIds = Object.keys(spec.components)
  const componentIdSet = new Set(componentIds)
  const errors = [
    ...findMissingConnectionComponents(spec, componentIdSet),
    ...findInvalidConnectionPorts(spec),
    ...findMissingComponentConfiguration(spec),
    ...findMissingGraphBoundaries(spec, componentIds),
  ]
  return {
    valid: errors.length === 0,
    errors,
    warnings: [],
    summary: summarizeHarnestSpec(spec, componentIds),
  }
}

function findMissingConnectionComponents(
  spec: HarnestSpec,
  componentIds: ReadonlySet<string>,
): readonly HarnestValidationIssue[] {
  return spec.connections.flatMap((connection, index) => {
    const issues: HarnestValidationIssue[] = []
    if (!componentIds.has(connection.from.component)) {
      issues.push(
        errorIssue(
          "missing_connection_source",
          `connections[${index}].from.component`,
          `Connection source "${connection.from.component}" does not exist.`,
        ),
      )
    }
    if (!componentIds.has(connection.to.component)) {
      issues.push(
        errorIssue(
          "missing_connection_target",
          `connections[${index}].to.component`,
          `Connection target "${connection.to.component}" does not exist.`,
        ),
      )
    }
    return issues
  })
}

function findInvalidConnectionPorts(spec: HarnestSpec): readonly HarnestValidationIssue[] {
  return spec.connections.flatMap((connection, index) => {
    const source = spec.components[connection.from.component]
    const target = spec.components[connection.to.component]
    return [
      ...(source === undefined
        ? []
        : portIssues({
            componentId: connection.from.component,
            component: source,
            port: connection.from.port,
            direction: "output",
            path: `connections[${index}].from.port`,
          })),
      ...(target === undefined
        ? []
        : portIssues({
            componentId: connection.to.component,
            component: target,
            port: connection.to.port,
            direction: "input",
            path: `connections[${index}].to.port`,
          })),
    ]
  })
}

function portIssues(input: PortIssueInput): readonly HarnestValidationIssue[] {
  if (portsFor(input.component, input.direction).includes(input.port)) {
    return []
  }
  return [
    errorIssue(
      input.direction === "output" ? "invalid_source_port" : "invalid_target_port",
      input.path,
      `Component "${input.componentId}" has no ${input.direction} port "${input.port}".`,
    ),
  ]
}

function findMissingComponentConfiguration(spec: HarnestSpec): readonly HarnestValidationIssue[] {
  return Object.entries(spec.components).flatMap(([componentId, component]) => {
    switch (component.type) {
      case HarnestComponentType.Model:
        return requiredFields(componentId, component, ["provider", "model"])
      case HarnestComponentType.Prompt:
        return requiredFields(componentId, component, ["template"])
      case HarnestComponentType.Output:
        return requiredFields(componentId, component, ["schema"])
      case HarnestComponentType.Context:
      case HarnestComponentType.Memory:
      case HarnestComponentType.Agent:
      case HarnestComponentType.Tool:
      case HarnestComponentType.Mcp:
      case HarnestComponentType.Evaluator:
        return []
      default:
        return assertNever(component.type)
    }
  })
}

function requiredFields(
  componentId: string,
  component: HarnestComponent,
  fields: readonly HarnestRequiredField[],
): readonly HarnestValidationIssue[] {
  return fields.flatMap((field) =>
    component[field] === undefined
      ? [
          errorIssue(
            "missing_component_config",
            `components.${componentId}.${field}`,
            `Component "${componentId}" is missing required field "${field}".`,
          ),
        ]
      : [],
  )
}

function findMissingGraphBoundaries(
  spec: HarnestSpec,
  componentIds: readonly string[],
): readonly HarnestValidationIssue[] {
  if (componentIds.length === 0) {
    return [
      errorIssue(
        "missing_components",
        "components",
        "HarnestSpec must define at least one component.",
      ),
    ]
  }
  const summary = summarizeHarnestSpec(spec, componentIds)
  return [
    ...(summary.startComponentIds.length === 0
      ? [
          errorIssue(
            "missing_start_component",
            "connections",
            "HarnestSpec must contain at least one start component.",
          ),
        ]
      : []),
    ...(summary.terminalComponentIds.length === 0
      ? [
          errorIssue(
            "missing_terminal_component",
            "connections",
            "HarnestSpec must contain at least one terminal component.",
          ),
        ]
      : []),
  ]
}

function summarizeHarnestSpec(
  spec: HarnestSpec,
  componentIds: readonly string[],
): HarnestValidationSummary {
  const validConnections = spec.connections.filter(
    (connection) =>
      spec.components[connection.from.component] !== undefined &&
      spec.components[connection.to.component] !== undefined,
  )
  const sources = new Set(validConnections.map((connection) => connection.from.component))
  const targets = new Set(validConnections.map((connection) => connection.to.component))
  return {
    componentCount: componentIds.length,
    connectionCount: spec.connections.length,
    startComponentIds: componentIds.filter((componentId) => !targets.has(componentId)),
    terminalComponentIds: componentIds.filter((componentId) => !sources.has(componentId)),
  }
}

function errorIssue(code: string, path: string, message: string): HarnestValidationIssue {
  return {
    severity: HarnestIssueSeverity.Error,
    code,
    path,
    message,
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected Harnest component type: ${String(value)}`)
}

type PortIssueInput = {
  readonly componentId: string
  readonly component: HarnestComponent
  readonly port: string
  readonly direction: PortDirection
  readonly path: string
}
