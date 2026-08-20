-- Meta's Embedded Signup FINISH event hands back a business_id
-- alongside waba_id/phone_number_id -- capturing it means catalog
-- creation (POST /{business_id}/owned_product_catalogs) never needs
-- the business_management permission, which has proven unreliable to
-- get granted on the token even after adding it to the login config.
ALTER TABLE whatsapp_config ADD COLUMN IF NOT EXISTS business_id TEXT;
