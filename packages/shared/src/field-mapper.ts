/**
 * Field Mapper — Universal Entity Model (UEM) field transformation engine.
 *
 * Pure functions only: no I/O, no side effects, no randomness.
 * `applyFieldMap` with identical inputs always returns structurally equivalent output.
 *
 * UEM canonical entity types (sourced from uem.ts UEM_OBJECT_KINDS):
 *   organization, branch, department, person, user, document, asset, task, notification, event
 *
 * Reserved top-level fields (cannot be overwritten by a field map rule):
 *   sourceSystem, sourceEntity, sourceRecordId, businessId, retrievedAt, mappingVersion, _extensions
 */

// ─── UEM canonical paths ────────────────────────────────────────────────────

/**
 * Canonical UEM field paths accepted as `targetUemField` values.
 * Top-level object keys + dotted sub-paths for nested structures.
 * Unknown paths are allowed as warnings and stored in `_extensions`.
 */
export const UEM_CANONICAL_FIELDS: ReadonlySet<string> = new Set([
  // ── shared across all entity types ──
  'id',
  'kind',
  'name',
  'status',
  'branchId',
  'departmentId',
  'createdAt',
  'updatedAt',
  'meta',
  // ── person / user ──
  'email',
  'phoneNumber',
  'fullName',
  'firstName',
  'lastName',
  'jobTitle',
  'employeeCode',
  'dateOfBirth',
  'gender',
  'nationalId',
  'address',
  'address.street',
  'address.city',
  'address.country',
  'address.postalCode',
  'isActive',
  'roleLabel',
  // ── financial / document ──
  'amount',
  'currency',
  'dueDate',
  'invoiceNumber',
  'referenceNumber',
  'paymentDate',
  'paymentMethod',
  'taxAmount',
  'discountAmount',
  'lineItems',
  // ── product / inventory ──
  'sku',
  'barcode',
  'unitPrice',
  'quantity',
  'unitOfMeasure',
  'category',
  'reorderLevel',
  'warehouseId',
  // ── task / approval ──
  'priority',
  'dueAt',
  'assignedTo',
  'completedAt',
  'approvalStatus',
  'requestedBy',
  'approvedBy',
  // ── event / notification ──
  'title',
  'body',
  'severity',
  'eventType',
  'sourceRef',
  'read',
  // ── organization / branch / department ──
  'code',
  'parentId',
  'timezone',
  'locale',
  'currencyCode',
  // ── asset ──
  'assetTag',
  'serialNumber',
  'purchaseDate',
  'warrantyExpiry',
  'location',
]);

/** Reserved top-level fields that a field map rule must never overwrite. */
export const UEM_RESERVED_FIELDS: ReadonlySet<string> = new Set([
  'sourceSystem',
  'sourceEntity',
  'sourceRecordId',
  'businessId',
  'retrievedAt',
  'mappingVersion',
  '_extensions',
]);

// ─── Types ───────────────────────────────────────────────────────────────────

export type FieldTransformType =
  | 'rename'
  | 'type_cast'
  | 'trim'
  | 'normalize'
  | 'default_value'
  | 'date_format'
  | 'string_compose'
  | 'string_split';

export interface FieldMapEntry {
  /** Source field key in the incoming record. */
  sourceField: string;
  /** Canonical UEM target field path (dot-notation for nested). Unknown paths go to _extensions. */
  targetUemField: string;
  transform: FieldTransformType;
  /** Transform-specific parameters. */
  params?: Record<string, string | number | boolean>;
}

export interface NormalizedRecord {
  /** connector_id of the source system. */
  sourceSystem: string;
  /** Entity type name from the source (e.g. "Invoice", "Employee"). */
  sourceEntity: string;
  /** Original primary key from the source record. */
  sourceRecordId: string;
  /** organization_id of the owning business. */
  businessId: string;
  /**
   * ISO 8601 UTC timestamp from the EIP clock, NOT from the source record.
   * Always taken from `meta.retrievedAt` — never derived from source data.
   */
  retrievedAt: string;
  mappingVersion: number;
  /** Mapped UEM fields. */
  data: Record<string, unknown>;
  /** Source fields that had no matching canonical UEM path. */
  _extensions?: Record<string, unknown>;
}

