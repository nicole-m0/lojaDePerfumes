-- Fase 4 (Mercado Pago) — mudança ADITIVA e segura, sem perda de dados.
-- `providerStatus`: status cru do gateway visto por último (idempotência + auditoria).
-- Índice único (provider, providerPaymentId): garante 1 Payment por pagamento do
-- gateway. NULLs são distintos no Postgres, então Payments manuais (provider e
-- providerPaymentId nulos) não colidem entre si.

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "providerStatus" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_providerPaymentId_key" ON "Payment"("provider", "providerPaymentId");
