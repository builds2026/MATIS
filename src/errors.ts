export class NotFoundError extends Error {
  readonly name = "NotFoundError"

  constructor(readonly resource: string) {
    super(`${resource} not found`)
  }
}

export class DependencyBlockedError extends Error {
  readonly name = "DependencyBlockedError"

  constructor(readonly taskId: string) {
    super(`task ${taskId} has unfinished dependencies`)
  }
}
