import { AppError } from "../../http";
import { assertOrganizationPermission } from "../../middleware/authorization";
import { fileContentUrl } from "../../services/file-urls";

export type MarketplaceListingDto = {
  id: string; slug: string; sellerUserId: string | null; organizationId: string | null;
  listingType: "sell" | "wanted" | "service"; title: string; description: string; category: string;
  conditionGrade: "A" | "B" | "C" | "untested" | "for_parts" | "not_applicable" | null;
  currency: string | null; price: number | null; quantity: number; region: string | null;
  status: "draft" | "published" | "reserved" | "sold" | "fulfilled" | "expired" | "withdrawn" | "removed";
  visibility: "private" | "organization" | "unlisted" | "public";
  sourceBuildId: string | null; sourceComponentId: string | null; expiresAt: string | null; version: number;
  isDemo: boolean; createdAt: string; updatedAt: string; publishedAt: string | null;
  seller: { id: string; displayName: string | null; username: string | null; avatarUrl: string | null } | null;
  component: { id: string; slug: string; name: string; category: string } | null;
  images: Array<{ fileId: string; altText: string | null; sortOrder: number; contentUrl: string }>;
  partsCost: number | null;
  partsCostCurrency: string | null;
  partsCostPricedItems: number;
  partsCostTotalItems: number;
  details: { runtimeHours: number | null; provenanceText: string | null; sellerDeclaresTestReport: boolean; sellerDeclaresVideo: boolean; sellerAcceptsReturns: boolean; serialAvailable: boolean };
  saved: boolean;
};

type ListingRow = {
  id: string; slug: string; seller_user_id: string | null; organization_id: string | null; listing_type: MarketplaceListingDto["listingType"];
  title: string; description: string; category: string; condition_grade: MarketplaceListingDto["conditionGrade"];
  currency: string | null; price_minor: number | null; quantity: number; region_code: string | null; status: MarketplaceListingDto["status"];
  visibility: MarketplaceListingDto["visibility"]; source_build_id: string | null; source_component_id: string | null; expires_at: string | null;
  version: number; is_demo: number; created_at: string; updated_at: string; published_at: string | null;
  seller_display_name: string | null; seller_username: string | null; seller_avatar_url: string | null;
  component_slug: string | null; component_name: string | null; component_category: string | null;
  runtime_hours: number | null; provenance_text: string | null; seller_declares_test_report: number | null; seller_declares_video: number | null;
  seller_accepts_returns: number | null; serial_available: number | null; saved: number;
  primary_image_file_id: string | null; primary_image_alt_text: string | null;
  parts_cost_minor: number | null; parts_cost_currency: string | null; parts_cost_priced_items: number; parts_cost_total_items: number;
};

const SELECT_LISTING = `SELECT ml.*, p.display_name AS seller_display_name, p.username AS seller_username, p.avatar_url AS seller_avatar_url,
  c.slug AS component_slug, c.name AS component_name, c.category AS component_category,
  md.runtime_hours, md.provenance_text, md.seller_declares_test_report, md.seller_declares_video,
  md.seller_accepts_returns, md.serial_available,
  (SELECT mli.file_id FROM marketplace_listing_images mli JOIN files image_file ON image_file.id = mli.file_id
    WHERE mli.listing_id = ml.id AND image_file.deleted_at IS NULL AND image_file.status = 'ready' AND image_file.visibility = 'public'
    ORDER BY mli.sort_order LIMIT 1) AS primary_image_file_id,
  (SELECT mli.alt_text FROM marketplace_listing_images mli JOIN files image_file ON image_file.id = mli.file_id
    WHERE mli.listing_id = ml.id AND image_file.deleted_at IS NULL AND image_file.status = 'ready' AND image_file.visibility = 'public'
    ORDER BY mli.sort_order LIMIT 1) AS primary_image_alt_text,
  (SELECT SUM(bi.quantity * CASE WHEN bi.unit_cost_minor IS NOT NULL THEN bi.unit_cost_minor
      WHEN selected_offer.currency = source_build.currency THEN selected_offer.unit_price_minor END)
    FROM build_items bi JOIN builds source_build ON source_build.id = bi.build_id
    LEFT JOIN supplier_offers selected_offer ON selected_offer.id = bi.selected_supplier_offer_id
    WHERE bi.build_id = ml.source_build_id) AS parts_cost_minor,
  (SELECT currency FROM builds WHERE id = ml.source_build_id) AS parts_cost_currency,
  (SELECT COUNT(*) FROM build_items bi JOIN builds source_build ON source_build.id = bi.build_id
    LEFT JOIN supplier_offers selected_offer ON selected_offer.id = bi.selected_supplier_offer_id
    WHERE bi.build_id = ml.source_build_id AND (bi.unit_cost_minor IS NOT NULL
      OR (selected_offer.currency = source_build.currency AND selected_offer.unit_price_minor IS NOT NULL))) AS parts_cost_priced_items,
  (SELECT COUNT(*) FROM build_items bi WHERE bi.build_id = ml.source_build_id) AS parts_cost_total_items`;
