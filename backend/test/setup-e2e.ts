// Runs before the e2e test modules are imported, so DATABASE_URL is in place
// before PrismaClient is constructed. CI supplies its own DATABASE_URL; the
// fallback targets a local throwaway Postgres database for developer runs.
//
// Note: @nestjs/config (dotenv) does not override variables already present in
// process.env, so setting these here takes precedence over .env.dev.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://prereq:prereq@localhost:5432/prereq_test?schema=public';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-test-secret';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
