-- Create products table
CREATE TABLE IF NOT EXISTS products (
    product_id SERIAL PRIMARY KEY,
    farm_uuid UUID REFERENCES farms(farm_uuid),
    product_name TEXT NOT NULL,
    description TEXT,
    product_type TEXT NOT NULL CHECK (product_type IN ('live', 'packaged')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES profile(id)
);

-- Create product_variants table
CREATE TABLE IF NOT EXISTS product_variants (
    variant_id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(product_id) ON DELETE CASCADE,
    variant_name TEXT NOT NULL,
    size TEXT,
    price NUMERIC(10, 2) NOT NULL,
    unit TEXT DEFAULT 'oz',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create product_recipe_mapping table (links products to recipes/varieties for mix calculator)
CREATE TABLE IF NOT EXISTS product_recipe_mapping (
    mapping_id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(product_id) ON DELETE CASCADE,
    recipe_id INTEGER REFERENCES recipes(recipe_id) ON DELETE CASCADE,
    variety_id INTEGER REFERENCES varieties(varietyid) ON DELETE CASCADE,
    ratio NUMERIC(10, 4) DEFAULT 1.0, -- Ratio of this crop in the product mix
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(product_id, recipe_id, variety_id)
);

-- Create product_mixes table (saved product mix configurations)
CREATE TABLE IF NOT EXISTS product_mixes (
    mix_id SERIAL PRIMARY KEY,
    farm_uuid UUID REFERENCES farms(farm_uuid),
    mix_name TEXT NOT NULL,
    description TEXT,
    mix_config JSONB NOT NULL, -- Stores the mix configuration: {product_id: {recipe_id: ratio, ...}, ...}
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES profile(id)
);

-- Enable Row Level Security
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_recipe_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_mixes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for products
CREATE POLICY "Users can view farm products" ON products
    FOR SELECT USING (farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid()));

CREATE POLICY "Users can manage farm products" ON products
    FOR ALL USING (farm_uuid IN (
        SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
    ));

-- RLS Policies for product_variants
CREATE POLICY "Users can view product variants" ON product_variants
    FOR SELECT USING (
        product_id IN (
            SELECT product_id FROM products 
            WHERE farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid())
        )
    );

CREATE POLICY "Users can manage product variants" ON product_variants
    FOR ALL USING (
        product_id IN (
            SELECT product_id FROM products 
            WHERE farm_uuid IN (
                SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
            )
        )
    );

-- RLS Policies for product_recipe_mapping
CREATE POLICY "Users can view product recipe mappings" ON product_recipe_mapping
    FOR SELECT USING (
        product_id IN (
            SELECT product_id FROM products 
            WHERE farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid())
        )
    );

CREATE POLICY "Users can manage product recipe mappings" ON product_recipe_mapping
    FOR ALL USING (
        product_id IN (
            SELECT product_id FROM products 
            WHERE farm_uuid IN (
                SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
            )
        )
    );

-- RLS Policies for product_mixes
CREATE POLICY "Users can view farm product mixes" ON product_mixes
    FOR SELECT USING (farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid()));

CREATE POLICY "Users can manage farm product mixes" ON product_mixes
    FOR ALL USING (farm_uuid IN (
        SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
    ));

-- Add indexes for performance
CREATE INDEX idx_products_farm_uuid ON products(farm_uuid);
CREATE INDEX idx_products_type ON products(product_type);
CREATE INDEX idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX idx_product_recipe_mapping_product_id ON product_recipe_mapping(product_id);
CREATE INDEX idx_product_recipe_mapping_recipe_id ON product_recipe_mapping(recipe_id);
CREATE INDEX idx_product_recipe_mapping_variety_id ON product_recipe_mapping(variety_id);
CREATE INDEX idx_product_mixes_farm_uuid ON product_mixes(farm_uuid);

