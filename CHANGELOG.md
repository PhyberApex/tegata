# Changelog

## [2.0.2](https://github.com/PhyberApex/tegata/compare/v2.0.1...v2.0.2) (2026-11-14)


### Bug Fixes

* **deps:** update dependency nodemailer to v10.4.0 ([#82](https://github.com/PhyberApex/tegata/issues/82)) ([886285e](https://github.com/PhyberApex/tegata/commit/886285efe945fb3a1bb7ec3bac524a188bae7582))
* **deps:** update dependency nodemailer to v10.5.0 ([#87](https://github.com/PhyberApex/tegata/issues/87)) ([e7ffdf8](https://github.com/PhyberApex/tegata/commit/e7ffdf8d0983f924288876e58088288bcd16a539))
* **deps:** update dependency vite to v8.3.7 ([#85](https://github.com/PhyberApex/tegata/issues/85)) ([105bfab](https://github.com/PhyberApex/tegata/commit/105bfabae9e703ae6aa48db9ced83226b1aad210))
* **deps:** update dependency vite to v8.3.8 ([#89](https://github.com/PhyberApex/tegata/issues/89)) ([02569b7](https://github.com/PhyberApex/tegata/commit/02569b7775acf2c0e88a185c9d51574d7d0659a4))
* **deps:** update dependency vue-router to v5.5.0 ([#88](https://github.com/PhyberApex/tegata/issues/88)) ([1092973](https://github.com/PhyberApex/tegata/commit/10929738cd36fc20091bbe820b810e2b88c1e6d7))
* **deps:** update nest monorepo to v12.4.2 ([#86](https://github.com/PhyberApex/tegata/issues/86)) ([212b3b8](https://github.com/PhyberApex/tegata/commit/212b3b80a06887a0736857c69ee33bbbf249cd02))
* **deps:** update node.js to 6bd9ab4 ([#84](https://github.com/PhyberApex/tegata/issues/84)) ([b8ce3d9](https://github.com/PhyberApex/tegata/commit/b8ce3d97a9a10864aafa00120c87af3e1f2a74f2))

## [2.0.1](https://github.com/PhyberApex/tegata/compare/v2.0.0...v2.0.1) (2026-11-10)


### Bug Fixes

* **deps:** update dependency @swc/core to v1.16.22 ([#77](https://github.com/PhyberApex/tegata/issues/77)) ([a84c0b5](https://github.com/PhyberApex/tegata/commit/a84c0b579861d1b12beceec89168f5866495d3d5))
* **deps:** update dependency vite to v8.3.6 ([#78](https://github.com/PhyberApex/tegata/issues/78)) ([f83a72d](https://github.com/PhyberApex/tegata/commit/f83a72df0e7f5a23fe183d433d7f96d7835a68f4))
* **deps:** update dependency vue to v3.5.45 ([#79](https://github.com/PhyberApex/tegata/issues/79)) ([71356e5](https://github.com/PhyberApex/tegata/commit/71356e5268c7623131c74e1aa4283789746694d4))
* **deps:** update nest monorepo ([#72](https://github.com/PhyberApex/tegata/issues/72)) ([d96c8bd](https://github.com/PhyberApex/tegata/commit/d96c8bd9474c9a1f68b0bbdd343077e5a4b99cb9))
* **deps:** update nest monorepo ([#80](https://github.com/PhyberApex/tegata/issues/80)) ([dc254e0](https://github.com/PhyberApex/tegata/commit/dc254e05514d82461dad7c50e43a2939e1ae5ff1))
* **deps:** update pnpm to v12.18.0 ([#76](https://github.com/PhyberApex/tegata/issues/76)) ([7913f05](https://github.com/PhyberApex/tegata/commit/7913f05da707ff54ede95b02c4d3abede001761d))
* **docker:** probe 127.0.0.1 in HEALTHCHECK to match default HOST ([#75](https://github.com/PhyberApex/tegata/issues/75)) ([53a79f2](https://github.com/PhyberApex/tegata/commit/53a79f2aaa52fad5f41d2c8e1aa6543c653941da))

## [2.0.0](https://github.com/PhyberApex/tegata/compare/v1.0.1...v2.0.0) (2026-11-07)


### ⚠ BREAKING CHANGES

* **backend:** require or derive PUBLIC_URL when SMTP_HOST is set ([#49](https://github.com/PhyberApex/tegata/issues/49))
* **backend:** GET /api/status was unauthenticated and always on. It now returns 404 unless STATUS_ENDPOINT_TOKEN is set, and then requires Authorization: Bearer <token> (or ?token=), else 401. Set the variable and update your dashboard widget to keep using the endpoint. Response shape is unchanged.

### Features

* add SITE_NAME to brand emails, login page and tab title ([#46](https://github.com/PhyberApex/tegata/issues/46)) ([aaf7bc0](https://github.com/PhyberApex/tegata/commit/aaf7bc0d15e1c0ef3db2041173596427bd7312e9))
* **auth:** support IPv6 CIDRs in NATIVE_LOGIN_CIDRS ([#45](https://github.com/PhyberApex/tegata/issues/45)) ([a12da9c](https://github.com/PhyberApex/tegata/commit/a12da9c99ace050df82f229c68c8f0ce3cbafee9))
* **backend:** gate /api/status behind STATUS_ENDPOINT_TOKEN ([#47](https://github.com/PhyberApex/tegata/issues/47)) ([e5b4661](https://github.com/PhyberApex/tegata/commit/e5b466169adcabd34d9937cf1241dea7b96ca8a9))
* **backend:** make argon2id parameters configurable ([#52](https://github.com/PhyberApex/tegata/issues/52)) ([8de5e18](https://github.com/PhyberApex/tegata/commit/8de5e18a5f57a5cff22ba3f9797550ec1cacacbe))
* **backend:** make listen port and bind address configurable (PORT, HOST) ([#42](https://github.com/PhyberApex/tegata/issues/42)) ([1d707d2](https://github.com/PhyberApex/tegata/commit/1d707d2478ff806e9110548130fbcfaaf591d503))
* **backend:** make proxy trust configurable via TRUST_PROXY ([#44](https://github.com/PhyberApex/tegata/issues/44)) ([f0aa950](https://github.com/PhyberApex/tegata/commit/f0aa950a010509a092c3d15a599ff6e775e31888))
* **backend:** require or derive PUBLIC_URL when SMTP_HOST is set ([#49](https://github.com/PhyberApex/tegata/issues/49)) ([f57cfb3](https://github.com/PhyberApex/tegata/commit/f57cfb3f89768aa6e13e97f75fc290e2b2d2d317))
* validate usernames with a documented, overridable pattern ([#50](https://github.com/PhyberApex/tegata/issues/50)) ([cad5d31](https://github.com/PhyberApex/tegata/commit/cad5d31342d5f8c387aea4f20b4e297fb0da3b6b))


### Bug Fixes

* **auth:** use client_secret_post for the OIDC token endpoint ([#41](https://github.com/PhyberApex/tegata/issues/41)) ([d2d7d11](https://github.com/PhyberApex/tegata/commit/d2d7d11c8f19974c2746fc033bb54173f2609d90))
* **backend:** build OIDC callback URL from OIDC_REDIRECT_URI, not the Host header ([#58](https://github.com/PhyberApex/tegata/issues/58)) ([5b99551](https://github.com/PhyberApex/tegata/commit/5b995513f0f1840705eec698fccaca7b80c126c0)), closes [#31](https://github.com/PhyberApex/tegata/issues/31)
* **backend:** create the users file 0600 instead of umask permissions ([#66](https://github.com/PhyberApex/tegata/issues/66)) ([d203b4b](https://github.com/PhyberApex/tegata/commit/d203b4b03369e4f1544f7d639c5bad6e1cdeb5f4))
* **backend:** don't cache a failed OIDC discovery ([#56](https://github.com/PhyberApex/tegata/issues/56)) ([a45862d](https://github.com/PhyberApex/tegata/commit/a45862df0e396ca89fc6f0ff3d37bd4dd449c53a))
* **backend:** don't flag a fresh install as an out-of-band edit ([#59](https://github.com/PhyberApex/tegata/issues/59)) ([7e68d9c](https://github.com/PhyberApex/tegata/commit/7e68d9c6fccb298cbb5796f0830d64c0f4129f58))
* **backend:** label HTTP metrics with the templated route, not the raw path ([#57](https://github.com/PhyberApex/tegata/issues/57)) ([198ee79](https://github.com/PhyberApex/tegata/commit/198ee79cceaed558cb6916108dd8bbccb6e3b6fa))
* **backend:** look up users by own key, not Object.prototype members ([#61](https://github.com/PhyberApex/tegata/issues/61)) ([0d51167](https://github.com/PhyberApex/tegata/commit/0d51167f705a8a63b73d0d8300e7a450f69c007e))
* **backend:** model allow rules with an OR-list of groups in Access Preview ([#69](https://github.com/PhyberApex/tegata/issues/69)) ([1d9fb07](https://github.com/PhyberApex/tegata/commit/1d9fb070c631f0c02e842e8f86a32c0cf7bc0aee))
* **backend:** reject blank names, displaynames and group entries ([#62](https://github.com/PhyberApex/tegata/issues/62)) ([01a5510](https://github.com/PhyberApex/tegata/commit/01a5510ea4af3de86c6d5d2befd72c41130bf419))
* **backend:** return 404 for unknown /api GETs instead of the SPA index ([#64](https://github.com/PhyberApex/tegata/issues/64)) ([bb7025a](https://github.com/PhyberApex/tegata/commit/bb7025a24e202afbd523486353f01d6b57d0d3dc))
* **deps:** update dependency argon2 to v0.45.2 ([#70](https://github.com/PhyberApex/tegata/issues/70)) ([7acb11c](https://github.com/PhyberApex/tegata/commit/7acb11c26ea0928e84910be0181645f1a9332def))
* **deps:** update dependency openid-client to v6.8.9 ([#8](https://github.com/PhyberApex/tegata/issues/8)) ([4d22f8f](https://github.com/PhyberApex/tegata/commit/4d22f8fbae6b3f448eab81676afaf9946cd54f1a))
* **deps:** update node.js to 8996bb5 ([#60](https://github.com/PhyberApex/tegata/issues/60)) ([86a71fa](https://github.com/PhyberApex/tegata/commit/86a71fafaf28ba1a8d86a800a92a7a4d20313139))
* **deps:** update node.js to v26 ([#9](https://github.com/PhyberApex/tegata/issues/9)) ([dbb4c2f](https://github.com/PhyberApex/tegata/commit/dbb4c2f24db61417bc97250a42de876b22945ea0))
* **deps:** update pnpm to v12.17.0 ([#71](https://github.com/PhyberApex/tegata/issues/71)) ([d16bebb](https://github.com/PhyberApex/tegata/commit/d16bebb98cfee35dbc0a1a0936eb25607fb75dfe))
* **deps:** update vitest monorepo to v5.1.0 ([#43](https://github.com/PhyberApex/tegata/issues/43)) ([76ebfc8](https://github.com/PhyberApex/tegata/commit/76ebfc8b0bc133d64032d71a43fca25747fdec74))
* **frontend:** clear the shared modal error when opening the Delete User dialog ([#67](https://github.com/PhyberApex/tegata/issues/67)) ([696c1c6](https://github.com/PhyberApex/tegata/commit/696c1c6189192c22c8e3a4efb9ab76845cde9863))
* **frontend:** end the session and go to /login on an expired-session 401 ([#65](https://github.com/PhyberApex/tegata/issues/65)) ([c4b6e7f](https://github.com/PhyberApex/tegata/commit/c4b6e7fe0fcd8cc6975b31337fe8cda895a752f8))

## [1.0.1](https://github.com/PhyberApex/tegata/compare/v1.0.0...v1.0.1) (2026-11-05)


### Bug Fixes

* **deps:** pin dependencies ([#2](https://github.com/PhyberApex/tegata/issues/2)) ([ecc9edb](https://github.com/PhyberApex/tegata/commit/ecc9edbcc50549062f122504d18bee65cf27cfa2))
* **deps:** update dependency @swc/core to v1.16.21 ([#3](https://github.com/PhyberApex/tegata/issues/3)) ([adb64a4](https://github.com/PhyberApex/tegata/commit/adb64a4f9702230181d6ed5941c1f5000499559e))
* **deps:** update dependency js-yaml to v5 ([#6](https://github.com/PhyberApex/tegata/issues/6)) ([dab2ab7](https://github.com/PhyberApex/tegata/commit/dab2ab74639bf9fc6992ba7d68e714e360cf4025))

## 1.0.0 (2026-11-04)


### Features

* tegata, an admin UI for Authelia's file user backend ([d49c5f1](https://github.com/PhyberApex/tegata/commit/d49c5f1b1d3cb34588542694ca2f82d4b6efc319))