const JOINS = `FROM marketplace_listings ml LEFT JOIN profiles p ON p.id = ml.seller_user_id
  LEFT JOIN components c ON c.id = ml.source_component_id
  LEFT JOIN marketplace_listing_details md ON md.listing_id = ml.id`;

export class MarketplaceRepository {
  constructor(private readonly db: D1Database) {}

  async list(userId: string | null, options: { type?: string; q?: string; category?: string; region?: string; condition?: string; sort?: "newest" | "price_asc" | "price_desc" | "parts_cost_asc"; status?: string; mine?: boolean; minPrice?: number; maxPrice?: number; limit: number; offset: number }): Promise<{ items: MarketplaceListingDto[]; total: number }> {
    const values: unknown[] = [];
    const bind = (value: unknown) => { values.push(value); return `?${values.length}`; };
    const clauses = ["ml.deleted_at IS NULL", "ml.is_demo = 0"];
    if (options.mine) {
      clauses.push(userId ? `(ml.seller_user_id = ${bind(userId)} OR EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = ml.organization_id AND om.user_id = ${bind(userId)} AND om.status = 'active'))` : "0");
    } else {
      const publicClause = "(ml.status IN ('published', 'reserved') AND ml.visibility = 'public' AND (ml.expires_at IS NULL OR ml.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))";
      clauses.push(userId ? `(${publicClause} OR ml.seller_user_id = ${bind(userId)} OR EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = ml.organization_id AND om.user_id = ${bind(userId)} AND om.status = 'active'))` : publicClause);
    }
    if (options.type) clauses.push(`ml.listing_type = ${bind(options.type)}`);
    if (options.status && options.mine) clauses.push(`ml.status = ${bind(options.status)}`);
    if (options.category) clauses.push(`ml.category = ${bind(options.category)}`);
    if (options.region) clauses.push(`ml.region_code = ${bind(options.region)}`);
    if (options.condition) clauses.push(`ml.condition_grade = ${bind(options.condition)}`);
    if (options.q) { const term = bind(`%${options.q.toLowerCase()}%`); clauses.push(`(lower(ml.title) LIKE ${term} OR lower(ml.description) LIKE ${term})`); }
    if (options.minPrice !== undefined) clauses.push(`ml.price_minor >= ${bind(Math.round(options.minPrice * 100))}`);
    if (options.maxPrice !== undefined) clauses.push(`ml.price_minor <= ${bind(Math.round(options.maxPrice * 100))}`);
    const where = `WHERE ${clauses.join(" AND ")}`;
    const count = await this.db.prepare(`SELECT COUNT(*) AS total FROM marketplace_listings ml ${where}`).bind(...values).first<{ total: number }>();
    const savedExpression = userId ? `EXISTS (SELECT 1 FROM marketplace_saves ms WHERE ms.listing_id = ml.id AND ms.user_id = ${bind(userId)})` : "0";
    const order = options.sort === "price_asc" ? "ml.price_minor IS NULL, ml.price_minor ASC, ml.updated_at DESC"
      : options.sort === "price_desc" ? "ml.price_minor IS NULL, ml.price_minor DESC, ml.updated_at DESC"
        : options.sort === "parts_cost_asc" ? "parts_cost_minor IS NULL, parts_cost_minor ASC, ml.updated_at DESC"
          : "ml.updated_at DESC";
    const rows = await this.db.prepare(`${SELECT_LISTING}, ${savedExpression} AS saved ${JOINS} ${where}
      ORDER BY ${order} LIMIT ?${values.length + 1} OFFSET ?${values.length + 2}`).bind(...values, options.limit, options.offset).all<ListingRow>();
    return { items: rows.results.map(mapListing), total: Number(count?.total ?? 0) };
  }

