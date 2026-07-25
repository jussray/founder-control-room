/**
 * Service Container - Dependency Injection
 * Implements Dependency Inversion Principle (DIP)
 * All dependencies are injected, not hardcoded
 */

import {
  AuthProvider,
  RepositoryProvider,
  StorageProvider,
  DatabaseProvider,
  EventProvider,
  AIProvider,
  LoggingProvider,
  NotificationProvider,
} from '../interfaces'

type ServiceKey = 
  | 'auth' 
  | 'repository' 
  | 'storage' 
  | 'database' 
  | 'event' 
  | 'ai' 
  | 'logging' 
  | 'notification'

interface ServiceDefinition {
  factory: () => unknown
  singleton: boolean
  instance?: unknown
}

/**
 * ServiceContainer manages dependency registration and resolution
 * Follows Dependency Inversion Principle: depend on abstractions, not concrete implementations
 */
export class ServiceContainer {
  private services: Map<ServiceKey, ServiceDefinition> = new Map()
  private singletons: Map<ServiceKey, unknown> = new Map()

  /**
   * Register a service factory
   * @param key - Service identifier
   * @param factory - Function that creates the service
   * @param singleton - Whether to reuse the same instance
   */
  register<T>(
    key: ServiceKey,
    factory: () => T,
    options: { singleton?: boolean } = {}
  ): void {
    this.services.set(key, {
      factory: factory as () => unknown,
      singleton: options.singleton ?? true,
    })
  }

  /**
   * Register a concrete instance (pre-constructed)
   */
  registerInstance<T>(key: ServiceKey, instance: T): void {
    this.singletons.set(key, instance)
  }

  /**
   * Resolve a service
   * Returns cached singleton or creates new instance
   */
  resolve<T>(key: ServiceKey): T {
    // Check if already instantiated
    if (this.singletons.has(key)) {
      return this.singletons.get(key) as T
    }

    const definition = this.services.get(key)
    if (!definition) {
      throw new Error(`Service '${key}' not registered`)
    }

    const instance = definition.factory() as T

    // Cache if singleton
    if (definition.singleton) {
      this.singletons.set(key, instance)
    }

    return instance
  }

  /**
   * Get auth provider
   */
  getAuth(): AuthProvider {
    return this.resolve<AuthProvider>('auth')
  }

  /**
   * Get repository provider
   */
  getRepository(): RepositoryProvider {
    return this.resolve<RepositoryProvider>('repository')
  }

  /**
   * Get storage provider
   */
  getStorage(): StorageProvider {
    return this.resolve<StorageProvider>('storage')
  }

  /**
   * Get database provider
   */
  getDatabase(): DatabaseProvider {
    return this.resolve<DatabaseProvider>('database')
  }

  /**
   * Get event provider
   */
  getEvent(): EventProvider {
    return this.resolve<EventProvider>('event')
  }

  /**
   * Get AI provider
   */
  getAI(): AIProvider {
    return this.resolve<AIProvider>('ai')
  }

  /**
   * Get logging provider
   */
  getLogging(): LoggingProvider {
    return this.resolve<LoggingProvider>('logging')
  }

  /**
   * Get notification provider
   */
  getNotification(): NotificationProvider {
    return this.resolve<NotificationProvider>('notification')
  }

  /**
   * Clear all cached singletons
   * Useful for testing
   */
  clear(): void {
    this.singletons.clear()
  }
}

/**
 * Global singleton container
 */
export const container = new ServiceContainer()
