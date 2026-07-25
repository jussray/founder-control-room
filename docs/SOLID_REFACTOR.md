# SOLID Principles Refactor - Founder Control Room

## Overview

This refactor introduces proper separation of concerns and dependency inversion principles to the Founder Control Room, making it easier to:

- Swap providers (GitHub ↔ GitLab, Supabase ↔ PostgreSQL)
- Test code in isolation with mock providers
- Add new features without breaking existing code
- Understand which code depends on what

## SOLID Principles Applied

### 1. Single Responsibility Principle (SRP)

**Each class has one reason to change:**

```typescript
// ✗ BAD: Multiple responsibilities
class GithubAndSupabase {
  authenticate() { } // Auth responsibility
  listPullRequests() { } // Repository responsibility
}

// ✓ GOOD: Single responsibility
class SupabaseAuth implements AuthProvider {
  authenticate() { }
}

class GitHubRepository implements RepositoryProvider {
  listPullRequests() { }
}
```

### 2. Open/Closed Principle (OCP)

**Code is open for extension, closed for modification:**

```typescript
// ✗ BAD: Must modify main code to support new auth
if (authType === 'supabase') {
  auth = new SupabaseAuth()
} else if (authType === 'auth0') {
  auth = new Auth0Auth()
}

// ✓ GOOD: New auth types don't require changes
interface AuthProvider {
  authenticate(credentials): Promise<Session>
}

// Add new provider by implementing interface
class Auth0Auth implements AuthProvider {
  authenticate(credentials) { /* ... */ }
}
```

### 3. Liskov Substitution Principle (LSP)

**Any implementation of a provider can be used interchangeably:**

```typescript
// All these are interchangeable
const auth1: AuthProvider = new SupabaseAuth(client)
const auth2: AuthProvider = new Auth0Auth(client)
const auth3: AuthProvider = new MockAuth() // for testing

// Same code works with any implementation
await auth.authenticate(credentials) // Works for all!
```

### 4. Interface Segregation Principle (ISP)

**Clients depend only on the methods they use:**

```typescript
// ✗ BAD: Fat interface with methods you don't use
interface Gigantic {
  authenticate()
  listRepos()
  createDatabase()
  sendEmail()
  deployServer()
}

// ✓ GOOD: Segregated interfaces
interface AuthProvider {
  authenticate()
}

interface RepositoryProvider {
  listRepos()
}

interface NotificationProvider {
  sendEmail()
}
```

### 5. Dependency Inversion Principle (DIP)

**Depend on abstractions (interfaces), not concrete implementations:**

```typescript
// ✗ BAD: Depends on concrete class
class MissionEngine {
  private auth = new SupabaseAuth() // Hard dependency
  
  async launch() {
    await this.auth.authenticate(...)
  }
}

// ✓ GOOD: Depends on interface, injected at runtime
class MissionEngine {
  constructor(private auth: AuthProvider) {} // Injected
  
  async launch() {
    await this.auth.authenticate(...)
  }
}

// Usage
const auth = new SupabaseAuth()
const engine = new MissionEngine(auth)

// Easy to swap:
const mockAuth = new MockAuth()
const testEngine = new MissionEngine(mockAuth)
```

## Architecture

```
┌─────────────────────────────────────────┐
│   Business Logic (MissionEngine, etc.)  │
│   Depends on INTERFACES only            │
└──────────┬──────────────────────────────┘
           │
           │ depends on
           ▼
┌─────────────────────────────────────────┐
│   Provider Interfaces                   │
│   - AuthProvider                        │
│   - RepositoryProvider                  │
│   - StorageProvider                     │
│   - DatabaseProvider                    │
└──────────┬──────────────────────────────┘
           │
           │ implements
           ▼
┌─────────────────────────────────────────┐
│   Concrete Providers                    │
│   - SupabaseAuth                        │
│   - GitHubRepository                    │
│   - PostgresDatabase                    │
│   (Easy to swap/add new ones)           │
└─────────────────────────────────────────┘
```

## Service Container

The `ServiceContainer` implements dependency injection:

```typescript
// Setup (once at app start)
const container = new ServiceContainer()
container.register('auth', () => new SupabaseAuth(), { singleton: true })
container.register('repository', () => new GitHubRepository(), { singleton: true })

// Usage (anywhere in your app)
const auth = container.getAuth()
const repo = container.getRepository()

// Swap providers (just change registration, no code changes)
container.register('auth', () => new Auth0Auth(), { singleton: true })
// All code using container.getAuth() now uses Auth0!
```

## Migration Guide

### Step 1: Update your service registration

```typescript
// src/app-setup.ts
import { setupServices } from './app-setup'

app.listen(3000, () => {
  setupServices()
  console.log('Services registered')
})
```

### Step 2: Use container instead of direct imports

```typescript
// BEFORE
import { supabaseClient } from './lib/supabase'
import { octokit } from './lib/github'

// AFTER
import { container } from './core/container'

const auth = container.getAuth()
const repo = container.getRepository()
```

### Step 3: Inject dependencies in classes

```typescript
// BEFORE
class MissionEngine {
  async launch() {
    const auth = container.getAuth() // Late binding
  }
}

// BETTER
class MissionEngine {
  constructor(private auth: AuthProvider) {}
  
  async launch() {
    await this.auth.authenticate(...)
  }
}

// Usage
const auth = container.getAuth()
const engine = new MissionEngine(auth)
```

## Testing

```typescript
// src/test/mocks/MockAuth.ts
import { AuthProvider, AuthSession } from '../../core/interfaces'

export class MockAuth implements AuthProvider {
  async authenticate(): Promise<AuthSession> {
    return {
      userId: 'test-user',
      accessToken: 'test-token',
      expiresAt: new Date(Date.now() + 3600000),
      user: {
        id: 'test-user',
        email: 'test@example.com',
        role: 'admin',
      },
    }
  }

  async validateToken(): Promise<boolean> {
    return true
  }

  // ... implement other methods
}

// Usage in tests
const mockAuth = new MockAuth()
const engine = new MissionEngine(mockAuth)
await engine.launch() // Predictable behavior!
```

## Files Added

- `src/core/interfaces/Provider.interface.ts` - All provider contracts
- `src/core/interfaces/index.ts` - Interface exports
- `src/core/container/ServiceContainer.ts` - Dependency injection
- `src/core/container/index.ts` - Container exports
- `src/providers/auth/SupabaseAuth.ts` - Supabase implementation
- `src/providers/repository/GitHubRepository.ts` - GitHub implementation
- `src/app-setup.ts` - Service registration
- `docs/SOLID_REFACTOR.md` - This file

## Next Steps

1. ✅ Auth & Repository providers implemented
2. 🔲 Database provider (Supabase)
3. 🔲 Storage provider (S3/Supabase Storage)
4. 🔲 Event provider (Redis/RabbitMQ)
5. 🔲 AI provider (Claude/GPT)
6. 🔲 Logging provider
7. 🔲 Notification provider
8. 🔲 Migrate existing code to use providers
9. 🔲 Add mock providers for testing
10. 🔲 Update CI/CD to validate provider contracts

## Questions?

Refer to:
- `src/app-setup.ts` for usage examples
- `src/providers/` for implementation examples
- `src/core/interfaces/` for available contracts