  async find(idOrSlug: string, userId: string | null): Promise<{ row: ListingRow; item: MarketplaceListingDto } | null> {
    const saved = userId ? "EXISTS (SELECT 1 FROM marketplace_saves ms WHERE ms.listing_id = ml.id AND ms.user_id = ?2)" : "0";
    const statement = this.db.prepare(`${SELECT_LISTING}, ${saved} AS saved ${JOINS} WHERE ml.deleted_at IS NULL AND ml.is_demo = 0 AND (ml.id = ?1 OR ml.slug = ?1)`);
    const row = userId ? await statement.bind(idOrSlug, userId).first<ListingRow>() : await statement.bind(idOrSlug).first<ListingRow>();
    if (!row) return null;
    const item = mapListing(row);
    item.images = await this.listImages(row.id, userId);
    return { row, item };
  }

  private async listImages(listingId: string, userId: string | null): Promise<MarketplaceListingDto["images"]> {
    const rows = await this.db.prepare(`SELECT mli.file_id, mli.alt_text, mli.sort_order
      FROM marketplace_listing_images mli JOIN files f ON f.id = mli.file_id
      WHERE mli.listing_id = ?1 AND f.deleted_at IS NULL AND f.status = 'ready'
        AND (f.visibility = 'public' OR f.owner_user_id = ?2 OR EXISTS (SELECT 1 FROM organization_members om
          WHERE om.organization_id = f.organization_id AND om.user_id = ?2 AND om.status = 'active'))
      ORDER BY mli.sort_order LIMIT 12`).bind(listingId, userId).all<{ file_id: string; alt_text: string | null; sort_order: number }>();
    return rows.results.map((image) => ({ fileId: image.file_id, altText: image.alt_text, sortOrder: Number(image.sort_order), contentUrl: fileContentUrl(image.file_id) }));
  }

  private async assertSourceBuild(userId: string, sourceBuildId: string): Promise<void> {
    const build = await this.db.prepare(`SELECT b.id FROM builds b WHERE b.id = ?1 AND b.deleted_at IS NULL AND (
      b.owner_user_id = ?2 OR EXISTS (SELECT 1 FROM build_members bm WHERE bm.build_id = b.id AND bm.user_id = ?2 AND bm.role IN ('owner', 'editor'))
      OR EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = b.organization_id AND om.user_id = ?2
        AND om.status = 'active' AND om.role IN ('owner', 'admin', 'engineer', 'builder', 'procurement')))`)
      .bind(sourceBuildId, userId).first();
    if (!build) throw new AppError(403, "SOURCE_BUILD_ACCESS_DENIED", "The selected source build is not available for this listing.");
  }

  async assertWrite(userId: string, row: Pick<ListingRow, "seller_user_id" | "organization_id">): Promise<void> {
    if (row.seller_user_id === userId) return;
    if (row.organization_id) { await assertOrganizationPermission(this.db, userId, row.organization_id, "procure"); return; }
    throw new AppError(403, "LISTING_ACCESS_DENIED", "You cannot modify this listing.");
  }

