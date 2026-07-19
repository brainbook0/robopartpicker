-- Rebuild the derived FTS index. Canonical records remain the source of truth.
DELETE FROM search_index;

INSERT INTO search_index (entity_type, entity_id, title, body, tags)
SELECT 'component', c.id, c.name, COALESCE(c.summary, '') || ' ' || COALESCE(m.name, ''), c.category
FROM components c LEFT JOIN manufacturers m ON m.id = c.manufacturer_id WHERE c.deleted_at IS NULL;
INSERT INTO search_index (entity_type, entity_id, title, body, tags)
SELECT 'manufacturer', id, name, COALESCE(description, ''), COALESCE(headquarters_region, '') FROM manufacturers;
INSERT INTO search_index (entity_type, entity_id, title, body, tags)
SELECT 'supplier', id, name, COALESCE(description, ''), '' FROM suppliers;
INSERT INTO search_index (entity_type, entity_id, title, body, tags)
SELECT 'offer', so.id, COALESCE(s.name, '') || ' offer for ' || COALESCE(c.name, ''),
  COALESCE(so.supplier_sku, '') || ' ' || COALESCE(so.product_url, ''), COALESCE(so.region_code, '')
FROM supplier_offers so JOIN suppliers s ON s.id = so.supplier_id JOIN components c ON c.id = so.component_id;
INSERT INTO search_index (entity_type, entity_id, title, body, tags)
SELECT 'project', p.id, p.name, COALESCE(p.summary, '') || ' ' || COALESCE(p.description, ''), COALESCE(json_extract(pv.rpps_json, '$.tags'), '')
FROM projects p LEFT JOIN project_versions pv ON pv.id = p.current_version_id WHERE p.deleted_at IS NULL;
INSERT INTO search_index (entity_type, entity_id, title, body, tags)
SELECT 'build', id, name, status, visibility FROM builds WHERE deleted_at IS NULL;
INSERT INTO search_index (entity_type, entity_id, title, body, tags)
SELECT 'marketplace', id, title, description, category || ' ' || listing_type FROM marketplace_listings WHERE deleted_at IS NULL;
INSERT INTO search_index (entity_type, entity_id, title, body, tags)
SELECT 'community', id, title, body, tags_json FROM forum_threads;

CREATE TRIGGER search_components_insert AFTER INSERT ON components BEGIN
  INSERT INTO search_index (entity_type, entity_id, title, body, tags) VALUES ('component', NEW.id, NEW.name, COALESCE(NEW.summary, ''), NEW.category);
END;
CREATE TRIGGER search_components_update AFTER UPDATE ON components BEGIN
  DELETE FROM search_index WHERE entity_type = 'component' AND entity_id = OLD.id;
  INSERT INTO search_index (entity_type, entity_id, title, body, tags)
    SELECT 'component', NEW.id, NEW.name, COALESCE(NEW.summary, '') || ' ' || COALESCE(m.name, ''), NEW.category
    FROM manufacturers m WHERE m.id = NEW.manufacturer_id
    UNION ALL SELECT 'component', NEW.id, NEW.name, COALESCE(NEW.summary, ''), NEW.category WHERE NEW.manufacturer_id IS NULL;
END;
CREATE TRIGGER search_components_delete AFTER DELETE ON components BEGIN
  DELETE FROM search_index WHERE entity_type = 'component' AND entity_id = OLD.id;
END;

CREATE TRIGGER search_manufacturers_insert AFTER INSERT ON manufacturers BEGIN
  INSERT INTO search_index (entity_type, entity_id, title, body, tags) VALUES ('manufacturer', NEW.id, NEW.name, COALESCE(NEW.description, ''), COALESCE(NEW.headquarters_region, ''));
END;
CREATE TRIGGER search_manufacturers_update AFTER UPDATE ON manufacturers BEGIN
  DELETE FROM search_index WHERE entity_type = 'manufacturer' AND entity_id = OLD.id;
  INSERT INTO search_index (entity_type, entity_id, title, body, tags) VALUES ('manufacturer', NEW.id, NEW.name, COALESCE(NEW.description, ''), COALESCE(NEW.headquarters_region, ''));
END;
CREATE TRIGGER search_manufacturers_delete AFTER DELETE ON manufacturers BEGIN
  DELETE FROM search_index WHERE entity_type = 'manufacturer' AND entity_id = OLD.id;
END;

CREATE TRIGGER search_suppliers_insert AFTER INSERT ON suppliers BEGIN
  INSERT INTO search_index (entity_type, entity_id, title, body, tags) VALUES ('supplier', NEW.id, NEW.name, COALESCE(NEW.description, ''), '');
END;
CREATE TRIGGER search_suppliers_update AFTER UPDATE ON suppliers BEGIN
  DELETE FROM search_index WHERE entity_type = 'supplier' AND entity_id = OLD.id;
  INSERT INTO search_index (entity_type, entity_id, title, body, tags) VALUES ('supplier', NEW.id, NEW.name, COALESCE(NEW.description, ''), '');
END;
CREATE TRIGGER search_suppliers_delete AFTER DELETE ON suppliers BEGIN
  DELETE FROM search_index WHERE entity_type = 'supplier' AND entity_id = OLD.id;
