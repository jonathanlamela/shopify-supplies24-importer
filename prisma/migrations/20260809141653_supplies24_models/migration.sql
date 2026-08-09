-- CreateTable
CREATE TABLE "Supplies24Setting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "downloadUrl" TEXT,
    "apiKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Supplies24Recharge" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "min" REAL NOT NULL,
    "max" REAL NOT NULL,
    "profit" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Supplies24CategoryMap" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "categoryText" TEXT NOT NULL,
    "collectionId" TEXT,
    "collectionTitle" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Supplies24Offer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "internalCode" TEXT,
    "reference" TEXT,
    "ean13" TEXT,
    "manufacturer" TEXT,
    "name" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "price" REAL NOT NULL DEFAULT 0,
    "wholesalePrice" REAL NOT NULL DEFAULT 0,
    "descriptionShort" TEXT,
    "category" TEXT,
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "productId" TEXT,
    "dateAdd" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Supplies24ImportRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "summary" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplies24Setting_shop_key" ON "Supplies24Setting"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Supplies24CategoryMap_shop_categoryText_key" ON "Supplies24CategoryMap"("shop", "categoryText");

-- CreateIndex
CREATE INDEX "Supplies24Offer_shop_executed_idx" ON "Supplies24Offer"("shop", "executed");

-- CreateIndex
CREATE INDEX "Supplies24Offer_shop_internalCode_idx" ON "Supplies24Offer"("shop", "internalCode");

-- CreateIndex
CREATE INDEX "Supplies24Offer_shop_ean13_idx" ON "Supplies24Offer"("shop", "ean13");
