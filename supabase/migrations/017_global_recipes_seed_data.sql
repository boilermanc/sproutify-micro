-- Migration: Global Recipes Seed Data
-- Description: Inserts all 20 global recipe templates with their steps

-- ============================================
-- Step Description IDs and Colors Reference:
-- 1  = Seeding         #D2B48C (tan)
-- 2  = Soaking         #ADD8E6 (light blue)
-- 3  = Germination     #FFFFE0 (light yellow)
-- 4  = Growing         #90EE90 (light green)
-- 5  = Blackout        #D3D3D3 (light gray)
-- 6  = Filtered Light  #B0E0E6 (powder blue)
-- 7  = Nutrient App    #FFDAB9 (peach)
-- 8  = Harvesting      #FFC0CB (pink)
-- 9  = Cleaning        #E6E6FA (lavender)
-- 10 = Resting         #E0FFFF (light cyan)
-- 11 = Pre-sprouting   #F5DEB3 (wheat) - added in 016 migration
-- ============================================

-- ============================================
-- 1. ARUGULA
-- ============================================
INSERT INTO global_recipes (recipe_name, variety_name, description, notes)
VALUES (
    'Arugula',
    'Arugula',
    'Peppery flavor, popular for salads and sandwiches. Relatively easy to grow but sensitive to direct light.',
    'Use indirect light after blackout to prevent burning.'
);

INSERT INTO global_steps (global_recipe_id, step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color)
SELECT
    (SELECT global_recipe_id FROM global_recipes WHERE recipe_name = 'Arugula'),
    step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color
FROM (VALUES
    ('Seed Trays', 1, 'Seeding', 1, 1, 'Hours', 'Sow seeds evenly on the growing medium.', '#D2B48C'),
    ('Blackout', 5, 'Blackout', 2, 5, 'Days', 'Keep the tray in complete darkness for 4-6 days. This encourages stems to elongate.', '#D3D3D3'),
    ('Germination', 3, 'Germination', 3, 3, 'Days', 'Expect to see sprouts within 3 days.', '#FFFFE0'),
    ('Grow', 4, 'Growing', 4, 4, 'Days', 'Expose to indirect light. Direct light can cause burning.', '#90EE90'),
    ('Harvest', 8, 'Harvesting', 5, 0, 'Days', 'Harvest at around 10 days when leaves are well-developed.', '#FFC0CB')
) AS t(step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color);

-- ============================================
-- 2. BASIL (GENOVESE) - MUCILAGINOUS
-- ============================================
INSERT INTO global_recipes (recipe_name, variety_name, description, notes)
VALUES (
    'Basil (Genovese)',
    'Basil',
    'Intense, classic basil flavor. Mucilaginous seed requiring specific care.',
    'Do NOT soak - mucilaginous seeds form gel coating. Keep consistently damp through misting.'
);

INSERT INTO global_steps (global_recipe_id, step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color)
SELECT
    (SELECT global_recipe_id FROM global_recipes WHERE recipe_name = 'Basil (Genovese)'),
    step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color
FROM (VALUES
    ('Seed Trays', 1, 'Seeding', 1, 1, 'Hours', 'Sow seeds on growing medium. Seeds will form gel-like coating - this is normal.', '#D2B48C'),
    ('Blackout', 5, 'Blackout', 2, 6, 'Days', 'Keep in darkness 4-7 days. Maintain consistently damp environment through regular misting.', '#D3D3D3'),
    ('Germination', 3, 'Germination', 3, 4, 'Days', 'Germination occurs in 3-4 days.', '#FFFFE0'),
    ('Grow', 4, 'Growing', 4, 15, 'Days', 'Provide light for remainder of growth cycle.', '#90EE90'),
    ('Harvest', 8, 'Harvesting', 5, 0, 'Days', 'Harvest at approximately 22 days. Basil is slower-growing.', '#FFC0CB')
) AS t(step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color);

-- ============================================
-- 3. BEET
-- ============================================
INSERT INTO global_recipes (recipe_name, variety_name, description, notes)
VALUES (
    'Beet',
    'Beet',
    'Vibrant red stems and earthy flavor. Soaking and covering with soil are key steps.',
    'Cover seeds with a thin layer of soil after seeding for best results.'
);