END;

CREATE TRIGGER search_offers_insert AFTER INSERT ON supplier_offers BEGIN
  INSERT INTO search_index (entity_type, entity_id, title, body, tags)
    SELECT 'offer', NEW.id, s.name || ' offer for ' || c.name, COALESCE(NEW.supplier_sku, '') || ' ' || COALESCE(NEW.product_url, ''), COALESCE(NEW.region_code, '')
    FROM suppliers s JOIN components c ON c.id = NEW.component_id WHERE s.id = NEW.supplier_id;
END;
CREATE TRIGGER search_offers_update AFTER UPDATE ON supplier_offers BEGIN
  DELETE FROM search_index WHERE entity_type = 'offer' AND entity_id = OLD.id;
  INSERT INTO search_index (entity_type, entity_id, title, body, tags)
    SELECT 'offer', NEW.id, s.name || ' offer for ' || c.name, COALESCE(NEW.supplier_sku, '') || ' ' || COALESCE(NEW.product_url, ''), COALESCE(NEW.region_code, '')
    FROM suppliers s JOIN components c ON c.id = NEW.component_id WHERE s.id = NEW.supplier_id;
END;
CREATE TRIGGER search_offers_delete AFTER DELETE ON supplier_offers BEGIN
  DELETE FROM search_index WHERE entity_type = 'offer' AND entity_id = OLD.id;
END;

CREATE TRIGGER search_projects_insert AFTER INSERT ON projects BEGIN
  INSERT INTO search_index (entity_type, entity_id, title, body, tags) VALUES ('project', NEW.id, NEW.name, '', '');
END;
CREATE TRIGGER search_projects_update AFTER UPDATE ON projects BEGIN
  DELETE FROM search_index WHERE entity_type = 'project' AND entity_id = OLD.id;
  INSERT INTO search_index (entity_type, entity_id, title, body, tags)
    SELECT 'project', NEW.id, NEW.name, COALESCE(NEW.summary, '') || ' ' || COALESCE(NEW.description, ''), COALESCE(json_extract(pv.rpps_json, '$.tags'), '')
    FROM project_versions pv WHERE pv.id = NEW.current_version_id
    UNION ALL SELECT 'project', NEW.id, NEW.name, '', '' WHERE NEW.current_version_id IS NULL;
END;
CREATE TRIGGER search_projects_delete AFTER DELETE ON projects BEGIN
  DELETE FROM search_index WHERE entity_type = 'project' AND entity_id = OLD.id;
END;

CREATE TRIGGER search_builds_insert AFTER INSERT ON builds BEGIN
  INSERT INTO search_index (entity_type, entity_id, title, body, tags) VALUES ('build', NEW.id, NEW.name, NEW.status, NEW.visibility);
END;
CREATE TRIGGER search_builds_update AFTER UPDATE ON builds BEGIN
  DELETE FROM search_index WHERE entity_type = 'build' AND entity_id = OLD.id;
  INSERT INTO search_index (entity_type, entity_id, title, body, tags) VALUES ('build', NEW.id, NEW.name, NEW.status, NEW.visibility);
END;
CREATE TRIGGER search_builds_delete AFTER DELETE ON builds BEGIN
  DELETE FROM search_index WHERE entity_type = 'build' AND entity_id = OLD.id;
END;

CREATE TRIGGER search_marketplace_insert AFTER INSERT ON marketplace_listings BEGIN
  INSERT INTO search_index (entity_type, entity_id, title, body, tags) VALUES ('marketplace', NEW.id, NEW.title, NEW.description, NEW.category || ' ' || NEW.listing_type);
END;
CREATE TRIGGER search_marketplace_update AFTER UPDATE ON marketplace_listings BEGIN
  DELETE FROM search_index WHERE entity_type = 'marketplace' AND entity_id = OLD.id;
  INSERT INTO search_index (entity_type, entity_id, title, body, tags) VALUES ('marketplace', NEW.id, NEW.title, NEW.description, NEW.category || ' ' || NEW.listing_type);
END;
CREATE TRIGGER search_marketplace_delete AFTER DELETE ON marketplace_listings BEGIN
  DELETE FROM search_index WHERE entity_type = 'marketplace' AND entity_id = OLD.id;
END;

CREATE TRIGGER search_forum_insert AFTER INSERT ON forum_threads BEGIN
  INSERT INTO search_index (entity_type, entity_id, title, body, tags) VALUES ('community', NEW.id, NEW.title, NEW.body, NEW.tags_json);
END;
CREATE TRIGGER search_forum_update AFTER UPDATE ON forum_threads BEGIN
  DELETE FROM search_index WHERE entity_type = 'community' AND entity_id = OLD.id;
  INSERT INTO search_index (entity_type, entity_id, title, body, tags) VALUES ('community', NEW.id, NEW.title, NEW.body, NEW.tags_json);
END;
CREATE TRIGGER search_forum_delete AFTER DELETE ON forum_threads BEGIN
  DELETE FROM search_index WHERE entity_type = 'community' AND entity_id = OLD.id;
END;
