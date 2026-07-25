/**
 * Supabase Auth Provider Implementation
 * Concrete implementation of AuthProvider interface
 * Can be swapped with Auth0Auth or OAuthProvider
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  AuthProvider,
  AuthCredentials,
  AuthSession,
  AuthUser,
} from '../../core/interfaces'

export class SupabaseAuth implements AuthProvider {
  constructor(private client: SupabaseClient) {}

  async authenticate(credentials: AuthCredentials): Promise<AuthSession> {
    // OAuth flow
    if (credentials.provider) {
      const { data, error } = await this.client.auth.signInWithOAuth({
        provider: credentials.provider as any,
      })
      if (error) throw new Error(`OAuth failed: ${error.message}`)
      if (!data.session) throw new Error('No session returned')
      return this.sessionToAuthSession(data.session)
    }

    // Email/password flow
    if (credentials.email && credentials.password) {
      const { data, error } = await this.client.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      })
      if (error) throw new Error(`Auth failed: ${error.message}`)
      if (!data.session) throw new Error('No session returned')
      return this.sessionToAuthSession(data.session)
    }

    throw new Error('Invalid credentials')
  }

  async validateToken(token: string): Promise<boolean> {
    const { data, error } = await this.client.auth.getUser(token)
    return !error && !!data.user
  }

  async refreshToken(token: string): Promise<string> {
    const { data, error } = await this.client.auth.refreshSession({
      refresh_token: token,
    })
    if (error) throw new Error(`Refresh failed: ${error.message}`)
    if (!data.session) throw new Error('No session returned')
    return data.session.access_token
  }

  async revokeToken(token: string): Promise<void> {
    const { error } = await this.client.auth.signOut()
    if (error) throw new Error(`Revoke failed: ${error.message}`)
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    const { data, error } = await this.client.auth.getUser()
    if (error || !data.user) return null
    return this.userToAuthUser(data.user)
  }

  private sessionToAuthSession(session: any): AuthSession {
    return {
      userId: session.user.id,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: new Date(session.expires_at * 1000),
      user: this.userToAuthUser(session.user),
    }
  }

  private userToAuthUser(user: any): AuthUser {
    return {
      id: user.id,
      email: user.email,
      role: user.user_metadata?.role ?? 'member',
      metadata: user.user_metadata,
    }
  }
}

/**
 * Factory function to create Supabase auth provider
 */
export function createSupabaseAuth(): AuthProvider {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_KEY
  if (!url || !key) throw new Error('Missing Supabase credentials')
  const client = createClient(url, key)
  return new SupabaseAuth(client)
}
