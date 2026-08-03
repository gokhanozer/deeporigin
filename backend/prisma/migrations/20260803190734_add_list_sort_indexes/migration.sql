-- CreateIndex
CREATE INDEX "links_createdAt_id_idx" ON "links"("createdAt" DESC, "id");

-- CreateIndex
CREATE INDEX "links_visitCount_id_idx" ON "links"("visitCount" DESC, "id");

-- CreateIndex
CREATE INDEX "links_lastVisitedAt_id_idx" ON "links"("lastVisitedAt" DESC, "id");
