/* eslint-disable no-unused-vars -- Declaration parameter names are part of the public API. */
export const COVERAGE_SHARD_COUNT: 8
export function vitestExecutable(): string
export function fileDigest(file: string): string
export function coverageSource(): { commit: string; tree: string; vitest: string }
export function coverageFiles(): string[]
export function relativeTestFile(file: string): string
export function completedTestFiles(report: {
  success?: boolean
  numTotalTests: number
  numFailedTests: number
  numFailedTestSuites: number
  testResults: { name: string }[]
}): string[]
export function validateCoverageShards(directory: string, options: {
  source: ReturnType<typeof coverageSource>
  expectedFiles: readonly string[]
  count?: number
}): string[]
export function prepareCoverageMerge(directory: string): { destination: string; expectedFiles: string[] }
