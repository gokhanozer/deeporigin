-- CreateIndex
CREATE INDEX "links_ownerId_targetUrl_idx" ON "links"("ownerId", "targetUrl");