INSERT INTO global_steps (global_recipe_id, step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color)
SELECT
    (SELECT global_recipe_id FROM global_recipes WHERE recipe_name = 'Beet'),
    step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color
FROM (VALUES
    ('Soak Seeds', 2, 'Soaking', 1, 6, 'Hours', 'Soak beet seeds in cold water for 4-8 hours.', '#ADD8E6'),
    ('Seed Trays', 1, 'Seeding', 2, 1, 'Hours', 'Spread soaked seeds over growing medium and cover with a thin layer of soil.', '#D2B48C'),
    ('Blackout', 5, 'Blackout', 3, 5, 'Days', 'Stack trays or use blackout dome for 4-5 days.', '#D3D3D3'),
    ('Germination', 3, 'Germination', 4, 4, 'Days', 'Germination occurs within 3-4 days.', '#FFFFE0'),
    ('Grow', 4, 'Growing', 5, 4, 'Days', 'Expose to light after blackout period.', '#90EE90'),
    ('Harvest', 8, 'Harvesting', 6, 0, 'Days', 'Harvest at around 10 days for best flavor and color.', '#FFC0CB')
) AS t(step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color);

-- ============================================
-- 4. BROCCOLI
-- ============================================
INSERT INTO global_recipes (recipe_name, variety_name, description, notes)
VALUES (
    'Broccoli',
    'Broccoli',
    'One of the easiest and fastest-growing varieties. Mild cabbage flavor, packed with nutrients.',
    'Excellent choice for beginners. Very forgiving growing conditions.'
);

INSERT INTO global_steps (global_recipe_id, step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color)
SELECT
    (SELECT global_recipe_id FROM global_recipes WHERE recipe_name = 'Broccoli'),
    step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color
FROM (VALUES
    ('Seed Trays', 1, 'Seeding', 1, 1, 'Hours', 'Sow seeds evenly on the growing medium.', '#D2B48C'),
    ('Blackout', 5, 'Blackout', 2, 3, 'Days', 'Stack trays for 2-3 days to encourage germination and stem elongation.', '#D3D3D3'),
    ('Germination', 3, 'Germination', 3, 3, 'Days', 'Expect sprouts within 2-3 days.', '#FFFFE0'),
    ('Grow', 4, 'Growing', 4, 6, 'Days', 'Expose to light after stacking.', '#90EE90'),
    ('Harvest', 8, 'Harvesting', 5, 0, 'Days', 'Harvest at around 10 days.', '#FFC0CB')
) AS t(step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color);

-- ============================================
-- 5. CABBAGE
-- ============================================
INSERT INTO global_recipes (recipe_name, variety_name, description, notes)
VALUES (
    'Cabbage',
    'Cabbage',
    'Easy to grow with mild flavor. Great base for microgreen salads.',
    'Fast germination makes this a reliable crop.'
);

INSERT INTO global_steps (global_recipe_id, step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color)
SELECT
    (SELECT global_recipe_id FROM global_recipes WHERE recipe_name = 'Cabbage'),
    step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color
FROM (VALUES
    ('Seed Trays', 1, 'Seeding', 1, 1, 'Hours', 'Sow seeds evenly on the growing medium.', '#D2B48C'),
    ('Blackout', 5, 'Blackout', 2, 3, 'Days', 'Stack trays for 2-3 days.', '#D3D3D3'),
    ('Germination', 3, 'Germination', 3, 2, 'Days', 'Cabbage seeds germinate quickly, typically within 1-2 days.', '#FFFFE0'),
    ('Grow', 4, 'Growing', 4, 7, 'Days', 'Provide light for remainder of growth cycle.', '#90EE90'),
    ('Harvest', 8, 'Harvesting', 5, 0, 'Days', 'Harvest at around 10 days.', '#FFC0CB')
) AS t(step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color);

-- ============================================
-- 6. CILANTRO
-- ============================================
INSERT INTO global_recipes (recipe_name, variety_name, description, notes)
VALUES (
    'Cilantro',
    'Cilantro',
    'Intense cilantro flavor. Longer and more erratic germination requiring patience.',
    'Use split seeds for improved germination. Keep environment under 70°F.'
);

