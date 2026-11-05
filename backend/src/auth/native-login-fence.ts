import type { TrustedNetwork } from './trusted-network'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DEFAULT_TRUSTED_NETWORKS, isTrustedNetworkAddress, parseTrustedNetworks } from './trusted-network'

/**
 * The Break-Glass Fence as a provider: the trusted networks `NATIVE_LOGIN_CIDRS`
 * names, read once at boot so a malformed entry fails the boot rather than a
 * login, and asked the same question by the login endpoint and by
 * `GET /api/auth/methods`.
 */
@Injectable()
export class NativeLoginFence {
  private readonly networks: readonly TrustedNetwork[]

  constructor(config: ConfigService) {
    this.networks = parseTrustedNetworks(config.get<string>('NATIVE_LOGIN_CIDRS', DEFAULT_TRUSTED_NETWORKS))
  }

  admits(address: string | undefined): boolean {
    return isTrustedNetworkAddress(address, this.networks)
  }
}
