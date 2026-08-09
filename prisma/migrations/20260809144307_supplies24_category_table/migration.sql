-- CreateTable
CREATE TABLE "Supplies24Category" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "categoryText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplies24Category_shop_categoryText_key" ON "Supplies24Category"("shop", "categoryText");