INSERT INTO global_steps (global_recipe_id, step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color)
SELECT
    (SELECT global_recipe_id FROM global_recipes WHERE recipe_name = 'Cilantro'),
    step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color
FROM (VALUES
    ('Soak Seeds', 2, 'Soaking', 1, 3, 'Hours', 'Soak seeds for 2-4 hours. Using split seeds can improve germination rates.', '#ADD8E6'),
    ('Seed Trays', 1, 'Seeding', 2, 1, 'Hours', 'Sow seeds on the growing medium.', '#D2B48C'),
    ('Blackout', 5, 'Blackout', 3, 7, 'Days', 'Stack trays for 7 days. Maintain a cool environment, preferably under 70°F.', '#D3D3D3'),
    ('Germination', 3, 'Germination', 4, 10, 'Days', 'Germination is slow and can be erratic, taking 1-2 weeks.', '#FFFFE0'),
    ('Grow', 4, 'Growing', 5, 14, 'Days', 'Expose to light after blackout period.', '#90EE90'),
    ('Harvest', 8, 'Harvesting', 6, 0, 'Days', 'Harvest at 3-4 weeks total.', '#FFC0CB')
) AS t(step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color);

-- ============================================
-- 7. KALE
-- ============================================
INSERT INTO global_recipes (recipe_name, variety_name, description, notes)
VALUES (
    'Kale',
    'Kale',
    'Easy to grow with mild, fresh kale flavor. Popular for salads and smoothies.',
    'Very forgiving crop suitable for beginners.'
);

INSERT INTO global_steps (global_recipe_id, step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color)
SELECT
    (SELECT global_recipe_id FROM global_recipes WHERE recipe_name = 'Kale'),
    step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color
FROM (VALUES
    ('Seed Trays', 1, 'Seeding', 1, 1, 'Hours', 'Sow seeds evenly on the growing medium.', '#D2B48C'),
    ('Blackout', 5, 'Blackout', 2, 3, 'Days', 'Stack trays for 2-3 days.', '#D3D3D3'),
    ('Germination', 3, 'Germination', 3, 3, 'Days', 'Expect sprouts within 2-3 days.', '#FFFFE0'),
    ('Grow', 4, 'Growing', 4, 6, 'Days', 'Provide light for remainder of growth cycle.', '#90EE90'),
    ('Harvest', 8, 'Harvesting', 5, 0, 'Days', 'Harvest at around 10 days.', '#FFC0CB')
) AS t(step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color);

-- ============================================
-- 8. KOHLRABI
-- ============================================
INSERT INTO global_recipes (recipe_name, variety_name, description, notes)
VALUES (
    'Kohlrabi',
    'Kohlrabi',
    'Beautiful purple stems with mild cabbage flavor. Adds color to any dish.',
    'Easy to grow, similar to other brassicas.'
);

INSERT INTO global_steps (global_recipe_id, step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color)
SELECT
    (SELECT global_recipe_id FROM global_recipes WHERE recipe_name = 'Kohlrabi'),
    step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color
FROM (VALUES
    ('Seed Trays', 1, 'Seeding', 1, 1, 'Hours', 'Sow seeds evenly on the growing medium.', '#D2B48C'),
    ('Blackout', 5, 'Blackout', 2, 3, 'Days', 'Stack trays for 2-3 days.', '#D3D3D3'),
    ('Germination', 3, 'Germination', 3, 3, 'Days', 'Expect sprouts within 2-3 days.', '#FFFFE0'),
    ('Grow', 4, 'Growing', 4, 6, 'Days', 'Expose to light.', '#90EE90'),
    ('Harvest', 8, 'Harvesting', 5, 0, 'Days', 'Harvest at around 10 days.', '#FFC0CB')
) AS t(step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color);

-- ============================================
-- 9. MUSTARD
-- ============================================
INSERT INTO global_recipes (recipe_name, variety_name, description, notes)
VALUES (
    'Mustard',
    'Mustard',
    'Fast-growing with spicy flavor. Adds kick to salads and sandwiches.',
    'One of the fastest growing microgreens.'
);

INSERT INTO global_steps (global_recipe_id, step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color)
SELECT
    (SELECT global_recipe_id FROM global_recipes WHERE recipe_name = 'Mustard'),
    step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color