export type FieldMapWarningCode =
  | 'unknown_uem_field'
  | 'reserved_field'
  | 'type_mismatch'
  | 'required_field_missing';

export interface FieldMapWarning {
  field: string;
  code: FieldMapWarningCode;
  message: string;
}

// ─── Transform implementations ───────────────────────────────────────────────

/**
 * Apply a single transform to a raw value.
 * Returns the transformed value, or `undefined` if the source field was absent
 * and no default is provided.
 *
 * All transforms are pure — same inputs → same output, no side effects.
 */
function applyTransform(
  value: unknown,
  transform: FieldTransformType,
  params: Record<string, string | number | boolean> = {},
): unknown {
  switch (transform) {
    case 'rename':
      // Identity — value is moved to a different key by the caller.
      return value;

    case 'type_cast': {
      const targetType = params['targetType'];
      if (value === undefined || value === null) return value;
      if (targetType === 'string') return String(value);
      if (targetType === 'number') {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
      }
      if (targetType === 'boolean') {
        if (typeof value === 'boolean') return value;
        const s = String(value).toLowerCase().trim();
        if (s === 'true' || s === '1' || s === 'yes') return true;
        if (s === 'false' || s === '0' || s === 'no') return false;
        return null;
      }
      if (targetType === 'integer') {
        const n = parseInt(String(value), 10);
        return Number.isFinite(n) ? n : null;
      }
      // Unknown targetType — return as-is
      return value;
    }

    case 'trim': {
      if (typeof value === 'string') return value.trim();
      return value;
    }

    case 'normalize': {
      // Normalize a string: trim + collapse internal whitespace + apply case transform.
      if (typeof value !== 'string') return value;
      const normalized = value.trim().replace(/\s+/g, ' ');
      const caseMode = params['case'];
      if (caseMode === 'lower') return normalized.toLowerCase();
      if (caseMode === 'upper') return normalized.toUpperCase();
      if (caseMode === 'title') {
        return normalized.replace(/\b\w/g, (c) => c.toUpperCase());
      }
      return normalized;
    }

    case 'default_value': {
      // Provide a default when the source value is absent, null, or empty string.
      if (value === undefined || value === null || value === '') {
        return params['value'] ?? null;
      }
      return value;
    }

    case 'date_format': {
      // Attempt to parse the value as a date and reformat it.
      if (value === undefined || value === null || value === '') return value;
      const raw = String(value);
      const inputFormat = String(params['inputFormat'] ?? 'iso');
      const outputFormat = String(params['outputFormat'] ?? 'iso');

      let dateMs: number | null = null;

      if (inputFormat === 'iso' || inputFormat === 'auto') {
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) dateMs = d.getTime();
      } else if (inputFormat === 'unix_s') {
        const n = Number(raw);
        if (Number.isFinite(n)) dateMs = n * 1000;
      } else if (inputFormat === 'unix_ms') {
        const n = Number(raw);
        if (Number.isFinite(n)) dateMs = n;
      } else if (inputFormat === 'dd/mm/yyyy') {
        const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) {
          const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
          if (!Number.isNaN(d.getTime())) dateMs = d.getTime();
        }
      } else if (inputFormat === 'mm/dd/yyyy') {
        const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) {
          const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
          if (!Number.isNaN(d.getTime())) dateMs = d.getTime();
        }
      }

      if (dateMs === null) {
        // Unparseable — return original value unchanged
        return raw;
      }

      const date = new Date(dateMs);
      if (outputFormat === 'iso') return date.toISOString();
      if (outputFormat === 'date') return date.toISOString().slice(0, 10);
      if (outputFormat === 'unix_s') return Math.floor(dateMs / 1000);
      if (outputFormat === 'unix_ms') return dateMs;
      if (outputFormat === 'yyyy-mm-dd') return date.toISOString().slice(0, 10);
      if (outputFormat === 'dd/mm/yyyy') {
        const dd = String(date.getUTCDate()).padStart(2, '0');
        const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
        const yyyy = date.getUTCFullYear();
        return `${dd}/${mm}/${yyyy}`;
      }
      // Fallback — ISO
      return date.toISOString();
    }

    case 'string_compose': {
      // Compose a string from a template with `{field}` placeholders.
      // `params.template` is evaluated against `params` values only (pure).
      // The caller is responsible for pre-populating `params` with source values.
      const template = String(params['template'] ?? '');
      return template.replace(/\{(\w+)\}/g, (_, key: string) => {
        const v = params[key];
        return v !== undefined ? String(v) : '';
      });
    }

    case 'string_split': {
      // Split a string by a delimiter and return one part by index.
      if (typeof value !== 'string') return value;
      const delimiter = String(params['delimiter'] ?? ',');
      const index = Number(params['index'] ?? 0);
      const parts = value.split(delimiter);
      const part = parts[Number.isFinite(index) ? index : 0];
      return part !== undefined ? (params['trim'] !== false ? part.trim() : part) : null;
    }
  }
}

