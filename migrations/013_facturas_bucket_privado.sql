-- Migration 013: Cerrar fuga del bucket `facturas` (hallazgo storage advisor)
-- Fecha: 2026-06-05
--
-- PROBLEMA (CRÍTICO):
-- El bucket `facturas` estaba `public = true` y `subirPDF()` guardaba los PDFs
-- con paths SECUENCIALES (`{año}/{numero}.pdf`, ej. 2026/1.pdf, 2026/2.pdf).
-- Como bucket público sirve por URL sin auth, cualquiera podía descargar TODA la
-- facturación iterando el número:
--   https://<proj>.supabase.co/storage/v1/object/public/facturas/2026/1.pdf
-- Los PDFs contienen datos de clientes, montos y datos bancarios. Fuga total.
-- Además la policy `facturas_public_read` (SELECT a public) permitía enumerar
-- todo el inventario del bucket (advisor lint 0025).
--
-- Hoy el riesgo es FUTURO: subirPDF()/actualizarPdfUrl() son dead code (sin
-- callers); los PDFs se ven vía print.html (render live). Pero al cablear la
-- Fase 4B (SendGrid/PDF) esto quedaría expuesto. Se endurece ahora.
--
-- FIX:
--   1. Bucket → privado (public = false) + límites (10 MB, solo application/pdf).
--   2. Drop de la policy SELECT pública; SELECT pasa a admin-only.
--   3. (en código) subirPDF guarda el PATH en facturas.pdf_url; el acceso se hace
--      con signed URLs on-demand (urlFirmadaPDF → createSignedUrl), nunca URL
--      pública. Ver panel/invoices/js/invoices-api.js.

UPDATE storage.buckets
SET public = false,
    file_size_limit = 10485760,                 -- 10 MB
    allowed_mime_types = ARRAY['application/pdf']
WHERE id = 'facturas';

-- Quitar el SELECT público (permitía listar/enumerar y servir sin auth)
DROP POLICY IF EXISTS "facturas_public_read 8gkbnf_0" ON storage.objects;

-- SELECT (descarga vía API / signed URL) solo para admin/owner/superadmin
CREATE POLICY facturas_admin_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'facturas' AND tiene_acceso_admin());

-- INSERT/UPDATE/DELETE ya eran admin-only (facturas_admin_upload / _manage).