FROM (VALUES
    ('Seed Trays', 1, 'Seeding', 1, 1, 'Hours', 'Sow seeds evenly on the growing medium.', '#D2B48C'),
    ('Blackout', 5, 'Blackout', 2, 4, 'Days', 'Keep tray in darkness for 3-5 days.', '#D3D3D3'),
    ('Germination', 3, 'Germination', 3, 3, 'Days', 'Expect sprouts within 2-3 days.', '#FFFFE0'),
    ('Grow', 4, 'Growing', 4, 5, 'Days', 'Provide light for remainder of growth cycle.', '#90EE90'),
    ('Harvest', 8, 'Harvesting', 5, 0, 'Days', 'Harvest at around 10 days.', '#FFC0CB')
) AS t(step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color);

-- ============================================
-- 10. NASTURTIUM
-- ============================================
INSERT INTO global_recipes (recipe_name, variety_name, description, notes)
VALUES (
    'Nasturtium',
    'Nasturtium',
    'Large, peppery-flavored leaves. Larger seeds benefit from soaking.',
    'Distinctive round leaves make for beautiful presentation.'
);

INSERT INTO global_steps (global_recipe_id, step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color)
SELECT
    (SELECT global_recipe_id FROM global_recipes WHERE recipe_name = 'Nasturtium'),
    step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color
FROM (VALUES
    ('Soak Seeds', 2, 'Soaking', 1, 3, 'Hours', 'Soak large seeds in warm water for 2-4 hours.', '#ADD8E6'),
    ('Seed Trays', 1, 'Seeding', 2, 1, 'Hours', 'Sow soaked seeds on the growing medium.', '#D2B48C'),
    ('Blackout', 5, 'Blackout', 3, 3, 'Days', 'Keep tray in darkness for 2-3 days.', '#D3D3D3'),
    ('Germination', 3, 'Germination', 4, 6, 'Days', 'Germination takes 4-7 days.', '#FFFFE0'),
    ('Grow', 4, 'Growing', 5, 8, 'Days', 'Expose to light after blackout period.', '#90EE90'),
    ('Harvest', 8, 'Harvesting', 6, 0, 'Days', 'Harvest at around 14-16 days.', '#FFC0CB')
) AS t(step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color);

-- ============================================
-- 11. PEA (BASIC/FIELD)
-- ============================================
INSERT INTO global_recipes (recipe_name, variety_name, description, notes)
VALUES (
    'Pea (Basic/Field)',
    'Pea',
    'Sweet, fresh pea flavor. Crunchy and substantial, great as a snack.',
    'Very absorbent seeds - ensure adequate soaking time.'
);

INSERT INTO global_steps (global_recipe_id, step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color)
SELECT
    (SELECT global_recipe_id FROM global_recipes WHERE recipe_name = 'Pea (Basic/Field)'),
    step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color
FROM (VALUES
    ('Soak Seeds', 2, 'Soaking', 1, 9, 'Hours', 'Soak pea seeds for 6-12 hours; they are very absorbent.', '#ADD8E6'),
    ('Pre-sprout', 11, 'Pre-sprouting', 2, 18, 'Hours', 'Place in colander and rinse 2-4 times daily for 12-24 hours until roots emerge.', '#F5DEB3'),
    ('Seed Trays', 1, 'Seeding', 3, 1, 'Hours', 'Spread pre-sprouted seeds on the growing medium.', '#D2B48C'),
    ('Blackout', 5, 'Blackout', 4, 4, 'Days', 'Stack trays for 3-5 days.', '#D3D3D3'),
    ('Germination', 3, 'Germination', 5, 3, 'Days', 'Germination occurs within 2-3 days.', '#FFFFE0'),
    ('Grow', 4, 'Growing', 6, 4, 'Days', 'Expose shoots to light after stacking.', '#90EE90'),
    ('Harvest', 8, 'Harvesting', 7, 0, 'Days', 'Harvest at around 10 days.', '#FFC0CB')
) AS t(step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color);

-- ============================================
-- 12. PEA (TENDRIL)
-- ============================================
INSERT INTO global_recipes (recipe_name, variety_name, description, notes)
VALUES (
    'Pea (Tendril)',
    'Pea',
    'Same growing process as field peas. Prized by chefs for delicate, curly tendrils.',
    'Harvest when tendrils are well-developed for best presentation.'
);

