/**
 * Application Setup - Service Registration
 * This is where providers are registered with the container
 * Makes it easy to swap implementations without touching business logic
 */

import { container } from './core/container'
import { createSupabaseAuth } from './providers/auth/SupabaseAuth'
import { createGitHubRepository } from './providers/repository/GitHubRepository'

/**
 * Setup all services
 * Call this once at application startup
 */
export function setupServices(): void {
  // Register Auth Provider
  container.register('auth', () => createSupabaseAuth(), { singleton: true })

  // Register Repository Provider
  container.register('repository', () => createGitHubRepository(), { singleton: true })

  // TODO: Register remaining providers
  // - Storage (Supabase Storage, S3, etc.)
  // - Database (Supabase, PostgreSQL, etc.)
  // - Event System (Redis, RabbitMQ, etc.)
  // - AI Provider (Claude, GPT, local LLM, etc.)
  // - Logging (Winston, Pino, etc.)
  // - Notifications (SendGrid, Slack, etc.)
}

/**
 * Example usage in your application
 */
export async function exampleUsage() {
  const auth = container.getAuth()
  const repo = container.getRepository()

  // Authenticate user
  const session = await auth.authenticate({
    email: 'user@example.com',
    password: 'password',
  })

  // Use repository
  const repositories = await repo.listRepositories()
  console.log('Repositories:', repositories)

  // If you want to swap GitHub for GitLab:
  // 1. Create GitLabRepository class implementing RepositoryProvider
  // 2. Change the registration:
  //    container.register('repository', () => createGitLabRepository(), { singleton: true })
  // 3. No other code changes needed!
}
