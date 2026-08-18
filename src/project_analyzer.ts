import { z } from "zod"

export const Framework = {
  NextJs: "nextjs",
  Hono: "hono",
  Unknown: "unknown",
} as const

export const PackageManager = {
  Pnpm: "pnpm",
  Npm: "npm",
  Yarn: "yarn",
  Bun: "bun",
  Unknown: "unknown",
} as const

export const Confidence = {
  Low: "low",
  Medium: "medium",
  High: "high",
} as const

export type Framework = (typeof Framework)[keyof typeof Framework]
export type PackageManager = (typeof PackageManager)[keyof typeof PackageManager]
export type Confidence = (typeof Confidence)[keyof typeof Confidence]

export type ProjectAnalysis = {
  readonly framework: Framework
  readonly packageManager: PackageManager
  readonly commands: ProjectCommands
  readonly structures: ProjectStructures
  readonly confidence: Confidence
}

export type ProjectCommands = {
  readonly build?: string
  readonly test?: string
  readonly dev?: string
}

export type ProjectStructures = {
  readonly api: boolean
  readonly database: boolean
  readonly tests: boolean
}

export const AnalyzeProjectSchema = z.object({
  files: z.array(z.string().trim().min(1)).default([]),
  packageJson: z
    .object({
      scripts: z.record(z.string(), z.string()).default({}),
      dependencies: z.record(z.string(), z.string()).default({}),
      devDependencies: z.record(z.string(), z.string()).default({}),
    })
    .optional(),
})

export type AnalyzeProjectInput = z.infer<typeof AnalyzeProjectSchema>

export class ProjectAnalyzer {
  analyze(input: AnalyzeProjectInput): ProjectAnalysis {
    const framework = detectFramework(input)
    const packageManager = detectPackageManager(input.files)
    const commands = detectCommands(input)
    const structures = detectStructures(input.files)
    return {
      framework,
      packageManager,
      commands,
      structures,
      confidence: confidenceFor(framework, packageManager, commands),
    }
  }
}

function detectFramework(input: AnalyzeProjectInput): Framework {
  if (hasPackage(input, "next") || input.files.some((file) => file.includes("/app/"))) {
    return Framework.NextJs
  }
  if (hasPackage(input, "hono")) {
    return Framework.Hono
  }
  return Framework.Unknown
}

function detectPackageManager(files: readonly string[]): PackageManager {
  if (files.includes("pnpm-lock.yaml")) {
    return PackageManager.Pnpm
  }
  if (files.includes("bun.lockb") || files.includes("bun.lock")) {
    return PackageManager.Bun
  }
  if (files.includes("yarn.lock")) {
    return PackageManager.Yarn
  }
  if (files.includes("package-lock.json")) {
    return PackageManager.Npm
  }
  return PackageManager.Unknown
}

function detectCommands(input: AnalyzeProjectInput): ProjectCommands {
  const scripts = input.packageJson?.scripts ?? {}
  return {
    ...(scripts["build"] === undefined ? {} : { build: scripts["build"] }),
    ...(scripts["test"] === undefined ? {} : { test: scripts["test"] }),
    ...(scripts["dev"] === undefined ? {} : { dev: scripts["dev"] }),
  }
}

function detectStructures(files: readonly string[]): ProjectStructures {
  return {
    api: files.some((file) => file.includes("/api/") || file.startsWith("api/")),
    database: files.some(
      (file) =>
        file.includes("/db/") ||
        file.endsWith("/db.ts") ||
        file.endsWith("/db.js") ||
        file.includes("schema."),
    ),
    tests: files.some((file) => file.includes("test.") || file.includes(".spec.")),
  }
}

function confidenceFor(
  framework: Framework,
  packageManager: PackageManager,
  commands: ProjectCommands,
): Confidence {
  if (
    framework !== Framework.Unknown &&
    packageManager !== PackageManager.Unknown &&
    commands.build
  ) {
    return Confidence.High
  }
  if (
    framework !== Framework.Unknown ||
    packageManager !== PackageManager.Unknown ||
    commands.test
  ) {
    return Confidence.Medium
  }
  return Confidence.Low
}

function hasPackage(input: AnalyzeProjectInput, name: string): boolean {
  return (
    input.packageJson?.dependencies[name] !== undefined ||
    input.packageJson?.devDependencies[name] !== undefined
  )
}
