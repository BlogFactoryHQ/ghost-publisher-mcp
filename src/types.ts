export type AuthorRef = {
  id: string;
  name: string;
  slug: string;
};

export type PostRef = {
  id: string;
  title: string;
  slug: string;
  status: string;
  updated_at: string;
  url?: string;
  published_at?: string;
  custom_excerpt?: string;
  tags: string[];
  authors: AuthorRef[];
};

export type PageRef = Omit<PostRef, 'tags' | 'authors'> & { created_at?: string };

export type FailedItem = {
  id?: string;
  title?: string;
  error: string;
};

export type DeployResult = {
  accepted: boolean;
  host: string;
  status: number;
  error?: string;
};

export type BatchResult<T = PostRef> = {
  succeeded: T[];
  failed: FailedItem[];
  partial_failure: boolean;
  deploy?: DeployResult;
};

export type ImageAsset = {
  url: string;
  mime_type: string;
  bytes: number;
  source: 'upload';
};

export type DraftInline = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  link?: string;
};

export type DraftRichText = string | DraftInline[];

export type DraftBlock =
  | { type: 'paragraph'; text: DraftRichText }
  | { type: 'heading'; text: DraftRichText; level?: 2 | 3 }
  | { type: 'list'; items: DraftRichText[]; style?: 'bullet' | 'number'; start?: number }
  | { type: 'quote'; text: DraftRichText }
  | { type: 'codeblock'; code: string; language?: string; caption?: string }
  | {
      type: 'image';
      src: string;
      alt: string;
      caption?: string;
      title?: string;
      width?: number;
      height?: number;
      card_width?: 'regular' | 'wide' | 'full';
      href?: string;
    }
  | {
      type: 'bookmark';
      url: string;
      title: string;
      description?: string;
      author?: string;
      publisher?: string;
      caption?: string;
    }
  | {
      type: 'callout';
      text: string;
      emoji?: string;
      color?: 'white' | 'grey' | 'blue' | 'green' | 'yellow' | 'red' | 'pink' | 'purple' | 'accent';
    }
  | { type: 'button'; text: string; url: string; alignment?: 'left' | 'center' };

export type DraftFields = {
  title: string;
  slug?: string;
  tags?: string[];
  authors?: string[];
  excerpt?: string | null;
  featured?: boolean;
  feature_image_url?: string | null;
  feature_image_alt?: string | null;
  feature_image_caption?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  canonical_url?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image?: string | null;
  twitter_title?: string | null;
  twitter_description?: string | null;
  twitter_image?: string | null;
};

export type DraftInput = DraftFields & { markdown?: string; blocks?: DraftBlock[] };

export type PageInput = Omit<DraftFields, 'tags' | 'authors' | 'featured'> & {
  markdown?: string;
  blocks?: DraftBlock[];
};

export type ChangeScope = 'body' | 'title' | 'slug' | 'taxonomy' | 'feature_image' | 'metadata';

export type ChangeTarget = {
  type: 'post' | 'page';
  id: string;
  updated_at: string;
};

export type ChangeFieldPatch = Partial<DraftFields>;

export type ChangeOperation =
  | { type: 'update_fields'; patch: ChangeFieldPatch }
  | { type: 'replace_body'; markdown: string }
  | { type: 'append_section'; markdown: string }
  | { type: 'prepend_section'; markdown: string }
  | { type: 'replace_exact_text'; find: string; replace: string };

export type ChangeRequest = {
  target: ChangeTarget;
  operation: ChangeOperation;
};

export type ContentSnapshot = Record<string, unknown> & {
  id: string;
  title: string;
  slug: string;
  status: string;
  updated_at: string;
  html: string;
  lexical: string;
};

export type ChangePreviewItem = {
  target: ChangeTarget;
  before_snapshot: ContentSnapshot;
  snapshot_hash: string;
  changed_fields: string[];
  required_scopes: ChangeScope[];
  characters: { before: number; after: number };
  lexical_nodes: Record<string, number>;
  after_lexical_nodes: Record<string, number>;
  removed_nodes: string[];
  protected_nodes: string[];
  warnings: string[];
  can_apply: boolean;
};

export type ChangePreview = {
  changes: ChangePreviewItem[];
  preview_hash: string;
};

export type DiagnosticCertainty = 'confirmed' | 'heuristic';
export type DiagnosticSeverity = 'blocker' | 'warning' | 'info';

export const AUDIT_FINDING_CODES = [
  'CONTENT_LEXICAL_INVALID',
  'CONTENT_EMPTY_BODY',
  'HEADING_LEVEL_SKIP',
  'HEADING_EMPTY',
  'EDITOR_COMPLEX_SCRIPT_START',
  'IMAGE_ALT_MISSING',
  'IMAGE_ALT_EMPTY_DECORATIVE',
  'CARD_TOGGLE_A11Y_REVIEW',
  'CARD_GALLERY_DUPLICATE_PAYLOAD',
  'BOOKMARK_METADATA_INCOMPLETE',
  'BUTTON_LABEL_EMPTY',
  'LINK_URL_INVALID',
  'LINK_TEXT_EMPTY',
  'SOURCES_SECTION_MISSING',
  'META_TITLE_MISSING',
  'META_DESCRIPTION_MISSING',
  'CANONICAL_URL_MISSING',
  'META_TITLE_LENGTH_REVIEW',
  'META_DESCRIPTION_LENGTH_REVIEW',
] as const;
export type AuditFindingCode = (typeof AUDIT_FINDING_CODES)[number];

export type AuditFinding = {
  code: AuditFindingCode;
  severity: DiagnosticSeverity;
  certainty: DiagnosticCertainty;
  message: string;
  evidence: Record<string, unknown>;
  ghost_issue: string | null;
  safe_fix: { available: boolean; reason: string };
};

export const SITE_CHECK_CODES = [
  'SITE_HOMEPAGE_HTTP',
  'SITE_SITEMAP_HTTP',
  'SITE_SITEMAP_CONTENT_TYPE',
  'TARGET_PUBLIC_HTTP',
  'TARGET_TITLE_MARKER',
  'TARGET_CANONICAL_MATCH',
  'ROUTE_EXTENSION_404_GHOST6',
  'SHARE_PORTAL_PREREQUISITE_MISSING',
  'SHARE_INTERACTION_UNVERIFIED',
  'FEATURE_IMAGE_HTTP',
  'FEATURE_IMAGE_CONTENT_TYPE',
] as const;
export type SiteCheckCode = (typeof SITE_CHECK_CODES)[number];

export type SiteHealthCheck = {
  code: SiteCheckCode;
  result: 'pass' | 'warning' | 'fail' | 'unavailable';
  certainty: DiagnosticCertainty;
  target: 'site' | ChangeTarget;
  surface: 'ghost' | 'delivery' | 'shared' | 'media';
  url: string;
  evidence: Record<string, unknown>;
  message: string;
  ghost_issue: string | null;
  suggested_action: string | null;
};

export type SiteHealthReport = {
  site: { title: string; url: string; ghost_version?: string; checked_at: string };
  checks: SiteHealthCheck[];
  summary: Record<'pass' | 'warning' | 'fail' | 'unavailable', number>;
};
