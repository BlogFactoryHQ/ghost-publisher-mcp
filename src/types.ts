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

export type DraftBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string; level?: 2 | 3 }
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