  async create(userId: string, input: ListingInput): Promise<MarketplaceListingDto> {
    if (input.sourceBuildId) await this.assertSourceBuild(userId, input.sourceBuildId);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const slug = `${slugify(input.title)}-${id.slice(0, 8)}`;
    await this.db.batch([
      this.db.prepare(`INSERT INTO marketplace_listings
        (id, slug, seller_user_id, organization_id, listing_type, title, description, category, condition_grade,
         currency, price_minor, quantity, region_code, status, visibility, source_build_id, source_component_id,
         expires_at, version, is_demo, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'draft', ?14, ?15, ?16, ?17, 1, 0, ?18, ?18)`)
        .bind(id, slug, userId, input.organizationId ?? null, input.listingType, input.title, input.description, input.category,
          input.conditionGrade ?? null, input.currency ?? "USD", input.price == null ? null : Math.round(input.price * 100), input.quantity,
          input.region ?? null, input.visibility, input.sourceBuildId ?? null, input.sourceComponentId ?? null, input.expiresAt ?? null, now),
      this.db.prepare(`INSERT INTO marketplace_listing_details
        (listing_id, runtime_hours, provenance_text, seller_declares_test_report, seller_declares_video, seller_accepts_returns, serial_available, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`)
        .bind(id, input.runtimeHours ?? null, input.provenanceText ?? null, input.sellerDeclaresTestReport ? 1 : 0,
          input.sellerDeclaresVideo ? 1 : 0, input.sellerAcceptsReturns ? 1 : 0, input.serialAvailable ? 1 : 0, now),
      ...(input.sourceComponentId ? [this.db.prepare(`INSERT INTO marketplace_listing_items (id, listing_id, component_id, description, quantity)
        VALUES (?1, ?2, ?3, ?4, ?5)`).bind(crypto.randomUUID(), id, input.sourceComponentId, input.title, input.quantity)] : []),
    ]);
    return (await this.find(id, userId))!.item;
  }

  async update(id: string, userId: string, expectedVersion: number, input: Partial<ListingInput>): Promise<MarketplaceListingDto> {
    const current = await this.find(id, userId);
    if (!current) throw new AppError(404, "LISTING_NOT_FOUND", "Listing not found.");
    await this.assertWrite(userId, current.row);
    if (input.sourceBuildId) await this.assertSourceBuild(userId, input.sourceBuildId);
    const old = current.item;
    if (input.listingType !== undefined && input.listingType !== old.listingType) {
      throw new AppError(422, "LISTING_TYPE_IMMUTABLE", "Marketplace draft type cannot be changed. Open the matching editor for this draft.");
    }
    const now = new Date().toISOString();
    const result = await this.db.prepare(`UPDATE marketplace_listings SET title = ?1, description = ?2, category = ?3,
      condition_grade = ?4, currency = ?5, price_minor = ?6, quantity = ?7, region_code = ?8,
      visibility = ?9, expires_at = ?10, source_build_id = ?11, source_component_id = ?12,
      version = version + 1, updated_at = ?13
      WHERE id = ?14 AND version = ?15 AND status = 'draft'`)
      .bind(input.title ?? old.title, input.description ?? old.description, input.category ?? old.category,
        input.conditionGrade === undefined ? old.conditionGrade : input.conditionGrade, input.currency ?? old.currency,
        input.price === undefined ? (old.price == null ? null : Math.round(old.price * 100)) : input.price == null ? null : Math.round(input.price * 100),
        input.quantity ?? old.quantity, input.region === undefined ? old.region : input.region, input.visibility ?? old.visibility,
        input.expiresAt === undefined ? old.expiresAt : input.expiresAt,
        input.sourceBuildId === undefined ? old.sourceBuildId : input.sourceBuildId,
        input.sourceComponentId === undefined ? old.sourceComponentId : input.sourceComponentId,
        now, current.row.id, expectedVersion).run();
    if (result.meta.changes !== 1) throw new AppError(409, "LISTING_VERSION_CONFLICT", "Only the latest draft version can be updated.");
    await this.db.prepare(`UPDATE marketplace_listing_details SET runtime_hours = ?1, provenance_text = ?2,
      seller_declares_test_report = ?3, seller_declares_video = ?4, seller_accepts_returns = ?5,
      serial_available = ?6, updated_at = ?7 WHERE listing_id = ?8`)
      .bind(input.runtimeHours === undefined ? old.details.runtimeHours : input.runtimeHours,
        input.provenanceText === undefined ? old.details.provenanceText : input.provenanceText,
        (input.sellerDeclaresTestReport ?? old.details.sellerDeclaresTestReport) ? 1 : 0,
        (input.sellerDeclaresVideo ?? old.details.sellerDeclaresVideo) ? 1 : 0,
        (input.sellerAcceptsReturns ?? old.details.sellerAcceptsReturns) ? 1 : 0,
        (input.serialAvailable ?? old.details.serialAvailable) ? 1 : 0, now, current.row.id).run();
    return (await this.find(id, userId))!.item;
  }

