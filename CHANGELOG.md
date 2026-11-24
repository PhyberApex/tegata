# Changelog

## [2.1.1](https://github.com/PhyberApex/tegata/compare/v2.1.0...v2.1.1) (2026-11-24)


### Bug Fixes

* **a11y:** associate Edit User and group field labels with their controls ([#215](https://github.com/PhyberApex/tegata/issues/215)) ([28a8705](https://github.com/PhyberApex/tegata/commit/28a87051eb4eaf6fd587951b1a4dea39ca12682e))
* **a11y:** describe username fields and announce a distinct invalid message ([#213](https://github.com/PhyberApex/tegata/issues/213)) ([308db84](https://github.com/PhyberApex/tegata/commit/308db84b51041be929ebb2f09956f1a911bd6d5b))
* **a11y:** raise app colour tokens to WCAG contrast and stop dimming invite cards with opacity ([#211](https://github.com/PhyberApex/tegata/issues/211)) ([a8c5532](https://github.com/PhyberApex/tegata/commit/a8c553207aa21deb9499b39fae77a2df2a5c0a77))
* **a11y:** show why an email failed, and when it was sent, as visible text ([#214](https://github.com/PhyberApex/tegata/issues/214)) ([9dfddf4](https://github.com/PhyberApex/tegata/commit/9dfddf4543f08f11eb169c03a7309d798ea1ece3))
* **access-preview:** match OR-list subjects and skip network-scoped rules in OIDC authorization policies ([#196](https://github.com/PhyberApex/tegata/issues/196)) ([1e9040e](https://github.com/PhyberApex/tegata/commit/1e9040e186f9c9d113dd563b1ae8816b114e4702))
* **access-preview:** match wildcard deny domains the way Authelia does ([#195](https://github.com/PhyberApex/tegata/issues/195)) ([40c4f4e](https://github.com/PhyberApex/tegata/commit/40c4f4e2c90f5b68d625a625c46a1ac38edc39f1))
* **access-preview:** report a configuration.yml YAML error by position only, without the source snippet ([#198](https://github.com/PhyberApex/tegata/issues/198)) ([0d6b643](https://github.com/PhyberApex/tegata/commit/0d6b6439f6d115bce161c53db68de80c6415cf50))
* **access-preview:** surface subjectless grants and an open access_control default_policy ([#197](https://github.com/PhyberApex/tegata/issues/197)) ([69daa7a](https://github.com/PhyberApex/tegata/commit/69daa7a0cea46e2412ce0ae4e35a5021ae1a1ab9))
* **access-preview:** treat an empty deny subject as everyone, substitute {group} only as the leading label, and list one grant per domain ([#200](https://github.com/PhyberApex/tegata/issues/200)) ([0cf885f](https://github.com/PhyberApex/tegata/commit/0cf885f344274e383449539b192d03c52933eea1)), closes [#158](https://github.com/PhyberApex/tegata/issues/158)
* **api:** never surface an empty error message for non-JSON or HTTP/2 error responses ([#206](https://github.com/PhyberApex/tegata/issues/206)) ([0f12c80](https://github.com/PhyberApex/tegata/commit/0f12c8027eec6093a3c5e6484dc56b9c1e004c1e))
* **api:** refuse JSON null in optional DTO fields ([#188](https://github.com/PhyberApex/tegata/issues/188)) ([63f4518](https://github.com/PhyberApex/tegata/commit/63f4518b193640dc3329961a606ea6149e152e30))
* **auth:** honour a NODE_ENV set only in .env for the Secure cookie flag ([#202](https://github.com/PhyberApex/tegata/issues/202)) ([9820585](https://github.com/PhyberApex/tegata/commit/9820585f66f9d8028ed08e5f42e337de5010785c))
* **bundles:** clear a stale modal error when opening the Delete dialog ([#208](https://github.com/PhyberApex/tegata/issues/208)) ([3e7276a](https://github.com/PhyberApex/tegata/commit/3e7276a2e7812ff4393c099a03e936536842ec0d))
* **config:** single-quote the argon2 hash in env_file, since Compose interpolates it ([#175](https://github.com/PhyberApex/tegata/issues/175)) ([b426bba](https://github.com/PhyberApex/tegata/commit/b426bba0efa3a0f08c200ff3ebc591cfe8a132b8))
* **deps:** update dependency nodemailer to v10.6.1 ([#176](https://github.com/PhyberApex/tegata/issues/176)) ([85d7033](https://github.com/PhyberApex/tegata/commit/85d70336875ba0a4b0651d5eab5ec03b083e2b25))
* **deps:** update dependency openid-client to v6.9.1 ([#177](https://github.com/PhyberApex/tegata/issues/177)) ([574c008](https://github.com/PhyberApex/tegata/commit/574c00829aa6d58e2be7dc8814dc984edb23f923))
* **deps:** update dependency vue to v3.5.46 ([#180](https://github.com/PhyberApex/tegata/issues/180)) ([49feeb2](https://github.com/PhyberApex/tegata/commit/49feeb26042285dfbfaec0e3b04e710496ef559c))
* **deps:** update nest monorepo ([#181](https://github.com/PhyberApex/tegata/issues/181)) ([e2342bd](https://github.com/PhyberApex/tegata/commit/e2342bda2ac6860aeca0953f6296fd7ed6363db7))
* **deps:** update vitest monorepo to v5.1.1 ([#137](https://github.com/PhyberApex/tegata/issues/137)) ([db20ad9](https://github.com/PhyberApex/tegata/commit/db20ad96f9b51f5e26502f9b751b7bdbdcda988f))
* **docker:** keep local dev secrets and state out of the image ([#178](https://github.com/PhyberApex/tegata/issues/178)) ([944c383](https://github.com/PhyberApex/tegata/commit/944c3838132f7f45292d176fc25c964b4234595b))
* **groups:** commit a typed or picked group on change so submitting the form never drops it ([#209](https://github.com/PhyberApex/tegata/issues/209)) ([8a53e91](https://github.com/PhyberApex/tegata/commit/8a53e913298157d2cc319518dc0c1ad0b265700e))
* **groups:** keep focus, name each remove button, and give it a 24px target ([#212](https://github.com/PhyberApex/tegata/issues/212)) ([7bb2990](https://github.com/PhyberApex/tegata/commit/7bb29908e81cf79c14390470ea24f3ddab59e113))
* **invites,users:** show the background email outcome after create instead of a stale Send ([#205](https://github.com/PhyberApex/tegata/issues/205)) ([c85b931](https://github.com/PhyberApex/tegata/commit/c85b9315bc7d7420e4d1a56ebe433ee95b93e399))
* **invites:** refuse an invite whose email prefill already belongs to a user ([#193](https://github.com/PhyberApex/tegata/issues/193)) ([60abf91](https://github.com/PhyberApex/tegata/commit/60abf910ea5380bb75e0fc1cfe7e9f1f2e56ef62))
* **modal:** don't close on a text-selection drag released over the backdrop ([#210](https://github.com/PhyberApex/tegata/issues/210)) ([ea3c0f1](https://github.com/PhyberApex/tegata/commit/ea3c0f18dc1db0dc8e9ebfb77cf9faf6767f52f8))
* **profile:** answer 422 instead of 401/500 when a user's stored hash is not argon2 ([#191](https://github.com/PhyberApex/tegata/issues/191)) ([b6944fc](https://github.com/PhyberApex/tegata/commit/b6944fc3e5e95d3d4b6e11f480bce3b15e9f0a98))
* **profile:** pass only displayname and email to updateUser and narrow the PATCH response ([#194](https://github.com/PhyberApex/tegata/issues/194)) ([168cc62](https://github.com/PhyberApex/tegata/commit/168cc62074e1f822ab8b874d94f8c6dc3baa492f))
* **register,reset:** offer a retry when link validation fails instead of calling the link invalid ([#207](https://github.com/PhyberApex/tegata/issues/207)) ([17088c8](https://github.com/PhyberApex/tegata/commit/17088c86fa2514bdfb019cbf8bcb14d41ad8d048))
* **security:** drop upgrade-insecure-requests and HSTS when cookies are not Secure ([#201](https://github.com/PhyberApex/tegata/issues/201)) ([b1236b1](https://github.com/PhyberApex/tegata/commit/b1236b1e6a51f6934778d0e633adbcb2f8da2fe4))
* **site:** keep landing-page version in step with releases and fix compose links ([#185](https://github.com/PhyberApex/tegata/issues/185)) ([243180b](https://github.com/PhyberApex/tegata/commit/243180be6aeabcfaeabb639cf1f94413e9132fd8))
* **status:** report authelia.ok false when the users database is unreadable ([#199](https://github.com/PhyberApex/tegata/issues/199)) ([e9711da](https://github.com/PhyberApex/tegata/commit/e9711dae05561796d4ca593da0ff123c6014b149))
* **users:** keep numeric-looking usernames and values as strings on read ([#189](https://github.com/PhyberApex/tegata/issues/189)) ([2f4cddf](https://github.com/PhyberApex/tegata/commit/2f4cddf9ca5969e4f30dff58f47ea08b552ad0de))
* **users:** register a new user's groups under the write, after the password hash ([#192](https://github.com/PhyberApex/tegata/issues/192)) ([9e620db](https://github.com/PhyberApex/tegata/commit/9e620dbbd078919361d5187e3d8e1f93e438ed05))
* **users:** report a malformed user entry as an unreadable database instead of crashing ([#190](https://github.com/PhyberApex/tegata/issues/190)) ([cbd5721](https://github.com/PhyberApex/tegata/commit/cbd57218e8ca9468ea73c8270899aa02905200ea))
* **users:** send only changed fields when editing a user ([#204](https://github.com/PhyberApex/tegata/issues/204)) ([c441932](https://github.com/PhyberApex/tegata/commit/c4419328d290bfac15fe4275da44da1873454c87))

## [2.1.0](https://github.com/PhyberApex/tegata/compare/v2.0.2...v2.1.0) (2026-11-20)


### Features

* **auth:** refuse to boot on a weak JWT secret or unparseable admin password hash ([#124](https://github.com/PhyberApex/tegata/issues/124)) ([95625db](https://github.com/PhyberApex/tegata/commit/95625db7950bea0b11cf82ec695ab7a24d5db1e4))


### Bug Fixes

* **auth:** re-check OIDC admin sessions against the users database on every request ([#125](https://github.com/PhyberApex/tegata/issues/125)) ([1c8a777](https://github.com/PhyberApex/tegata/commit/1c8a7772e6cbf0b8ea39b917fcbb12320fc88af1))
* **backend:** enable shutdown hooks so SIGTERM stops the container cleanly and closes SQLite ([#130](https://github.com/PhyberApex/tegata/issues/130)) ([56ab3b5](https://github.com/PhyberApex/tegata/commit/56ab3b50bc3699ef1a2d8916c958aa6de63fdf84))
* **backend:** redact tokens and query strings from request logs ([#123](https://github.com/PhyberApex/tegata/issues/123)) ([2038aba](https://github.com/PhyberApex/tegata/commit/2038aba97cb78af0b63c607aaf1d9e66aaee86a7))
* **deps:** update dependency @nestjs/cli to v12.0.13 ([#94](https://github.com/PhyberApex/tegata/issues/94)) ([ba26b64](https://github.com/PhyberApex/tegata/commit/ba26b64874a2e216248500190b183aa5604ad92a))
* **deps:** update dependency @nestjs/throttler to v6.8.0 ([#103](https://github.com/PhyberApex/tegata/issues/103)) ([5c92f33](https://github.com/PhyberApex/tegata/commit/5c92f335f12a4616e34969b594104effd2e7d684))
* **deps:** update dependency @vue/test-utils to v2.6.0 ([#101](https://github.com/PhyberApex/tegata/issues/101)) ([43cde48](https://github.com/PhyberApex/tegata/commit/43cde489d1e3c62a014dd709e41111dcc503b652))
* **deps:** update dependency better-sqlite3 to v13.2.0 ([#99](https://github.com/PhyberApex/tegata/issues/99)) ([fe86d05](https://github.com/PhyberApex/tegata/commit/fe86d05bba7acfdb63345e38c76a49ef854fa342))
* **deps:** update dependency eslint to v10.15.0 ([#97](https://github.com/PhyberApex/tegata/issues/97)) ([8574d6c](https://github.com/PhyberApex/tegata/commit/8574d6c9254a4b0ee0ed20a3440d47dc478b4e72))
* **deps:** update dependency nodemailer to v10.6.0 ([#102](https://github.com/PhyberApex/tegata/issues/102)) ([624ceae](https://github.com/PhyberApex/tegata/commit/624ceaeaedda299d4b95f2a8ec903b72115f326d))
* **deps:** update dependency openid-client to v6.9.0 ([#98](https://github.com/PhyberApex/tegata/issues/98)) ([fc82ea4](https://github.com/PhyberApex/tegata/commit/fc82ea4f3ad430bbd7f1c658d94c5339a7ab47ed))
* **deps:** update dependency vue-router to v5.5.1 ([#95](https://github.com/PhyberApex/tegata/issues/95)) ([c1a6a3f](https://github.com/PhyberApex/tegata/commit/c1a6a3fee99ffaa1c6644de5b34337c31e195ea9))
* **deps:** update docker/dockerfile:1 docker digest to 572cebb ([#106](https://github.com/PhyberApex/tegata/issues/106)) ([23df30f](https://github.com/PhyberApex/tegata/commit/23df30f5c9fb2dc730cc11594eb00e033f0e7f18))
* **deps:** update nest monorepo to v12.5.1 ([#104](https://github.com/PhyberApex/tegata/issues/104)) ([e8fd786](https://github.com/PhyberApex/tegata/commit/e8fd786e937d9617352265388f6b6d0053b4ed3b))
* **deps:** update pnpm to v12.21.0 ([#100](https://github.com/PhyberApex/tegata/issues/100)) ([2f7303a](https://github.com/PhyberApex/tegata/commit/2f7303a0b3c04eb2aae19bf8cf714d6e8800b0df))
* **docker:** default the image to NODE_ENV=production and warn at boot when cookies lack Secure ([#131](https://github.com/PhyberApex/tegata/issues/131)) ([d90f90a](https://github.com/PhyberApex/tegata/commit/d90f90a0c476f3b25e3abed04ca929dc157b73f9))
* **frontend:** clear the page-level error banner when a new load or action starts ([#134](https://github.com/PhyberApex/tegata/issues/134)) ([0a226b2](https://github.com/PhyberApex/tegata/commit/0a226b23941b92294ae319085a197f7ac684ce1e))
* **frontend:** make ModalOverlay an accessible modal dialog with focus management and Escape-to-close ([#135](https://github.com/PhyberApex/tegata/issues/135)) ([6573722](https://github.com/PhyberApex/tegata/commit/6573722c409c9114b4cc85bbfcbc6ba6373c1a8b))
* **health:** stop leaking users database content and report the Unreadable Users Database state ([#122](https://github.com/PhyberApex/tegata/issues/122)) ([b48df85](https://github.com/PhyberApex/tegata/commit/b48df85afb40e70950d7af658c49700a9045a7aa))
* **mail:** support implicit TLS on port 465 and require STARTTLS before sending credentials ([#128](https://github.com/PhyberApex/tegata/issues/128)) ([59f1ba8](https://github.com/PhyberApex/tegata/commit/59f1ba846ff74f424efa66dcfb877bfa979b6797))
* **profile:** reject a blank displayname and trim it on PATCH /api/profile ([#126](https://github.com/PhyberApex/tegata/issues/126)) ([9d173fb](https://github.com/PhyberApex/tegata/commit/9d173fbe3e2f89e669ed0d6eea90bce14850edb8)), closes [#111](https://github.com/PhyberApex/tegata/issues/111)
* **profile:** show the account on file, keep native admins off the profile, and link it from the header ([#136](https://github.com/PhyberApex/tegata/issues/136)) ([c091c4f](https://github.com/PhyberApex/tegata/commit/c091c4f4e2bcf6da3329903f3cf449af2fbbdd57))
* **status:** send authelia.ageHours as null, not Infinity, when the users database cannot be read ([#133](https://github.com/PhyberApex/tegata/issues/133)) ([208e334](https://github.com/PhyberApex/tegata/commit/208e33473c708c87c0f78f216ddc487605e4d04b))
* **users:** enforce unique email addresses across users ([#127](https://github.com/PhyberApex/tegata/issues/127)) ([fb48ebe](https://github.com/PhyberApex/tegata/commit/fb48ebe4965f0fb51969bec7bf53ad0f6d144d14)), closes [#112](https://github.com/PhyberApex/tegata/issues/112)
* **users:** fsync the Authelia Users Database before the rename and remove the tmp file on failure ([#129](https://github.com/PhyberApex/tegata/issues/129)) ([b56c4fd](https://github.com/PhyberApex/tegata/commit/b56c4fd2ee3172786db9861d60acfbeef8b187b8))

## [2.0.2](https://github.com/PhyberApex/tegata/compare/v2.0.1...v2.0.2) (2026-11-16)


### Bug Fixes

* **deps:** update dependency @vitejs/plugin-vue to v6.0.11 ([#92](https://github.com/PhyberApex/tegata/issues/92)) ([5e40c6c](https://github.com/PhyberApex/tegata/commit/5e40c6c427316d0a03bdd79bb875b9f04c19e3d5))
* **deps:** update dependency better-sqlite3 to v13.1.1 ([#90](https://github.com/PhyberApex/tegata/issues/90)) ([4c0654a](https://github.com/PhyberApex/tegata/commit/4c0654a59c683b565ec6f8bcd02c2772debedb44))
* **deps:** update dependency nodemailer to v10.4.0 ([#82](https://github.com/PhyberApex/tegata/issues/82)) ([886285e](https://github.com/PhyberApex/tegata/commit/886285efe945fb3a1bb7ec3bac524a188bae7582))
* **deps:** update dependency nodemailer to v10.5.0 ([#87](https://github.com/PhyberApex/tegata/issues/87)) ([e7ffdf8](https://github.com/PhyberApex/tegata/commit/e7ffdf8d0983f924288876e58088288bcd16a539))
* **deps:** update dependency vite to v8.3.7 ([#85](https://github.com/PhyberApex/tegata/issues/85)) ([105bfab](https://github.com/PhyberApex/tegata/commit/105bfabae9e703ae6aa48db9ced83226b1aad210))
* **deps:** update dependency vite to v8.3.8 ([#89](https://github.com/PhyberApex/tegata/issues/89)) ([02569b7](https://github.com/PhyberApex/tegata/commit/02569b7775acf2c0e88a185c9d51574d7d0659a4))
* **deps:** update dependency vue-router to v5.5.0 ([#88](https://github.com/PhyberApex/tegata/issues/88)) ([1092973](https://github.com/PhyberApex/tegata/commit/10929738cd36fc20091bbe820b810e2b88c1e6d7))
* **deps:** update nest monorepo to v12.4.2 ([#86](https://github.com/PhyberApex/tegata/issues/86)) ([212b3b8](https://github.com/PhyberApex/tegata/commit/212b3b80a06887a0736857c69ee33bbbf249cd02))
* **deps:** update nest monorepo to v12.5.0 ([#93](https://github.com/PhyberApex/tegata/issues/93)) ([f7ab903](https://github.com/PhyberApex/tegata/commit/f7ab903342cc86ecdbef33ca0f0f58e92e9f08bc))
* **deps:** update node.js to 6bd9ab4 ([#84](https://github.com/PhyberApex/tegata/issues/84)) ([b8ce3d9](https://github.com/PhyberApex/tegata/commit/b8ce3d97a9a10864aafa00120c87af3e1f2a74f2))
* **deps:** update pnpm to v12.20.0 ([#91](https://github.com/PhyberApex/tegata/issues/91)) ([69a859d](https://github.com/PhyberApex/tegata/commit/69a859db4c4ec964c83bc7ec4ede01c1d4b2eb01))

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