INSERT INTO global_steps (global_recipe_id, step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color)
SELECT
    (SELECT global_recipe_id FROM global_recipes WHERE recipe_name = 'Pea (Tendril)'),
    step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color
FROM (VALUES
    ('Soak Seeds', 2, 'Soaking', 1, 9, 'Hours', 'Soak pea seeds for 6-12 hours; they are very absorbent.', '#ADD8E6'),
    ('Pre-sprout', 11, 'Pre-sprouting', 2, 18, 'Hours', 'Place in colander and rinse 2-4 times daily for 12-24 hours until roots emerge.', '#F5DEB3'),
    ('Seed Trays', 1, 'Seeding', 3, 1, 'Hours', 'Spread pre-sprouted seeds on the growing medium.', '#D2B48C'),
    ('Blackout', 5, 'Blackout', 4, 4, 'Days', 'Stack trays for 3-5 days.', '#D3D3D3'),
    ('Germination', 3, 'Germination', 5, 3, 'Days', 'Germination occurs within 2-3 days.', '#FFFFE0'),
    ('Grow', 4, 'Growing', 6, 4, 'Days', 'Expose shoots to light after stacking.', '#90EE90'),
    ('Harvest', 8, 'Harvesting', 7, 0, 'Days', 'Harvest at around 10 days when tendrils are developed.', '#FFC0CB')
) AS t(step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color);

-- ============================================
-- 13. RADISH (RAMBO)
-- ============================================
INSERT INTO global_recipes (recipe_name, variety_name, description, notes)
VALUES (
    'Radish (Rambo)',
    'Radish',
    'Striking purple color with spicy radish flavor. One of the fastest-growing microgreens.',
    'Can harvest as early as 5 days for maximum crunch.'
);

INSERT INTO global_steps (global_recipe_id, step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color)
SELECT
    (SELECT global_recipe_id FROM global_recipes WHERE recipe_name = 'Radish (Rambo)'),
    step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color
FROM (VALUES
    ('Seed Trays', 1, 'Seeding', 1, 1, 'Hours', 'Sow seeds evenly on the growing medium.', '#D2B48C'),
    ('Blackout', 5, 'Blackout', 2, 3, 'Days', 'Stack trays for 2-3 days.', '#D3D3D3'),
    ('Germination', 3, 'Germination', 3, 2, 'Days', 'Radish seeds germinate very quickly, in 1-2 days.', '#FFFFE0'),
    ('Grow', 4, 'Growing', 4, 7, 'Days', 'Expose to light after stacking.', '#90EE90'),
    ('Harvest', 8, 'Harvesting', 5, 0, 'Days', 'Harvest at 5-12 days. Earlier for crunch, later for more developed flavor.', '#FFC0CB')
) AS t(step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color);

-- ============================================
-- 14. RADISH (TRITON/DAIKON)
-- ============================================
INSERT INTO global_recipes (recipe_name, variety_name, description, notes)
VALUES (
    'Radish (Triton/Daikon)',
    'Radish',
    'Similar spicy flavor and fast growth as Rambo, but with green leaves.',
    'Great alternative to Rambo for variety in color.'
);

INSERT INTO global_steps (global_recipe_id, step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color)
SELECT
    (SELECT global_recipe_id FROM global_recipes WHERE recipe_name = 'Radish (Triton/Daikon)'),
    step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color
FROM (VALUES
    ('Seed Trays', 1, 'Seeding', 1, 1, 'Hours', 'Sow seeds evenly on the growing medium.', '#D2B48C'),
    ('Blackout', 5, 'Blackout', 2, 3, 'Days', 'Stack trays for 2-3 days.', '#D3D3D3'),
    ('Germination', 3, 'Germination', 3, 2, 'Days', 'Radish seeds germinate very quickly, in 1-2 days.', '#FFFFE0'),
    ('Grow', 4, 'Growing', 4, 7, 'Days', 'Expose to light after stacking.', '#90EE90'),
    ('Harvest', 8, 'Harvesting', 5, 0, 'Days', 'Harvest at 5-12 days.', '#FFC0CB')
) AS t(step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color);

