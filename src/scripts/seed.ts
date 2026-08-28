import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Initializing database...');

  try {
    // Test connection
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connection successful');

    // Seed test user
    const testUser = await prisma.user.upsert({
      where: { memberId: 'TEST-001' },
      update: {},
      create: {
        memberId: 'TEST-001',
        qrCodeId: 'QR-TEST-001',
        fullName: 'Test User',
        phoneNumber: '09171234567',
        emailAddress: 'test@revision.ph',
        pinCodeHash: await bcrypt.hash('1234', 10),
        walletBalance: 1000.0,
        totalLifetimeEarnings: 1000.0,
        ecoPoints: 500,
        co2ReducedKg: 2.5
      }
    });

    console.log('✅ Test user seeded:', testUser.memberId);
    console.log('✅ Database initialization complete');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
