-- Seed 43 common microgreen varieties
-- This migration seeds varieties that are farm-agnostic (no farm_uuid)
-- Users can copy these to their farm or use them as templates

-- Note: Since varieties table has farm_uuid as a reference, we'll create a function
-- that can be called to seed varieties for a specific farm

-- Create function to seed default varieties for a farm
CREATE OR REPLACE FUNCTION seed_default_varieties(target_farm_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
    varieties_count INTEGER;
BEGIN
    -- Insert default varieties if they don't already exist for this farm
    INSERT INTO varieties (variety_name, description, farm_uuid, is_active)
    SELECT 
        variety_name,
        description,
        target_farm_uuid,
        TRUE
    FROM (VALUES
        ('Sunflower', 'Black oil sunflower microgreens - nutty and crunchy', target_farm_uuid),
        ('Pea', 'Pea shoots - sweet and tender', target_farm_uuid),
        ('Radish', 'Radish microgreens - spicy and crisp', target_farm_uuid),
        ('Broccoli', 'Broccoli microgreens - mild and nutritious', target_farm_uuid),
        ('Arugula', 'Arugula microgreens - peppery and bold', target_farm_uuid),
        ('Cabbage', 'Cabbage microgreens - mild and crunchy', target_farm_uuid),
        ('Kale', 'Kale microgreens - earthy and nutritious', target_farm_uuid),
        ('Mustard', 'Mustard microgreens - spicy and tangy', target_farm_uuid),
        ('Cilantro', 'Cilantro microgreens - fresh and aromatic', target_farm_uuid),
        ('Basil', 'Basil microgreens - sweet and aromatic', target_farm_uuid),
        ('Beet', 'Beet microgreens - earthy and sweet', target_farm_uuid),
        ('Chard', 'Chard microgreens - mild and colorful', target_farm_uuid),
        ('Amaranth', 'Amaranth microgreens - nutty and colorful', target_farm_uuid),
        ('Buckwheat', 'Buckwheat microgreens - nutty and tender', target_farm_uuid),
        ('Cress', 'Cress microgreens - peppery and crisp', target_farm_uuid),
        ('Fenugreek', 'Fenugreek microgreens - slightly bitter and aromatic', target_farm_uuid),
        ('Mizuna', 'Mizuna microgreens - mild and peppery', target_farm_uuid),
        ('Red Cabbage', 'Red cabbage microgreens - mild and colorful', target_farm_uuid),
        ('Red Amaranth', 'Red amaranth microgreens - nutty and vibrant', target_farm_uuid),
        ('Shiso', 'Shiso microgreens - minty and aromatic', target_farm_uuid),
        ('Sorrel', 'Sorrel microgreens - tangy and lemony', target_farm_uuid),
        ('Tatsoi', 'Tatsoi microgreens - mild and tender', target_farm_uuid),
        ('Wheatgrass', 'Wheatgrass - fresh and nutritious', target_farm_uuid),
        ('Alfalfa', 'Alfalfa microgreens - mild and nutritious', target_farm_uuid),
        ('Clover', 'Clover microgreens - mild and tender', target_farm_uuid),
        ('Lentil', 'Lentil microgreens - nutty and tender', target_farm_uuid),
        ('Mung Bean', 'Mung bean sprouts - crisp and mild', target_farm_uuid),
        ('Adzuki Bean', 'Adzuki bean sprouts - nutty and sweet', target_farm_uuid),
        ('Chickpea', 'Chickpea microgreens - nutty and tender', target_farm_uuid),
        ('Fava Bean', 'Fava bean microgreens - buttery and tender', target_farm_uuid),
        ('Corn', 'Corn microgreens - sweet and tender', target_farm_uuid),
        ('Onion', 'Onion microgreens - mild and aromatic', target_farm_uuid),
        ('Garlic', 'Garlic microgreens - pungent and flavorful', target_farm_uuid),
        ('Leek', 'Leek microgreens - mild and onion-like', target_farm_uuid),
        ('Chives', 'Chives microgreens - mild and onion-like', target_farm_uuid),
        ('Dill', 'Dill microgreens - aromatic and feathery', target_farm_uuid),
        ('Fennel', 'Fennel microgreens - licorice-like and aromatic', target_farm_uuid),
        ('Carrot', 'Carrot microgreens - earthy and sweet', target_farm_uuid),
        ('Celery', 'Celery microgreens - crisp and mild', target_farm_uuid),
        ('Parsley', 'Parsley microgreens - fresh and mild', target_farm_uuid),
        ('Spinach', 'Spinach microgreens - mild and nutritious', target_farm_uuid),
        ('Watercress', 'Watercress microgreens - peppery and crisp', target_farm_uuid),
        ('Kohlrabi', 'Kohlrabi microgreens - mild and crisp', target_farm_uuid)
    ) AS defaults(variety_name, description, farm_uuid)
    WHERE NOT EXISTS (
        SELECT 1 FROM varieties 
        WHERE varieties.variety_name = defaults.variety_name 
        AND varieties.farm_uuid = target_farm_uuid
    );
    
    GET DIAGNOSTICS varieties_count = ROW_COUNT;
    RETURN varieties_count;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION seed_default_varieties IS 'Seeds 43 default microgreen varieties for a specific farm. Returns the number of varieties inserted.';

