import * as fs from 'fs'
import * as path from 'path'

interface Result {
  project: string
  id: string
  title: string
  path: string
  status: 'pass' | 'fail'
  consoleErrors: string[]
  pageErrors: string[]
  unmocked: string[]
  notes: string[]
  screenshot: string
}

// Aggregate the per-test result files (written by visual.spec.ts) into a single
// report. Runs once in the main process after all project workers finish.
export default async function globalTeardown() {
  const here = path.join(process.cwd(), 'visual-tests')
  const resultsDir = path.join(here, 'report', 'results')
  const reportDir = path.join(here, 'report')
  if (!fs.existsSync(resultsDir)) return

  const results: Result[] = fs
    .readdirSync(resultsDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(resultsDir, f), 'utf8')))
    .sort((a, b) => a.project.localeCompare(b.project) || a.id.localeCompare(b.id))

  fs.writeFileSync(path.join(reportDir, 'report.json'), JSON.stringify(results, null, 2))

  const byProject = results.reduce<Record<string, Result[]>>((acc, r) => {
    ;(acc[r.project] ||= []).push(r)
    return acc
  }, {})

  const passed = results.filter((r) => r.status === 'pass').length
  const lines: string[] = [
    '# Visual render report',
    '',
    `**${passed}/${results.length} view renders passed** across ${Object.keys(byProject).length} viewport(s).`,
    '',
    '> Fixture-driven (no backend). ❌ = expected content missing, uncaught error, or unexpected error state.',
    '',
  ]

  for (const [project, rows] of Object.entries(byProject)) {
    lines.push(`## ${project}`, '')
    lines.push('| View | Status | Console err | Page err | Notes | Screenshot |')
    lines.push('|------|--------|-------------|----------|-------|------------|')
    for (const r of rows) {
      const mark = r.status === 'pass' ? '✅' : '❌'
      const notes =
        [...r.notes, ...(r.unmocked.length ? [`unmocked: ${r.unmocked.join(', ')}`] : [])].join('; ') || '—'
      const pe = r.pageErrors.length ? `\`${r.pageErrors[0].slice(0, 80)}\`` : '—'
      lines.push(
        `| ${r.title} | ${mark} | ${r.consoleErrors.length || '—'} | ${pe} | ${notes} | \`${r.screenshot}\` |`,
      )
    }
    lines.push('')
  }
  fs.writeFileSync(path.join(reportDir, 'report.md'), lines.join('\n'))
}
