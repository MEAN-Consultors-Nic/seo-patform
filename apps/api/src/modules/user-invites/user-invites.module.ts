import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserInvite, UserInviteSchema } from './user-invite.schema';
import { UserInvitesService } from './user-invites.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserInvite.name, schema: UserInviteSchema },
    ]),
  ],
  providers: [UserInvitesService],
  exports: [UserInvitesService],
})
export class UserInvitesModule {}
