import * as fs from 'fs'
import * as path from 'path'

// Clear prior run artifacts so the aggregated report reflects only this run.
export default async function globalSetup() {
  const here = path.join(process.cwd(), 'visual-tests')
  for (const dir of [path.join(here, 'report', 'results'), path.join(here, 'screenshots')]) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
