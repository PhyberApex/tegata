import { Module } from '@nestjs/common'
import { GroupsService } from './groups.service'

/**
 * The `groups` table, which users, bundles, invites and the access preview all write or read. Its HTTP
 * surface is `GroupsApiModule`, one layer up, because Group Deletion needs `UsersModule` and `UsersModule`
 * needs this one.
 */
@Module({
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