/**
 * Set a value at a dot-notation path within a plain object.
 * Creates intermediate objects as needed.
 * Pure: returns a new nested path without mutating ancestors beyond the target key.
 */
function setPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (
      current[key] === undefined ||
      current[key] === null ||
      typeof current[key] !== 'object'
    ) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

// ─── string_compose special handling ─────────────────────────────────────────

/**
 * For `string_compose`, we need all source-field values in scope.
 * This resolves a compose entry by injecting source fields as params.
 */
function applyStringCompose(
  source: Record<string, unknown>,
  entry: FieldMapEntry,
): unknown {
  const template = String(entry.params?.['template'] ?? '');
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    // Priority: explicit param override, then source record field
    const paramVal = entry.params?.[key];
    if (paramVal !== undefined) return String(paramVal);
    const srcVal = source[key];
    return srcVal !== undefined && srcVal !== null ? String(srcVal) : '';
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Apply a field map to a single source record.
 *
 * - Pure function: same inputs always yield structurally equivalent output.
 * - `retrievedAt` is always taken from `meta.retrievedAt` — never from source data.
 * - Unknown UEM target fields are stored in `_extensions` rather than causing errors.
 * - Reserved field names in `targetUemField` are silently skipped (caller is warned by `validateFieldMap`).
 */
export function applyFieldMap(
  source: Record<string, unknown>,
  fieldMap: FieldMapEntry[],
  meta: {
    sourceSystem: string;
    sourceEntity: string;
    sourceRecordId: string;
    businessId: string;
    retrievedAt: string;
    mappingVersion: number;
  },
): NormalizedRecord {
  const data: Record<string, unknown> = {};
  const extensions: Record<string, unknown> = {};

  for (const entry of fieldMap) {
    // Skip reserved field targets silently — validateFieldMap flags these as warnings.
    if (UEM_RESERVED_FIELDS.has(entry.targetUemField)) continue;

    const rawValue = Object.prototype.hasOwnProperty.call(source, entry.sourceField)
      ? source[entry.sourceField]
      : undefined;

    let transformed: unknown;

    if (entry.transform === 'string_compose') {
      transformed = applyStringCompose(source, entry);
    } else {
      transformed = applyTransform(rawValue, entry.transform, entry.params ?? {});
    }

    // Route to data or _extensions based on UEM canonical path membership
    if (UEM_CANONICAL_FIELDS.has(entry.targetUemField)) {
      setPath(data, entry.targetUemField, transformed);
    } else {
      // Non-canonical path → _extensions
      setPath(extensions, entry.targetUemField, transformed);
    }
  }

  // Carry forward unmapped source fields that were not covered by any rule
  const mappedSourceFields = new Set(fieldMap.map((e) => e.sourceField));
  for (const [key, val] of Object.entries(source)) {
    if (!mappedSourceFields.has(key)) {
      extensions[key] = val;
    }
  }

  const result: NormalizedRecord = {
    sourceSystem: meta.sourceSystem,
    sourceEntity: meta.sourceEntity,
    sourceRecordId: meta.sourceRecordId,
    businessId: meta.businessId,
    retrievedAt: meta.retrievedAt, // always EIP clock — never from source
    mappingVersion: meta.mappingVersion,
    data,
  };

  if (Object.keys(extensions).length > 0) {
    result._extensions = extensions;
  }

  return result;
}

/**
 * Validate a field map against the UEM canonical schema.
 *
 * Does NOT throw — returns an array of `FieldMapWarning` for callers to inspect.
 * Duplicate entries, reserved-field abuse, and unknown UEM paths are all reported here.
 */
export function validateFieldMap(fieldMap: FieldMapEntry[]): FieldMapWarning[] {
  const warnings: FieldMapWarning[] = [];

  const seenTargets = new Map<string, number>(); // targetUemField → first-seen index

  for (let i = 0; i < fieldMap.length; i++) {
    const entry = fieldMap[i];

    // 1. Reserved field abuse
    if (UEM_RESERVED_FIELDS.has(entry.targetUemField)) {
      warnings.push({
        field: entry.targetUemField,
        code: 'reserved_field',
        message: `"${entry.targetUemField}" is a reserved NormalizedRecord field and cannot be mapped to.`,
      });
      continue; // No further checks for reserved fields
    }

    // 2. Unknown UEM path (not in canonical set)
    if (!UEM_CANONICAL_FIELDS.has(entry.targetUemField)) {
      warnings.push({
        field: entry.targetUemField,
        code: 'unknown_uem_field',
        message: `"${entry.targetUemField}" is not a recognised canonical UEM field path. It will be stored in _extensions.`,
      });
    }

    // 3. Duplicate target (same targetUemField appears more than once)
    if (seenTargets.has(entry.targetUemField)) {
      const firstIdx = seenTargets.get(entry.targetUemField)!;
      warnings.push({
        field: entry.targetUemField,
        code: 'type_mismatch',
        message: `"${entry.targetUemField}" is targeted by more than one mapping rule (rules ${firstIdx} and ${i}). The last rule wins.`,
      });
    } else {
      seenTargets.set(entry.targetUemField, i);
    }

    // 4. type_cast: warn when targetType is missing or unrecognised
    if (entry.transform === 'type_cast') {
      const validTargetTypes = new Set(['string', 'number', 'boolean', 'integer']);
      const targetType = entry.params?.['targetType'];
      if (!targetType || !validTargetTypes.has(String(targetType))) {
        warnings.push({
          field: entry.sourceField,
          code: 'type_mismatch',
          message: `type_cast entry for "${entry.sourceField}" has an unrecognised or missing targetType "${String(targetType ?? '')}". Supported: string, number, boolean, integer.`,
        });
      }
    }

    // 5. string_compose: warn when template is missing
    if (entry.transform === 'string_compose') {
      if (!entry.params?.['template']) {
        warnings.push({
          field: entry.sourceField,
          code: 'type_mismatch',
          message: `string_compose entry for target "${entry.targetUemField}" is missing the required "template" parameter.`,
        });
      }
    }

    // 6. string_split: warn when delimiter is missing
    if (entry.transform === 'string_split') {
      if (entry.params?.['delimiter'] === undefined) {
        warnings.push({
          field: entry.sourceField,
          code: 'type_mismatch',
          message: `string_split entry for target "${entry.targetUemField}" has no "delimiter" param; defaulting to ",".`,
        });
      }
    }
  }

  return warnings;
}
