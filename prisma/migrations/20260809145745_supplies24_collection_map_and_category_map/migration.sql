/*
  Warnings:

  - You are about to drop the column `collectionId` on the `Supplies24CategoryMap` table. All the data in the column will be lost.
  - You are about to drop the column `collectionTitle` on the `Supplies24CategoryMap` table. All the data in the column will be lost.
  - You are about to drop the column `previousCollectionId` on the `Supplies24CategoryMap` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "Supplies24CollectionMap" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "categoryText" TEXT NOT NULL,
    "collectionId" TEXT,
    "collectionTitle" TEXT,
    "previousCollectionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Supplies24CategoryMap" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "categoryText" TEXT NOT NULL,
    "productType" TEXT,
    "taxonomyCategoryId" TEXT,
    "taxonomyCategoryName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Supplies24CategoryMap" ("categoryText", "createdAt", "id", "shop") SELECT "categoryText", "createdAt", "id", "shop" FROM "Supplies24CategoryMap";
DROP TABLE "Supplies24CategoryMap";
ALTER TABLE "new_Supplies24CategoryMap" RENAME TO "Supplies24CategoryMap";
CREATE UNIQUE INDEX "Supplies24CategoryMap_shop_categoryText_key" ON "Supplies24CategoryMap"("shop", "categoryText");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Supplies24CollectionMap_shop_categoryText_key" ON "Supplies24CollectionMap"("shop", "categoryText");
