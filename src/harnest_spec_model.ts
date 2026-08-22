import { z } from "zod"

export const HarnestComponentType = {
  Model: "model",
  Prompt: "prompt",
  Context: "context",
  Memory: "memory",
  Agent: "agent",
  Tool: "tool",
  Mcp: "mcp",
  Output: "output",
  Evaluator: "evaluator",
} as const

export const HarnestIssueSeverity = {
  Error: "error",
  Warning: "warning",
} as const

export type HarnestComponentType = (typeof HarnestComponentType)[keyof typeof HarnestComponentType]
export type HarnestIssueSeverity = (typeof HarnestIssueSeverity)[keyof typeof HarnestIssueSeverity]
export type HarnestComponent = HarnestSpec["components"][string]
export type HarnestRequiredField = "provider" | "model" | "template" | "schema"
export type PortDirection = "input" | "output"

export const HarnestComponentSchema = z.object({
  type: z.enum(HarnestComponentType),
  provider: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  template: z.string().trim().min(1).optional(),
  schema: z.record(z.string(), z.unknown()).optional(),
})

const HarnestEndpointSchema = z.object({
  component: z.string().trim().min(1),
  port: z.string().trim().min(1),
})

const HarnestConnectionSchema = z.object({
  from: HarnestEndpointSchema,
  to: HarnestEndpointSchema,
  when: z.string().trim().min(1).optional(),
})

export const HarnestSpecSchema = z.object({
  version: z.literal("0.1"),
  components: z.record(z.string().trim().min(1), HarnestComponentSchema),
  connections: z.array(HarnestConnectionSchema).default([]),
  studio: z.unknown().optional(),
})

export type HarnestSpec = z.infer<typeof HarnestSpecSchema>

export function portsFor(component: HarnestComponent, direction: PortDirection): readonly string[] {
  switch (component.type) {
    case HarnestComponentType.Model:
    case HarnestComponentType.Prompt:
    case HarnestComponentType.Context:
    case HarnestComponentType.Memory:
    case HarnestComponentType.Tool:
    case HarnestComponentType.Mcp:
      return direction === "output" ? ["output"] : []
    case HarnestComponentType.Agent:
      return direction === "output" ? ["output"] : ["model", "prompt", "context", "memory", "tool"]
    case HarnestComponentType.Output:
      return direction === "input" ? ["input"] : []
    case HarnestComponentType.Evaluator:
      return direction === "output" ? ["result"] : ["input"]
    default:
      return assertNever(component.type)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected Harnest component type: ${String(value)}`)
}
