-- CreateTable
CREATE TABLE "PricingPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SUBSCRIPTION',
    "credits" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "paypalPlanId" TEXT,
    "intervalMonths" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "creditsAmount" INTEGER NOT NULL,
    "paypalId" TEXT,
    "planId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaymentTransaction_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PricingPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "paypalSubscriptionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodStart" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" DATETIME,
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PricingPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceFee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "creditsEquivalent" INTEGER NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceFee_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSubscription_userId_key" ON "UserSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceFee_bookingId_key" ON "ServiceFee"("bookingId");
