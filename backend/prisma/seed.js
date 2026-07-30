require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const users = [
    { email: 'admin@timebank.test', password: 'AdminP@ssw0rd2026!', displayName: 'Ada (Admin)', role: 'ADMIN' },
    { email: 'mediator@timebank.test', password: 'MediateP@ss2026!', displayName: 'Milo (Mediator)', role: 'MEDIATOR' },
    { email: 'alice@timebank.test', password: 'AliceP@ssw0rd2026!', displayName: 'Alice', role: 'MEMBER' },
    { email: 'bob@timebank.test', password: 'BobP@ssword2026!', displayName: 'Bob', role: 'MEMBER' },
  ];

  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 12);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        passwordHash,
        displayName: u.displayName,
        role: u.role,
        emailVerified: true,
        timeCredits: 5,
        skillsOffered: JSON.stringify(u.role === 'MEMBER' ? ['Guitar lessons', 'Excel help'] : []),
      },
    });
  }
  console.log('Seed complete. Demo accounts (email / password):');
  users.forEach((u) => console.log(`  ${u.email} / ${u.password}`));

  // Seed subscription plans
  const plans = [
    {
      name: 'Monthly Premium',
      type: 'SUBSCRIPTION',
      credits: 120,
      priceCents: 1000,
      intervalMonths: 1,
      description: '120 credits every month — $10/mo',
      isActive: true,
    },
    {
      name: 'Yearly Premium',
      type: 'SUBSCRIPTION',
      credits: 1440,
      priceCents: 3000,
      intervalMonths: 12,
      description: '1,440 credits every year (120/mo) — $30/yr',
      isActive: true,
    },
  ];

  for (const plan of plans) {
    const existing = await prisma.pricingPlan.findFirst({ where: { name: plan.name } });
    if (!existing) {
      await prisma.pricingPlan.create({ data: plan });
    }
  }
  console.log('Subscription plans seeded:');
  plans.forEach((p) => console.log(`  ${p.name} — $${p.priceCents / 100}/${p.intervalMonths === 1 ? 'mo' : 'yr'} (${p.credits} credits)`));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => prisma.$disconnect());
