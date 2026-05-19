-- =============================================
-- MIGRACION V11: Prevent double-tap pago inserts
-- Ejecutar en Supabase SQL Editor (una sola vez)
-- =============================================
-- Bloquea inserts de pagos con mismo (entrega_id, monto, forma_pago,
-- registrado_por) dentro de los últimos 10 segundos.
-- Defensa-en-profundidad contra el bug TOCTOU de Pagos.confirmar:
-- el cliente ya tiene guard (Pagos._inflight Set + btn.disabled inmediato
-- en pagos.js desde v27), pero el trigger blinda contra cualquier caller
-- futuro o llamadas directas a la REST API.
-- =============================================
-- Safe to re-run: usa CREATE OR REPLACE + DROP IF EXISTS.
-- Para revertir: DROP TRIGGER trg_prevent_pago_double_tap ON pagos;
--                DROP FUNCTION prevent_pago_double_tap();
-- =============================================


CREATE OR REPLACE FUNCTION prevent_pago_double_tap()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pagos
    WHERE entrega_id = NEW.entrega_id
      AND monto = NEW.monto
      AND forma_pago = NEW.forma_pago
      AND registrado_por = NEW.registrado_por
      AND fecha > (NOW() - INTERVAL '10 seconds')
  ) THEN
    RAISE EXCEPTION 'Pago duplicado detectado (mismo monto/forma/usuario en los últimos 10 segundos). Si fue intencional, esperá 10s y reintentá.'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_pago_double_tap ON pagos;
CREATE TRIGGER trg_prevent_pago_double_tap
  BEFORE INSERT ON pagos
  FOR EACH ROW
  EXECUTE FUNCTION prevent_pago_double_tap();
