/**
 * Provider Interface Segregation
 * Each provider exposes only the methods it needs to implement
 * This follows Interface Segregation Principle (ISP)
 */

/**
 * Authentication Provider Contract
 * Defines how any auth system (Supabase, Auth0, OAuth) must behave
 */
export interface AuthProvider {
  authenticate(credentials: AuthCredentials): Promise<AuthSession>
  validateToken(token: string): Promise<boolean>
  refreshToken(token: string): Promise<string>
  revokeToken(token: string): Promise<void>
  getCurrentUser(): Promise<AuthUser | null>
}

export interface AuthCredentials {
  email?: string
  password?: string
  provider?: string
  code?: string // OAuth code
}

export interface AuthSession {
  userId: string
  accessToken: string
  refreshToken?: string
  expiresAt: Date
  user: AuthUser
}

export interface AuthUser {
  id: string
  email: string
  role: 'admin' | 'founder' | 'member'
  metadata?: Record<string, unknown>
}

/**
 * Repository Provider Contract
 * Defines how any Git provider (GitHub, GitLab) must behave
 */
export interface RepositoryProvider {
  listRepositories(): Promise<Repository[]>
  getRepository(owner: string, repo: string): Promise<Repository>
  listPullRequests(owner: string, repo: string): Promise<PullRequest[]>
  createBranch(owner: string, repo: string, branch: string): Promise<Branch>
  createPullRequest(owner: string, repo: string, pr: CreatePRPayload): Promise<PullRequest>
  mergePullRequest(owner: string, repo: string, prNumber: number): Promise<void>
  getCommits(owner: string, repo: string): Promise<Commit[]>
}

export interface Repository {
  id: string
  name: string
  owner: string
  url: string
  isPrivate: boolean
  description?: string
}

export interface Branch {
  name: string
  sha: string
  protected: boolean
}

export interface Commit {
  sha: string
  message: string
  author: string
  timestamp: Date
}

export interface PullRequest {
  number: number
  title: string
  body?: string
  state: 'open' | 'closed' | 'merged'
  author: string
  createdAt: Date
  updatedAt: Date
}

export interface CreatePRPayload {
  title: string
  body?: string
  head: string
  base: string
}

/**
 * Storage Provider Contract
 * Defines how any storage system (Supabase, S3, PostgreSQL) must behave
 */
export interface StorageProvider {
  read<T>(path: string): Promise<T>
  write<T>(path: string, data: T): Promise<void>
  delete(path: string): Promise<void>
  list(prefix: string): Promise<string[]>
  exists(path: string): Promise<boolean>
}

/**
 * Database Provider Contract
 * Defines how any database must expose query capabilities
 */
export interface DatabaseProvider {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>
  queryOne<T>(sql: string, params?: unknown[]): Promise<T | null>
  execute(sql: string, params?: unknown[]): Promise<{ rowCount: number }>
  transaction<T>(callback: (tx: DatabaseProvider) => Promise<T>): Promise<T>
}

/**
 * Event Provider Contract
 * Defines how events are emitted and tracked
 */
export interface EventProvider {
  emit(event: string, data: unknown): Promise<void>
  subscribe(event: string, handler: (data: unknown) => Promise<void>): void
  unsubscribe(event: string, handler: (data: unknown) => Promise<void>): void
}

/**
 * AI Provider Contract
 * Defines how any LLM (Claude, GPT, local) must behave
 */
export interface AIProvider {
  generate(prompt: string, options?: AIOptions): Promise<string>
  stream(prompt: string, options?: AIOptions): AsyncIterableIterator<string>
  embedText(text: string): Promise<number[]>
  parseJSON<T>(prompt: string, schema: T): Promise<T>
}

export interface AIOptions {
  temperature?: number
  maxTokens?: number
  model?: string
  tools?: Record<string, unknown>[]
}

/**
 * Logging Provider Contract
 * Defines how any logging system must behave
 */
export interface LoggingProvider {
  debug(message: string, context?: Record<string, unknown>): void
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, error?: Error, context?: Record<string, unknown>): void
}

/**
 * Notification Provider Contract
 * Defines how any notification system must behave
 */
export interface NotificationProvider {
  sendEmail(to: string, subject: string, body: string): Promise<void>
  sendSlack(channel: string, message: string): Promise<void>
  sendPush(userId: string, title: string, body: string): Promise<void>
}
