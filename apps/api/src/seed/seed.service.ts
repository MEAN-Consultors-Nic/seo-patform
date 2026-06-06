import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HOURS_PER_TIER, ClientTier } from '@seo/shared';
import { Client, ClientDocument } from '../modules/clients/client.schema';
import { User, UserDocument } from '../modules/auth/user.schema';

const SEED_CLIENTS: Array<{ name: string; tier: ClientTier; url: string }> = [
  { name: 'American Storage PR', tier: 'A', url: 'https://americanstoragepr.com' },
  { name: 'Buckwaste', tier: 'A', url: 'https://buckwaste.com' },
  { name: 'MBG Logistics', tier: 'A', url: 'https://mbglogistics.com' },
  { name: 'Daly Organics', tier: 'B', url: 'https://dalyorganics.com' },
  { name: 'Smile Design Dental FL', tier: 'B', url: 'https://smiledesigndentalfl.com' },
  { name: 'JP Semi Truck Repair', tier: 'B', url: 'https://jpsemitruckrepair.com' },
  { name: 'Blatt And Tillett', tier: 'B', url: 'https://blattandtillett.com' },
  { name: 'Catalina Sweet Atelier', tier: 'C', url: 'https://catalinasweetatelier.com' },
  { name: 'Central Texas Valet', tier: 'C', url: 'https://centraltexasvalet.com' },
  { name: 'Chocolatta Furniture', tier: 'C', url: 'https://chocolattafurniture.com' },
  { name: 'Food And Drink Styling', tier: 'C', url: 'https://foodanddrinkstyling.com' },
];

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectModel(Client.name) private readonly clientModel: Model<ClientDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async onApplicationBootstrap() {
    const rootUser = await this.userModel.findOne({ role: 'root' }).exec();

    const count = await this.clientModel.countDocuments().exec();
    if (count === 0) {
      this.logger.log(`Seeding ${SEED_CLIENTS.length} clients...`);
      await this.clientModel.insertMany(
        SEED_CLIENTS.map((c) => ({
          ...c,
          ownerId: rootUser?._id,
          hoursPerCycle: HOURS_PER_TIER[c.tier],
          contacts: [],
          access: {},
          active: true,
        })),
      );
      this.logger.log('Seed completed');
    }

    // Backfill: ensure every existing client without an owner gets assigned to root.
    if (rootUser) {
      const result = await this.clientModel
        .updateMany(
          { $or: [{ ownerId: { $exists: false } }, { ownerId: null }] },
          { $set: { ownerId: rootUser._id } },
        )
        .exec();
      if (result.modifiedCount > 0) {
        this.logger.log(
          `Backfilled ownerId on ${result.modifiedCount} legacy clients -> root user`,
        );
      }
    }
  }
}
