// scripts/set-inGuild.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1) Find the most recently created user
  const latest = await prisma.user.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  if (!latest) {
    console.log('No users found.');
    return;
  }

  // 2) Update every other user’s inGuild flag to true
  const result = await prisma.user.updateMany({
    where: { id: { not: latest.id } },
    data: { inGuild: true }
  });

  console.log(
    `Set inGuild=true for ${result.count} users (excluding latest user ${latest.id}).`
  );
}

main()
  .catch((e) => {
    console.error('Script failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });