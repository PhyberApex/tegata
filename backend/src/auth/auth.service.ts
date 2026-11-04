import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as argon2 from 'argon2'
import { sign, verify } from 'jsonwebtoken'
import { NativeLoginMetrics } from '../metrics/native-login-metrics'
import { NativeLoginFence } from './native-login-fence'

export interface AuthTokenPayload {
  role: 'admin' | 'self'
  sub?: string
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)
  private readonly passwordHash: string
  private readonly jwtSecret: string

  constructor(
    private config: ConfigService,
    private nativeLogins: NativeLoginMetrics,
    private fence: NativeLoginFence,
  ) {
    this.passwordHash = this.config.getOrThrow<string>('TEGATA_ADMIN_PASSWORD_HASH')
    this.jwtSecret = this.config.getOrThrow<string>('TEGATA_JWT_SECRET')
  }

  async validatePassword(password: string): Promise<boolean> {
    return argon2.verify(this.passwordHash, password)
  }

  /**
   * Native shared-password login — the break-glass path (ADR-0004).
   * `sourceAddress` is the caller's address; a caller outside the Break-Glass
   * Fence is refused before the password is looked at, so the endpoint tells
   * an outside caller nothing about the password.
   */
  async login(password: string, sourceAddress: string | undefined): Promise<string> {
    if (!this.fence.admits(sourceAddress)) {
      this.logger.warn(`Native login refused — ${sourceAddress ?? 'unknown address'} is outside the trusted networks`)
      throw new ForbiddenException('Password login is only available from a trusted network')
    }

    const valid = await this.validatePassword(password)
    if (!valid) {
      this.logger.warn(`Native login failed — bad password from ${sourceAddress}`)
      throw new UnauthorizedException('Invalid password')
    }

    this.nativeLogins.record()
    this.logger.warn(`Native (break-glass) login successful from ${sourceAddress}`)
    return sign({ role: 'admin' }, this.jwtSecret, { expiresIn: '24h' })
  }

  verifyToken(token: string): AuthTokenPayload {
    try {
      return verify(token, this.jwtSecret) as AuthTokenPayload
    }
    catch {
      this.logger.warn('Token verification failed')
      throw new UnauthorizedException('Invalid or expired token')
    }
  }

  loginWithOidc(username: string, isAdmin: boolean): string {
    const role: AuthTokenPayload['role'] = isAdmin ? 'admin' : 'self'
    this.logger.log(`OIDC login successful for ${username} (role: ${role})`)
    return sign({ role, sub: username }, this.jwtSecret, { expiresIn: '24h' })
  }
}
