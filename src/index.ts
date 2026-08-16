import { serve } from "@hono/node-server"

import { createApp } from "./app.js"

const parsedPort = Number.parseInt(process.env["PORT"] ?? "3000", 10)
const port = Number.isNaN(parsedPort) ? 3000 : parsedPort

serve({
  fetch: createApp().fetch,
  port,
})

process.stdout.write(`MATIS backend listening on http://localhost:${port}\n`)
