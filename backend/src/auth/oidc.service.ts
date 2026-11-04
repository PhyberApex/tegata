import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as oidc from 'openid-client'
import { DEFAULT_OIDC_REQUIRED_GROUP } from '../users/guarded-groups'

@Injectable()
export class OidcService {
  private configPromise: Promise<oidc.Configuration> | null = null

  constructor(private config: ConfigService) {}

  private getConfig(): Promise<oidc.Configuration> {
    if (!this.configPromise) {
      const issuer = this.config.getOrThrow<string>('OIDC_ISSUER')
      const clientId = this.config.getOrThrow<string>('OIDC_CLIENT_ID')
      const clientSecret = this.config.getOrThrow<string>('OIDC_CLIENT_SECRET')

      this.configPromise = oidc.discovery(new URL(issuer), clientId, clientSecret, oidc.ClientSecretBasic(clientSecret))
    }
    return this.configPromise
  }

  async buildAuthorizationUrl(): Promise<{ url: string, state: string, codeVerifier: string }> {
    const config = await this.getConfig()
    const redirectUri = this.config.getOrThrow<string>('OIDC_REDIRECT_URI')

    const codeVerifier = oidc.randomPKCECodeVerifier()
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier)
    const state = oidc.randomState()

    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: redirectUri,
      scope: 'openid profile email groups',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    })

    return { url: url.href, state, codeVerifier }
  }

  async exchangeCode(
    currentUrl: URL,
    state: string,
    codeVerifier: string,
  ): Promise<{ groups: string[], username: string }> {
    const config = await this.getConfig()

    const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedState: state,
    })

    const claims = tokens.claims()
    const sub = claims?.sub ?? 'unknown'

    const userInfo = await oidc.fetchUserInfo(config, tokens.access_token!, sub)
    const groups = (userInfo.groups as string[] | undefined) ?? []
    const username = (userInfo.preferred_username ?? sub) as string

    return { groups, username }
  }

  getRequiredGroup(): string {
    return this.config.get<string>('OIDC_REQUIRED_GROUP', DEFAULT_OIDC_REQUIRED_GROUP)
  }
}
