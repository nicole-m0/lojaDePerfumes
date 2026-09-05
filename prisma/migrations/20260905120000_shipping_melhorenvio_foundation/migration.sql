-- Fase 5 — Frete (Melhor Envio).
-- 1) Product ganha dados físicos para cotação de frete (peso em gramas,
--    dimensoes em centimetros). NOT NULL com DEFAULT: produtos ja existentes
--    recebem os defaults seguros automaticamente.
-- 2) Nova tabela ShippingQuote: snapshot imutavel da opcao de frete recotada
--    no servidor e escolhida no checkout. 1:1 com Order, independente de Shipment.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "heightCm" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "lengthCm" INTEGER NOT NULL DEFAULT 16,
ADD COLUMN     "weightGrams" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "widthCm" INTEGER NOT NULL DEFAULT 11;

-- CreateTable
CREATE TABLE "ShippingQuote" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "originZip" TEXT NOT NULL,
    "destZip" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'melhorenvio',
    "serviceCode" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "deliveryDaysMin" INTEGER,
    "deliveryDaysMax" INTEGER,
    "packageWeightGrams" INTEGER NOT NULL,
    "packageHeightCm" INTEGER NOT NULL,
    "packageWidthCm" INTEGER NOT NULL,
    "packageLengthCm" INTEGER NOT NULL,
    "quotedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShippingQuote_orderId_key" ON "ShippingQuote"("orderId");

-- CreateIndex
CREATE INDEX "ShippingQuote_provider_idx" ON "ShippingQuote"("provider");

-- AddForeignKey
ALTER TABLE "ShippingQuote" ADD CONSTRAINT "ShippingQuote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
