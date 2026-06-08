export const defaultParsedMarkdownPreviewMaxChars = 200_000;

export interface MarkdownPreviewWrite {
  markdown_preview: string;
  markdown_preview_object_key: string;
  markdown_preview_truncated: boolean;
}

export function createMarkdownPreview(
  markdown: string,
  objectKey: string,
  maxChars = defaultParsedMarkdownPreviewMaxChars,
): MarkdownPreviewWrite {
  const truncated = markdown.length > maxChars;

  return {
    markdown_preview: truncated ? markdown.slice(0, maxChars) : markdown,
    markdown_preview_object_key: objectKey,
    markdown_preview_truncated: truncated,
  };
}
