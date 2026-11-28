-- Enforce polymorphic XOR target on favorites: either a file or a folder, never both or neither.
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_target_xor_check" CHECK (
  ("targetType" = 'FILE' AND "fileId" IS NOT NULL AND "folderId" IS NULL) OR
  ("targetType" = 'FOLDER' AND "folderId" IS NOT NULL AND "fileId" IS NULL)
);