  async setStatus(id: string, userId: string, status: MarketplaceListingDto["status"]): Promise<MarketplaceListingDto> {
    const current = await this.find(id, userId);
    if (!current) throw new AppError(404, "LISTING_NOT_FOUND", "Listing not found.");
    await this.assertWrite(userId, current.row);
    if (status === "published" && (!current.item.title || !current.item.description || (current.item.listingType === "sell" && current.item.price == null))) {
      throw new AppError(422, "LISTING_INCOMPLETE", "A sell listing needs a title, description, and price before publishing.");
    }
    const now = new Date().toISOString();
    const statements = [this.db.prepare(`UPDATE marketplace_listings SET status = ?1,
      visibility = CASE WHEN ?1 = 'published' THEN 'public' ELSE visibility END,
      published_at = CASE WHEN ?1 = 'published' AND published_at IS NULL THEN ?2 ELSE published_at END,
      updated_at = ?2, version = version + 1 WHERE id = ?3`).bind(status, now, current.row.id)];
    if (status === "published") {
      statements.push(this.db.prepare(`UPDATE files SET visibility = 'public', updated_at = ?1 WHERE id IN
        (SELECT file_id FROM marketplace_listing_images WHERE listing_id = ?2)`).bind(now, current.row.id));
    }
    await this.db.batch(statements);
    return (await this.find(id, userId))!.item;
  }

  async removeImage(id: string, userId: string, fileId: string): Promise<void> {
    const current = await this.find(id, userId);
    if (!current) throw new AppError(404, "LISTING_NOT_FOUND", "Listing not found.");
    await this.assertWrite(userId, current.row);
    const removed = await this.db.prepare("DELETE FROM marketplace_listing_images WHERE listing_id = ?1 AND file_id = ?2")
      .bind(current.row.id, fileId).run();
    if (Number(removed.meta.changes) !== 1) throw new AppError(404, "LISTING_IMAGE_NOT_FOUND", "Listing image not found.");
  }

  async createInquiry(userId: string, listingId: string, subject: string | null, message: string): Promise<{ id: string; sellerUserId: string; listingTitle: string }> {
    const listing = await this.find(listingId, userId);
    if (!listing || listing.row.status !== "published" || !["public", "unlisted"].includes(listing.row.visibility)) {
      throw new AppError(404, "LISTING_NOT_FOUND", "Published listing not found.");
    }
    if (!listing.row.seller_user_id) throw new AppError(409, "DEMO_LISTING_NO_CONTACT", "Demo listings cannot receive real inquiries.");
    if (listing.row.seller_user_id === userId) throw new AppError(422, "SELF_INQUIRY_NOT_ALLOWED", "You cannot inquire about your own listing.");
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.batch([
      this.db.prepare(`INSERT INTO marketplace_inquiries
        (id, listing_id, buyer_user_id, seller_user_id, subject, status, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, 'open', ?6, ?6)`)
        .bind(id, listing.row.id, userId, listing.row.seller_user_id, subject, now),
      this.db.prepare(`INSERT INTO marketplace_messages (id, inquiry_id, sender_user_id, body, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5)`).bind(crypto.randomUUID(), id, userId, message, now),
    ]);
    return { id, sellerUserId: listing.row.seller_user_id, listingTitle: listing.row.title };
  }

  async listInquiries(userId: string): Promise<Array<Record<string, unknown>>> {
    const rows = await this.db.prepare(`SELECT mi.id, mi.listing_id AS listingId, ml.slug AS listingSlug,
      ml.title AS listingTitle, mi.buyer_user_id AS buyerUserId, mi.seller_user_id AS sellerUserId,
      mi.subject, mi.status, mi.created_at AS createdAt, mi.updated_at AS updatedAt,
      (SELECT body FROM marketplace_messages mm WHERE mm.inquiry_id = mi.id AND mm.deleted_at IS NULL ORDER BY mm.created_at DESC LIMIT 1) AS lastMessage
      FROM marketplace_inquiries mi JOIN marketplace_listings ml ON ml.id = mi.listing_id
      WHERE mi.buyer_user_id = ?1 OR mi.seller_user_id = ?1 ORDER BY mi.updated_at DESC`).bind(userId).all<Record<string, unknown>>();
    return rows.results;
  }

