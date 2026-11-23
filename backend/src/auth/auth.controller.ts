import type { AuthCheck } from '@tegata/shared'
import type { Request, Response } from 'express'
import { Body, Controller, Get, Logger, Post, Req, Res, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Throttle } from '@nestjs/throttler'
import { IsString } from 'class-validator'
import { cookiesAreSecure } from '../config/secure-cookies'
import { usernamePatternSource } from '../config/username-pattern'
import { AdminAccountCheck } from './admin-account-check'
import { AuthService } from './auth.service'
import { NativeLoginFence } from './native-login-fence'
import { OidcService } from './oidc.service'

class LoginDto {
  @IsString()
  password!: string
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name)

  constructor(
    private authService: AuthService,
    private oidcService: OidcService,
    private fence: NativeLoginFence,
    private config: ConfigService,
    private adminAccountCheck: AdminAccountCheck,
  ) {}

  /**
   * Resolved per request through ConfigService: this module is imported before ConfigModule.forRoot()
   * copies .env into the environment, so a NODE_ENV read at import would miss one set only in .env.
   */
  private cookieBase() {
    return {
      httpOnly: true,
      secure: cookiesAreSecure(this.config.get<string>('NODE_ENV')),
    } as const
  }

  /**
   * Which login doors this caller is offered. SSO is always one; native
   * password login is only offered inside the Break-Glass Fence, so the login
   * card never has to guess at its own address (ADR-0004). Also carries the
   * configured SITE_NAME, the one unauthenticated call the SPA makes pre-login.
   */
  @Get('methods')
  methods(@Req() req: Request) {
    return {
      nativePasswordLogin: this.fence.admits(req.ip),
      usernamePattern: usernamePatternSource(),
      siteName: this.config.get<string>('SITE_NAME', 'Tegata') || 'Tegata',
    }
  }

  @Post('login')
  @Throttle({
    default: { ttl: 60_000, limit: 5 },
  })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // `req.ip` under the proxy trust configureApp sets from TRUST_PROXY — no
    // header is parsed by hand.
    const token = await this.authService.login(dto.password, req.ip)

    res.cookie('tegata_token', token, {
      ...this.cookieBase(),
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    })

    return { success: true }
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('tegata_token')
    return { success: true }
  }

  /**
   * Re-checks an OIDC admin session the same way `AuthGuard` does, so the SPA's router guard sends a
   * revoked admin to the login page instead of rendering a shell whose every call answers 401. `username`
   * is the token's `sub`, `null` for a Native Login session, which has no account to show a profile for.
   */
  @Get('check')
  check(@Req() req: Request): AuthCheck {
    const token = req.cookies?.tegata_token
    if (!token) {
      throw new UnauthorizedException('Not authenticated')
    }

    const payload = this.authService.verifyToken(token)
    this.adminAccountCheck.assertStillAdmin(payload, 'Auth check')
    return { authenticated: true, role: payload.role, username: payload.sub ?? null }
  }

  @Get('oidc/login')
  async oidcLogin(@Res() res: Response) {
    try {
      const { url, state, codeVerifier } = await this.oidcService.buildAuthorizationUrl()

      res.cookie('oidc_state', JSON.stringify({ state, codeVerifier }), {
        ...this.cookieBase(),
        sameSite: 'lax',
        maxAge: 10 * 60 * 1000,
      })

      return res.redirect(url)
    }
    catch (err) {
      this.logger.error('OIDC login initiation failed', err)
      return res.redirect('/login?error=sso_failed')
    }
  }

  @Get('oidc/callback')
  async oidcCallback(@Req() req: Request, @Res() res: Response) {
    const raw = req.cookies?.oidc_state
    res.clearCookie('oidc_state')

    if (!raw)
      return res.redirect('/login?error=sso_failed')

    try {
      const { state, codeVerifier } = JSON.parse(raw) as { state: string, codeVerifier: string }

      // redirect_uri sent to the token endpoint is derived from this URL, so
      // build it from config rather than the Host header / proxy headers.
      const currentUrl = new URL(this.config.getOrThrow<string>('OIDC_REDIRECT_URI'))
      currentUrl.search = new URL(req.originalUrl, 'http://placeholder').search

      const { groups, username } = await this.oidcService.exchangeCode(currentUrl, state, codeVerifier)
      this.logger.debug(`User: ${username}`)
      this.logger.debug(`Groups: ${JSON.stringify(groups)}`)
      const isAdmin = groups.includes(this.oidcService.getRequiredGroup())

      const token = this.authService.loginWithOidc(username, isAdmin)
      res.cookie('tegata_token', token, {
        ...this.cookieBase(),
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000,
      })

      return res.redirect('/')
    }
    catch (err) {
      this.logger.error('OIDC callback failed', err)
      return res.redirect('/login?error=sso_failed')
    }
  }
}