-- ============================================
-- 15. SUNFLOWER
-- ============================================
INSERT INTO global_recipes (recipe_name, variety_name, description, notes)
VALUES (
    'Sunflower',
    'Sunflower',
    'Crunchy texture and nutty flavor. Substantial microgreen perfect for salads and snacks.',
    'Use black oil sunflower seeds. Remove hulls before serving if needed.'
);

INSERT INTO global_steps (global_recipe_id, step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color)
SELECT
    (SELECT global_recipe_id FROM global_recipes WHERE recipe_name = 'Sunflower'),
    step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color
FROM (VALUES
    ('Soak Seeds', 2, 'Soaking', 1, 9, 'Hours', 'Soak black oil sunflower seeds in cold water for 6-12 hours.', '#ADD8E6'),
    ('Pre-sprout', 11, 'Pre-sprouting', 2, 18, 'Hours', 'Place in colander, rinse 2-4 times over 12-24 hours until root tails emerge.', '#F5DEB3'),
    ('Seed Trays', 1, 'Seeding', 3, 1, 'Hours', 'Spread pre-sprouted seeds evenly on growing medium.', '#D2B48C'),
    ('Blackout', 5, 'Blackout', 4, 5, 'Days', 'Stack trays 2-3 days, then use blackout dome 2-3 more days.', '#D3D3D3'),
    ('Germination', 3, 'Germination', 5, 3, 'Days', 'Germination occurs within 2-3 days.', '#FFFFE0'),
    ('Grow', 4, 'Growing', 6, 4, 'Days', 'Expose to light after blackout period.', '#90EE90'),
    ('Harvest', 8, 'Harvesting', 7, 0, 'Days', 'Harvest at approximately 10 days total.', '#FFC0CB')
) AS t(step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color);

-- ============================================
-- 16. AMARANTH
-- ============================================
INSERT INTO global_recipes (recipe_name, variety_name, description, notes)
VALUES (
    'Amaranth',
    'Amaranth',
    'Vibrant red color with mild, earthy flavor. Delicate and prefers warmer conditions.',
    'Keep temperatures warm for best results. Handle gently when harvesting.'
);

INSERT INTO global_steps (global_recipe_id, step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color)
SELECT
    (SELECT global_recipe_id FROM global_recipes WHERE recipe_name = 'Amaranth'),
    step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color
FROM (VALUES
    ('Seed Trays', 1, 'Seeding', 1, 1, 'Hours', 'Sow tiny seeds evenly on the growing medium.', '#D2B48C'),
    ('Blackout', 5, 'Blackout', 2, 6, 'Days', 'Keep tray in darkness for 5-6 days.', '#D3D3D3'),
    ('Germination', 3, 'Germination', 3, 3, 'Days', 'Expect sprouts within 2-3 days.', '#FFFFE0'),
    ('Grow', 4, 'Growing', 4, 5, 'Days', 'Provide indirect light after blackout.', '#90EE90'),
    ('Harvest', 8, 'Harvesting', 5, 0, 'Days', 'Harvest at around 12 days.', '#FFC0CB')
) AS t(step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color);

-- ============================================
-- 17. CELERY
-- ============================================
INSERT INTO global_recipes (recipe_name, variety_name, description, notes)
VALUES (
    'Celery',
    'Celery',
    'Strong, sharp celery flavor. Advanced crop due to slow and long germination.',
    'Requires patience - germination can take up to 2 weeks.'
);

INSERT INTO global_steps (global_recipe_id, step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color)
SELECT
    (SELECT global_recipe_id FROM global_recipes WHERE recipe_name = 'Celery'),
    step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color
FROM (VALUES
    ('Seed Trays', 1, 'Seeding', 1, 1, 'Hours', 'Sow seeds evenly on the growing medium.', '#D2B48C'),
    ('Blackout', 5, 'Blackout', 2, 5, 'Days', 'Keep tray in darkness for 4-5 days.', '#D3D3D3'),
    ('Germination', 3, 'Germination', 3, 14, 'Days', 'Be patient - germination can take up to 2 weeks.', '#FFFFE0'),
    ('Grow', 4, 'Growing', 4, 21, 'Days', 'Provide light after germination. Growth takes 2-5 weeks.', '#90EE90'),
    ('Harvest', 8, 'Harvesting', 5, 0, 'Days', 'Harvest 2-5 weeks after germination.', '#FFC0CB')
) AS t(step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color);