  async inquiry(id: string, userId: string): Promise<{ inquiry: Record<string, unknown>; messages: Array<Record<string, unknown>>; offers: Array<Record<string, unknown>> }> {
    const inquiry = await this.db.prepare(`SELECT mi.id, mi.listing_id AS listingId, ml.slug AS listingSlug,
      ml.title AS listingTitle, mi.buyer_user_id AS buyerUserId, mi.seller_user_id AS sellerUserId,
      mi.subject, mi.status, mi.created_at AS createdAt, mi.updated_at AS updatedAt
      FROM marketplace_inquiries mi JOIN marketplace_listings ml ON ml.id = mi.listing_id
      WHERE mi.id = ?1 AND (mi.buyer_user_id = ?2 OR mi.seller_user_id = ?2)`).bind(id, userId).first<Record<string, unknown>>();
    if (!inquiry) throw new AppError(404, "INQUIRY_NOT_FOUND", "Inquiry not found.");
    const [messages, offers] = await this.db.batch([
      this.db.prepare(`SELECT id, sender_user_id AS senderUserId, body, attachment_file_id AS attachmentFileId, created_at AS createdAt
        FROM marketplace_messages WHERE inquiry_id = ?1 AND deleted_at IS NULL ORDER BY created_at`).bind(id),
      this.db.prepare(`SELECT id, offered_by_user_id AS offeredByUserId, currency, amount_minor / 100.0 AS amount,
        quantity, message, status, expires_at AS expiresAt, created_at AS createdAt, updated_at AS updatedAt
        FROM marketplace_offers WHERE inquiry_id = ?1 ORDER BY created_at`).bind(id),
    ]);
    return { inquiry, messages: messages.results as Array<Record<string, unknown>>, offers: offers.results as Array<Record<string, unknown>> };
  }

