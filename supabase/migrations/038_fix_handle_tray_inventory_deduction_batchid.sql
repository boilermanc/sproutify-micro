-- Migration: Fix handle_tray_inventory_deduction function to use correct batchid column
-- Description: Updates the function to only reference batchid (not batch_id) from seedbatches table

CREATE OR REPLACE FUNCTION handle_tray_inventory_deduction()
RETURNS TRIGGER AS $$
DECLARE
  r_rec RECORD;
  b_rec RECORD;
  seed_needed_grams NUMERIC;
  batch_qty_grams NUMERIC;
  batch_threshold_grams NUMERIC;
  medium_supply_rec RECORD;
  medium_needed NUMERIC;
  medium_needed_grams NUMERIC;
  supply_stock_grams NUMERIC;
  new_supply_stock NUMERIC;
BEGIN
  SELECT seed_quantity, seed_quantity_unit, media_supply_id, media_amount, media_unit, recipe_name, variety_id
  INTO r_rec
  FROM recipes
  WHERE recipe_id = NEW.recipe_id;

  -- Seed deduction (only if batch provided and recipe has seed quantity)
  IF NEW.batch_id IS NOT NULL AND r_rec.seed_quantity IS NOT NULL THEN
    SELECT *, batchid AS bid
    INTO b_rec
    FROM seedbatches
    WHERE batchid = NEW.batch_id
      AND (farm_uuid IS NULL OR farm_uuid = NEW.farm_uuid)
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Seed batch % not found for farm %', NEW.batch_id, NEW.farm_uuid;
    END IF;

    seed_needed_grams := convert_to_grams_numeric(r_rec.seed_quantity, COALESCE(r_rec.seed_quantity_unit, 'grams'));
    batch_qty_grams := convert_to_grams_numeric(b_rec.quantity, COALESCE(b_rec.unit, 'grams'));

    IF seed_needed_grams IS NULL OR batch_qty_grams IS NULL THEN
      RAISE EXCEPTION 'Cannot convert seed units for batch %', NEW.batch_id;
    END IF;

    IF batch_qty_grams < seed_needed_grams THEN
      RAISE EXCEPTION 'Not enough seed in batch %, need %g, have %g', NEW.batch_id, seed_needed_grams, batch_qty_grams;
    END IF;

    batch_qty_grams := batch_qty_grams - seed_needed_grams;

    UPDATE seedbatches
    SET quantity = convert_from_grams_numeric(batch_qty_grams, COALESCE(b_rec.unit, 'grams')),
        status = CASE WHEN batch_qty_grams <= 0 THEN 'depleted' ELSE COALESCE(b_rec.status, 'active') END,
        is_active = CASE WHEN batch_qty_grams <= 0 THEN FALSE ELSE COALESCE(b_rec.is_active, TRUE) END
    WHERE batchid = NEW.batch_id;

    batch_threshold_grams := convert_to_grams_numeric(COALESCE(b_rec.low_stock_threshold, b_rec.reorderlevel, 0), COALESCE(b_rec.unit, 'grams'));

    IF batch_qty_grams <= 0 THEN
      INSERT INTO notifications (farm_uuid, user_id, type, title, message, link, is_read)
      VALUES (NEW.farm_uuid, NEW.created_by, 'low_stock', 'Out of Stock Alert', format('Seed batch %s for recipe %s is out of stock', NEW.batch_id, COALESCE(r_rec.recipe_name, '')), '/supplies', FALSE);
    ELSIF batch_threshold_grams IS NOT NULL AND batch_threshold_grams > 0 AND batch_qty_grams <= batch_threshold_grams THEN
      INSERT INTO notifications (farm_uuid, user_id, type, title, message, link, is_read)
      VALUES (NEW.farm_uuid, NEW.created_by, 'low_stock', 'Low Seed Alert', format('Seed batch %s is running low', NEW.batch_id), '/supplies', FALSE);
    END IF;
  END IF;

  -- Growing medium deduction (optional per recipe)
  IF r_rec.media_supply_id IS NOT NULL AND r_rec.media_amount IS NOT NULL THEN
    SELECT *
    INTO medium_supply_rec
    FROM supplies
    WHERE supply_id = r_rec.media_supply_id
      AND (farm_uuid = NEW.farm_uuid OR farm_uuid IS NULL)
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Growing medium supply % not found for farm %', r_rec.media_supply_id, NEW.farm_uuid;
    END IF;

    IF medium_supply_rec.unit IS NULL OR r_rec.media_unit IS NULL OR lower(medium_supply_rec.unit) = lower(r_rec.media_unit) THEN
      medium_needed := r_rec.media_amount;
      IF medium_supply_rec.stock IS NULL OR medium_supply_rec.stock < medium_needed THEN
        RAISE EXCEPTION 'Not enough growing medium in supply %', medium_supply_rec.supply_id;
      END IF;

      UPDATE supplies
      SET stock = GREATEST(0, medium_supply_rec.stock - medium_needed)
      WHERE supply_id = r_rec.media_supply_id;

      medium_supply_rec.stock := GREATEST(0, medium_supply_rec.stock - medium_needed);
    ELSE
      medium_needed_grams := convert_to_grams_numeric(r_rec.media_amount, r_rec.media_unit);
      supply_stock_grams := convert_to_grams_numeric(medium_supply_rec.stock, medium_supply_rec.unit);

      IF medium_needed_grams IS NULL OR supply_stock_grams IS NULL THEN
        RAISE EXCEPTION 'Cannot convert units for growing medium supply %', medium_supply_rec.supply_id;
      END IF;

      IF supply_stock_grams < medium_needed_grams THEN
        RAISE EXCEPTION 'Not enough growing medium in supply %', medium_supply_rec.supply_id;
      END IF;

      new_supply_stock := supply_stock_grams - medium_needed_grams;

      UPDATE supplies
      SET stock = convert_from_grams_numeric(new_supply_stock, medium_supply_rec.unit)
      WHERE supply_id = r_rec.media_supply_id;

      medium_supply_rec.stock := convert_from_grams_numeric(new_supply_stock, medium_supply_rec.unit);
    END IF;

    IF medium_supply_rec.low_stock_threshold IS NULL THEN
      medium_supply_rec.low_stock_threshold := 10;
    END IF;

    IF medium_supply_rec.stock <= 0 THEN
      INSERT INTO notifications (farm_uuid, user_id, type, title, message, link, is_read)
      VALUES (NEW.farm_uuid, NEW.created_by, 'low_stock', 'Out of Stock Alert', format('%s is out of stock', medium_supply_rec.supply_name), '/supplies', FALSE);
    ELSIF medium_supply_rec.stock <= medium_supply_rec.low_stock_threshold THEN
      INSERT INTO notifications (farm_uuid, user_id, type, title, message, link, is_read)
      VALUES (NEW.farm_uuid, NEW.created_by, 'low_stock', 'Low Stock Alert', format('%s is running low', medium_supply_rec.supply_name), '/supplies', FALSE);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION handle_tray_inventory_deduction() IS 'Trigger function to deduct seed and growing medium inventory when trays are created. Fixed to use batchid (not batch_id) from seedbatches table.';