-- ============================================
-- 18. CHERVIL
-- ============================================
INSERT INTO global_recipes (recipe_name, variety_name, description, notes)
VALUES (
    'Chervil',
    'Chervil',
    'Delicate anise flavor. Advanced crop due to slow growth.',
    'Popular in French cuisine. Worth the wait for unique flavor.'
);

INSERT INTO global_steps (global_recipe_id, step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color)
SELECT
    (SELECT global_recipe_id FROM global_recipes WHERE recipe_name = 'Chervil'),
    step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color
FROM (VALUES
    ('Seed Trays', 1, 'Seeding', 1, 1, 'Hours', 'Sow seeds evenly on the growing medium.', '#D2B48C'),
    ('Blackout', 5, 'Blackout', 2, 6, 'Days', 'Keep tray in darkness for 5-7 days.', '#D3D3D3'),
    ('Germination', 3, 'Germination', 3, 6, 'Days', 'Germination takes 5-7 days.', '#FFFFE0'),
    ('Grow', 4, 'Growing', 4, 9, 'Days', 'Expose to light after blackout period.', '#90EE90'),
    ('Harvest', 8, 'Harvesting', 5, 0, 'Days', 'Harvest between 14-18 days (range 12-26 days).', '#FFC0CB')
) AS t(step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color);

-- ============================================
-- 19. LETTUCE
-- ============================================
INSERT INTO global_recipes (recipe_name, variety_name, description, notes)
VALUES (
    'Lettuce',
    'Lettuce',
    'Easy to grow with fresh, concentrated lettuce flavor. Great salad base.',
    'Fast-growing and reliable. Perfect for beginners.'
);

INSERT INTO global_steps (global_recipe_id, step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color)
SELECT
    (SELECT global_recipe_id FROM global_recipes WHERE recipe_name = 'Lettuce'),
    step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color
FROM (VALUES
    ('Seed Trays', 1, 'Seeding', 1, 1, 'Hours', 'Sow seeds evenly on the growing medium.', '#D2B48C'),
    ('Blackout', 5, 'Blackout', 2, 3, 'Days', 'Stack trays for 2-3 days.', '#D3D3D3'),
    ('Germination', 3, 'Germination', 3, 3, 'Days', 'Expect sprouts within 2-3 days.', '#FFFFE0'),
    ('Grow', 4, 'Growing', 4, 6, 'Days', 'Provide light for remainder of growth cycle.', '#90EE90'),
    ('Harvest', 8, 'Harvesting', 5, 0, 'Days', 'Harvest at around 10 days.', '#FFC0CB')
) AS t(step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color);

-- ============================================
-- 20. SWISS CHARD
-- ============================================
INSERT INTO global_recipes (recipe_name, variety_name, description, notes)
VALUES (
    'Swiss Chard',
    'Swiss Chard',
    'Colorful stems with mild, spinach-like flavor. Similar to beet microgreens.',
    'Related to beets - same growing technique applies.'
);

INSERT INTO global_steps (global_recipe_id, step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color)
SELECT
    (SELECT global_recipe_id FROM global_recipes WHERE recipe_name = 'Swiss Chard'),
    step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color
FROM (VALUES
    ('Soak Seeds', 2, 'Soaking', 1, 6, 'Hours', 'Soak seeds in cold water for 4-8 hours.', '#ADD8E6'),
    ('Seed Trays', 1, 'Seeding', 2, 1, 'Hours', 'Spread soaked seeds over the growing medium.', '#D2B48C'),
    ('Blackout', 5, 'Blackout', 3, 5, 'Days', 'Stack trays for 4-5 days.', '#D3D3D3'),
    ('Germination', 3, 'Germination', 4, 4, 'Days', 'Germination occurs within 3-4 days.', '#FFFFE0'),
    ('Grow', 4, 'Growing', 5, 4, 'Days', 'Expose to light after blackout period.', '#90EE90'),
    ('Harvest', 8, 'Harvesting', 6, 0, 'Days', 'Harvest at around 10 days.', '#FFC0CB')
) AS t(step_name, description_id, description_name, sequence_order, duration, duration_unit, instructions, step_color);