  async addMessage(inquiryId: string, userId: string, body: string, attachmentFileId?: string | null): Promise<Record<string, unknown>> {
    await this.inquiry(inquiryId, userId);
    if (attachmentFileId) {
      const allowed = await this.db.prepare(`SELECT id FROM files WHERE id = ?1 AND owner_user_id = ?2 AND status = 'ready' AND deleted_at IS NULL`)
        .bind(attachmentFileId, userId).first();
      if (!allowed) throw new AppError(403, "ATTACHMENT_ACCESS_DENIED", "That attachment is not available to you.");
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.batch([
      this.db.prepare(`INSERT INTO marketplace_messages (id, inquiry_id, sender_user_id, body, attachment_file_id, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)`).bind(id, inquiryId, userId, body, attachmentFileId ?? null, now),
      this.db.prepare("UPDATE marketplace_inquiries SET updated_at = ?1 WHERE id = ?2").bind(now, inquiryId),
    ]);
    return { id, senderUserId: userId, body, attachmentFileId: attachmentFileId ?? null, createdAt: now };
  }

  async createOffer(inquiryId: string, userId: string, input: { currency: string; amount: number; quantity: number; message?: string | null; expiresAt?: string | null; submit: boolean }): Promise<Record<string, unknown>> {
    await this.inquiry(inquiryId, userId);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const status = input.submit ? "submitted" : "draft";
    await this.db.prepare(`INSERT INTO marketplace_offers
      (id, inquiry_id, offered_by_user_id, currency, amount_minor, quantity, message, status, expires_at, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`)
      .bind(id, inquiryId, userId, input.currency, Math.round(input.amount * 100), input.quantity, input.message ?? null, status, input.expiresAt ?? null, now).run();
    return { id, inquiryId, offeredByUserId: userId, ...input, status, createdAt: now, updatedAt: now };
  }

  async updateOfferStatus(offerId: string, userId: string, status: "submitted" | "accepted" | "declined" | "withdrawn"): Promise<void> {
    const offer = await this.db.prepare(`SELECT mo.id, mo.offered_by_user_id, mo.status, mi.buyer_user_id, mi.seller_user_id
      FROM marketplace_offers mo JOIN marketplace_inquiries mi ON mi.id = mo.inquiry_id WHERE mo.id = ?1`)
      .bind(offerId).first<{ id: string; offered_by_user_id: string | null; status: string; buyer_user_id: string | null; seller_user_id: string | null }>();
    if (!offer || (offer.buyer_user_id !== userId && offer.seller_user_id !== userId)) throw new AppError(404, "OFFER_NOT_FOUND", "Offer not found.");
    if (status === "withdrawn" && offer.offered_by_user_id !== userId) throw new AppError(403, "OFFER_UPDATE_DENIED", "Only the sender can withdraw this offer.");
    if (["accepted", "declined"].includes(status) && offer.offered_by_user_id === userId) throw new AppError(403, "OFFER_UPDATE_DENIED", "Only the recipient can accept or decline this offer.");
    await this.db.prepare("UPDATE marketplace_offers SET status = ?1, updated_at = ?2 WHERE id = ?3")
      .bind(status, new Date().toISOString(), offerId).run();
  }
}

export type ListingInput = {
  listingType: "sell" | "wanted" | "service"; title: string; description: string; category: string;
  conditionGrade?: MarketplaceListingDto["conditionGrade"]; currency?: string | null; price?: number | null; quantity: number;
  region?: string | null; visibility: MarketplaceListingDto["visibility"]; organizationId?: string | null;
  sourceBuildId?: string | null; sourceComponentId?: string | null; expiresAt?: string | null;
  runtimeHours?: number | null; provenanceText?: string | null; sellerDeclaresTestReport?: boolean;
  sellerDeclaresVideo?: boolean; sellerAcceptsReturns?: boolean; serialAvailable?: boolean;
};

function mapListing(row: ListingRow): MarketplaceListingDto {
  return {
    id: row.id, slug: row.slug, sellerUserId: row.seller_user_id, organizationId: row.organization_id, listingType: row.listing_type,
    title: row.title, description: row.description, category: row.category, conditionGrade: row.condition_grade,
    currency: row.currency, price: row.price_minor == null ? null : row.price_minor / 100, quantity: row.quantity,
    region: row.region_code, status: row.status, visibility: row.visibility, sourceBuildId: row.source_build_id,
    sourceComponentId: row.source_component_id, expiresAt: row.expires_at, version: row.version, isDemo: row.is_demo === 1,
    createdAt: row.created_at, updatedAt: row.updated_at, publishedAt: row.published_at,
    seller: row.seller_user_id ? { id: row.seller_user_id, displayName: row.seller_display_name, username: row.seller_username, avatarUrl: row.seller_avatar_url } : null,
    component: row.source_component_id && row.component_slug ? { id: row.source_component_id, slug: row.component_slug, name: row.component_name!, category: row.component_category! } : null,
    images: row.primary_image_file_id ? [{ fileId: row.primary_image_file_id, altText: row.primary_image_alt_text, sortOrder: 0, contentUrl: fileContentUrl(row.primary_image_file_id) }] : [],
    partsCost: row.parts_cost_minor == null ? null : Number(row.parts_cost_minor) / 100,
    partsCostCurrency: row.parts_cost_currency,
    partsCostPricedItems: Number(row.parts_cost_priced_items ?? 0),
    partsCostTotalItems: Number(row.parts_cost_total_items ?? 0),
    details: { runtimeHours: row.runtime_hours, provenanceText: row.provenance_text, sellerDeclaresTestReport: row.seller_declares_test_report === 1,
      sellerDeclaresVideo: row.seller_declares_video === 1, sellerAcceptsReturns: row.seller_accepts_returns === 1, serialAvailable: row.serial_available === 1 },
    saved: row.saved === 1,
  };
}

function slugify(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s-]/gu, "").trim().replace(/\s+/gu, "-").replace(/-+/gu, "-").slice(0, 70) || "listing";
}
